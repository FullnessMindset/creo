import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const PLATFORM_FEE_PERCENT = 5;

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
    // Require auth for subscriptions
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `sub-checkout:${user.id}`, p_max_requests: 5, p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Too many requests. Please wait a moment." }, 429);

    const { creator_id, amount_usd, success_url, cancel_url } = await req.json();

    if (!creator_id || !amount_usd || amount_usd < 3 || amount_usd > 1000) {
      return json({ error: "Missing or invalid parameters (subscription: $3–$1,000/mo)" }, 400);
    }

    // Server-side resolution — never trust client for connect_id
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("stripe_connect_id, stripe_product_id")
      .eq("id", creator_id)
      .single();

    if (profileErr || !profile) return json({ error: "Creator not found" }, 404);

    const connectId = profile.stripe_connect_id;
    const amountCents = Math.round(amount_usd * 100);

    let productId = profile.stripe_product_id;

    if (!productId) {
      const product = await stripe.products.create({
        name: `Apoyo Full — Suscripción mensual`,
        metadata: { creator_id },
      });
      productId = product.id;
      await supabase.from("profiles").update({ stripe_product_id: productId }).eq("id", creator_id);
    }

    let price;
    const existingPrices = await stripe.prices.list({
      product: productId, currency: "usd", type: "recurring", active: true, limit: 100,
    });
    price = existingPrices.data.find(
      (p) => p.unit_amount === amountCents && p.recurring?.interval === "month"
    );
    if (!price) {
      price = await stripe.prices.create({
        product: productId, unit_amount: amountCents, currency: "usd",
        recurring: { interval: "month" },
      });
    }

    const isPlatform = !connectId;
    const subscriptionData: Record<string, unknown> = {};
    if (!isPlatform) {
      subscriptionData.application_fee_percent = PLATFORM_FEE_PERCENT;
      subscriptionData.transfer_data = { destination: connectId };
    }

    const validSuccessUrl = success_url && isValidReturnUrl(success_url) ? success_url : "https://fullnessmindset.github.io/creo/redirect.html?status=success";
    const validCancelUrl = cancel_url && isValidReturnUrl(cancel_url) ? cancel_url : "https://fullnessmindset.github.io/creo/";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: { type: "subscription", creator_id, creator_connect_id: connectId || "platform", subscriber_id: user.id },
      success_url: validSuccessUrl,
      cancel_url: validCancelUrl,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-subscription-checkout error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
