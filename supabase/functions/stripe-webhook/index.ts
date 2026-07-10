import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    console.log(`Processing event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const type = metadata.type;

      if (type === "meta" && metadata.meta_id) {
        const amountCents = session.amount_total || 0;
        const { error } = await supabase.rpc("increment_meta_raised", {
          p_meta_id: metadata.meta_id,
          p_amount: amountCents,
        });
        if (error) {
          console.error("Failed to increment meta raised:", error);
        } else {
          console.log(`Meta ${metadata.meta_id} raised by ${amountCents} cents`);
        }

        await supabase.from("meta_contributions").insert({
          meta_id: metadata.meta_id,
          stripe_session_id: session.id,
          amount_cents: amountCents,
          contributor_name: session.customer_details?.name || "Anónimo",
        });
      }

      if (type === "brand_deal" && metadata.conversation_id) {
        const { error } = await supabase.rpc("update_deal_payment_status", {
          p_stripe_session_id: session.id,
          p_status: "completed",
        });
        if (error) {
          console.error("Failed to update deal payment:", error);
        } else {
          console.log(`Brand deal payment completed: ${session.id}`);
        }
      }

      if (type === "tip") {
        console.log(`Tip payment completed: ${session.id}, amount: ${session.amount_total}`);
      }

      if (type === "subscription") {
        console.log(`Subscription created: ${session.id}, creator: ${metadata.creator_id}`);
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as any;
      console.log(`Recurring subscription payment: ${invoice.id}, amount: ${invoice.amount_paid}`);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as any;
      console.log(`Subscription cancelled: ${subscription.id}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
