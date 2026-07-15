import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const PLATFORM_FEE_PERCENT = 5;
const STRIPE_SURCHARGE_PERCENT = 3;

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
  try { return new URL(url).origin === "https://fullnessmindset.github.io"; }
  catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `deal-payment:${user.id}`, p_max_requests: 5, p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Too many requests. Please wait a moment." }, 429);

    const { conversation_id, amount_usd, description, success_url, cancel_url } = await req.json();

    if (!conversation_id || !amount_usd || amount_usd < 1) {
      return json({ error: "Missing or invalid parameters" }, 400);
    }
    if (amount_usd > 50000) {
      return json({ error: "Amount exceeds maximum" }, 400);
    }

    // Verify the authenticated user is the brand in this conversation
    const { data: conv, error: convErr } = await supabase
      .from("deal_conversations")
      .select("brand_id, creator_id")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conv || conv.brand_id !== user.id) {
      return json({ error: "Only the brand can send payments" }, 403);
    }

    // Server-side resolution of creator's connect_id — never trust client
    const { data: creatorProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("stripe_connect_id")
      .eq("id", conv.creator_id)
      .single();

    if (profileErr || !creatorProfile || !creatorProfile.stripe_connect_id) {
      return json({ error: "Creator has not connected their Stripe account" }, 400);
    }

    const connectId = creatorProfile.stripe_connect_id;
    const baseCents = Math.round(amount_usd * 100);
    const platformFeeCents = Math.round(baseCents * PLATFORM_FEE_PERCENT / 100);
    const stripeSurchargeCents = Math.round(baseCents * STRIPE_SURCHARGE_PERCENT / 100);
    const totalChargeCents = baseCents + stripeSurchargeCents;
    const applicationFeeCents = platformFeeCents + stripeSurchargeCents;

    const validSuccessUrl = success_url && isValidReturnUrl(success_url) ? success_url : "https://fullnessmindset.github.io/creo/brand-deals.html?status=payment_sent";
    const validCancelUrl = cancel_url && isValidReturnUrl(cancel_url) ? cancel_url : "https://fullnessmindset.github.io/creo/brand-deals.html";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Brand Deal — ${description || "Pago por colaboración"}` },
          unit_amount: totalChargeCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: connectId },
      },
      metadata: {
        type: "brand_deal",
        conversation_id,
        sender_id: user.id,
        creator_id: conv.creator_id,
        creator_connect_id: connectId,
        base_amount_cents: String(baseCents),
        platform_fee_cents: String(platformFeeCents),
        stripe_surcharge_cents: String(stripeSurchargeCents),
      },
      success_url: validSuccessUrl,
      cancel_url: validCancelUrl,
    });

    // Record payment message in deal chat (direct insert — service_role has no auth.uid() for the RPC)
    await supabase.from("deal_messages").insert({
      conversation_id,
      sender_id: user.id,
      content: `Pago de $${amount_usd.toFixed(2)} — ${description || "Colaboración"}`,
      message_type: "payment",
      payment_amount_cents: baseCents,
      payment_status: "pending",
      stripe_session_id: session.id,
    });

    await supabase.from("deal_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return json({ url: session.url });
  } catch (err) {
    console.error("create-deal-payment error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
