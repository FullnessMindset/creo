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
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify JWT auth — the caller must be the brand who owns the conversation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { conversation_id, creator_connect_id, amount_usd, description, success_url, cancel_url } = await req.json();

    if (!conversation_id || !creator_connect_id || !amount_usd || amount_usd < 1) {
      return json({ error: "Missing or invalid parameters" }, 400);
    }

    if (amount_usd > 50000) {
      return json({ error: "Amount exceeds maximum" }, 400);
    }

    const sender_id = user.id;

    // Verify the authenticated user is the brand in this conversation
    const { data: conv, error: convErr } = await supabase
      .from("deal_conversations")
      .select("brand_id, creator_id")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conv || conv.brand_id !== sender_id) {
      return json({ error: "Only the brand can send payments" }, 403);
    }

    const amountCents = Math.round(amount_usd * 100);
    const feeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT / 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Brand Deal — ${description || "Pago por colaboración"}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: creator_connect_id },
      },
      metadata: {
        type: "brand_deal",
        conversation_id,
        sender_id,
        creator_connect_id,
      },
      success_url: success_url || "https://fullnessmindset.github.io/creo/brand-deals.html?status=payment_sent",
      cancel_url: cancel_url || "https://fullnessmindset.github.io/creo/brand-deals.html",
    });

    // Record payment message in encrypted chat
    await supabase.rpc("send_deal_message", {
      p_conversation_id: conversation_id,
      p_sender_id: sender_id,
      p_content: `Pago de $${amount_usd.toFixed(2)} — ${description || "Colaboración"}`,
      p_message_type: "payment",
      p_payment_amount_cents: amountCents,
      p_payment_status: "pending",
    });

    // Store stripe session ID on the latest payment message
    const { data: msgs } = await supabase
      .from("deal_messages")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("message_type", "payment")
      .order("created_at", { ascending: false })
      .limit(1);

    if (msgs && msgs[0]) {
      await supabase
        .from("deal_messages")
        .update({ stripe_session_id: session.id })
        .eq("id", msgs[0].id);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
