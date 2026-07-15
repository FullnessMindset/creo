import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const PLATFORM_FEE_PERCENT = 5;
const STRIPE_SURCHARGE_PERCENT = 3;
const ALLOWED_ORIGINS = ["https://fullnessmindset.github.io"];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidReturnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://fullnessmindset.github.io";
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") || ""
    );

    const rateLimitKey = user ? `checkout:${user.id}` : `checkout:anon:${req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown"}`;
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: rateLimitKey,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Too many requests. Please wait a moment." }, 429);

    const { creator_id, creator_username, amount_usd, success_url, cancel_url } = await req.json();

    if (!creator_id || !amount_usd || amount_usd < 1 || amount_usd > 10000) {
      return json({ error: "Missing or invalid parameters (amount: $1–$10,000)" }, 400);
    }

    // Server-side resolution of stripe_connect_id — never trust client
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("stripe_connect_id, username")
      .eq("id", creator_id)
      .single();

    if (profileErr || !profile) return json({ error: "Creator not found" }, 404);

    const connectId = profile.stripe_connect_id;
    const baseCents = Math.round(amount_usd * 100);
    const isPlatform = !connectId;
    const platformFeeCents = Math.round(baseCents * PLATFORM_FEE_PERCENT / 100);
    const stripeSurchargeCents = Math.round(baseCents * STRIPE_SURCHARGE_PERCENT / 100);
    const totalChargeCents = baseCents + stripeSurchargeCents;
    const applicationFeeCents = platformFeeCents + stripeSurchargeCents;

    const paymentIntentData: Record<string, unknown> = {};
    if (!isPlatform) {
      paymentIntentData.application_fee_amount = applicationFeeCents;
      paymentIntentData.transfer_data = { destination: connectId };
    }

    const validSuccessUrl = success_url && isValidReturnUrl(success_url) ? success_url : "https://fullnessmindset.github.io/creo/redirect.html?status=success";
    const validCancelUrl = cancel_url && isValidReturnUrl(cancel_url) ? cancel_url : "https://fullnessmindset.github.io/creo/";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "Yo Creo en Ti — Apoyo único" },
          unit_amount: totalChargeCents,
        },
        quantity: 1,
      }],
      payment_intent_data: paymentIntentData,
      metadata: {
        type: "tip",
        creator_id,
        creator_username: profile.username || creator_username || "",
        creator_connect_id: connectId || "platform",
        base_amount_cents: String(baseCents),
        platform_fee_cents: String(platformFeeCents),
        stripe_surcharge_cents: String(stripeSurchargeCents),
      },
      success_url: validSuccessUrl,
      cancel_url: validCancelUrl,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
