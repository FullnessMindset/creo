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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `sub-checkout:${clientIP}`,
      p_max_requests: 5,
      p_window_seconds: 60,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { creator_connect_id, creator_id, amount_usd, success_url, cancel_url } = await req.json();

    if (!creator_connect_id || !creator_id || !amount_usd || amount_usd < 3 || amount_usd > 1000) {
      return new Response(JSON.stringify({ error: "Missing or invalid parameters (subscription: $3–$1,000/mo)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = Math.round(amount_usd * 100);

    // Look up or create a Stripe Product for this creator
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_product_id")
      .eq("id", creator_id)
      .single();

    let productId = profile?.stripe_product_id;

    if (!productId) {
      const product = await stripe.products.create({
        name: `Apoyo Full — Suscripción mensual`,
        metadata: { creator_id },
      });
      productId = product.id;
      await supabase
        .from("profiles")
        .update({ stripe_product_id: productId })
        .eq("id", creator_id);
    }

    // Reuse existing price for this amount if one exists, otherwise create
    let price;
    const existingPrices = await stripe.prices.list({
      product: productId,
      currency: "usd",
      type: "recurring",
      active: true,
      limit: 100,
    });
    price = existingPrices.data.find(
      (p) => p.unit_amount === amountCents && p.recurring?.interval === "month"
    );
    if (!price) {
      price = await stripe.prices.create({
        product: productId,
        unit_amount: amountCents,
        currency: "usd",
        recurring: { interval: "month" },
      });
    }

    const isPlatform = creator_connect_id === "platform";
    const subscriptionData: any = {};
    if (!isPlatform) {
      subscriptionData.application_fee_percent = PLATFORM_FEE_PERCENT;
      subscriptionData.transfer_data = { destination: creator_connect_id };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: { type: "subscription", creator_id, creator_connect_id },
      success_url: success_url || "https://fullnessmindset.github.io/creo/redirect.html?status=success",
      cancel_url: cancel_url || "https://fullnessmindset.github.io/creo/",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
