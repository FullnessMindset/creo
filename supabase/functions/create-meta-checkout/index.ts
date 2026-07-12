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
      p_key: `meta-checkout:${clientIP}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { creator_connect_id, amount_usd, meta_id, success_url, cancel_url } = await req.json();

    if (!creator_connect_id || !amount_usd || amount_usd < 1 || amount_usd > 10000 || !meta_id) {
      return new Response(JSON.stringify({ error: "Missing or invalid parameters (amount: $1–$10,000)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = Math.round(amount_usd * 100);
    const isPlatform = creator_connect_id === "platform";
    const feeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT / 100);

    const paymentIntentData: any = {};
    if (!isPlatform) {
      paymentIntentData.application_fee_amount = feeCents;
      paymentIntentData.transfer_data = { destination: creator_connect_id };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "Mi Meta — Contribución" },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      payment_intent_data: paymentIntentData,
      metadata: { type: "meta", meta_id, creator_connect_id },
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
