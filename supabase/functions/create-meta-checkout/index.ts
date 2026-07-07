import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const PLATFORM_FEE_PERCENT = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { creator_connect_id, amount_usd, meta_id, success_url, cancel_url } = await req.json();

    if (!creator_connect_id || !amount_usd || amount_usd < 1 || !meta_id) {
      return new Response(JSON.stringify({ error: "Missing or invalid parameters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = Math.round(amount_usd * 100);
    const feeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT / 100);

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
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: creator_connect_id },
      },
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
