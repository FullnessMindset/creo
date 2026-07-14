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

      // Idempotency: check if this event was already processed
      const { data: existing } = await supabase
        .from("processed_webhook_events")
        .select("id")
        .eq("stripe_event_id", event.id)
        .maybeSingle();

      if (existing) {
        console.log(`Event ${event.id} already processed, skipping`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Record this event as processed
      await supabase.from("processed_webhook_events").insert({
        stripe_event_id: event.id,
        event_type: event.type,
        stripe_session_id: session.id,
        metadata: { type, ...metadata },
      });

      // META CONTRIBUTION
      if (type === "meta" && metadata.meta_id) {
        const amountCents = session.amount_total || 0;
        const { error } = await supabase.rpc("increment_meta_raised", {
          p_meta_id: metadata.meta_id,
          p_amount: amountCents,
        });
        if (error) console.error("Failed to increment meta raised:", error);

        await supabase.from("meta_contributions").insert({
          meta_id: metadata.meta_id,
          stripe_session_id: session.id,
          amount_cents: amountCents,
          contributor_name: session.customer_details?.name || "Anónimo",
        });
      }

      // BRAND DEAL PAYMENT
      if (type === "brand_deal" && metadata.conversation_id) {
        const { error } = await supabase.rpc("update_deal_payment_status", {
          p_stripe_session_id: session.id,
          p_status: "completed",
        });
        if (error) console.error("Failed to update deal payment:", error);
      }

      // TIP
      if (type === "tip") {
        const amountCents = session.amount_total || 0;
        try {
          await supabase.from("tips").insert({
            stripe_session_id: session.id,
            creator_id: metadata.creator_id || null,
            creator_username: metadata.creator_username || null,
            amount_cents: amountCents,
            tipper_name: session.customer_details?.name || "Anónimo",
            tipper_email: session.customer_details?.email || null,
          });
        } catch (_) {}
        console.log(`Tip recorded: ${session.id}, $${(amountCents / 100).toFixed(2)}`);
      }

      // SUBSCRIPTION
      if (type === "subscription") {
        const subscriptionId = (session as unknown as Record<string, unknown>).subscription as string;
        try {
          await supabase.from("subscriptions").insert({
            stripe_session_id: session.id,
            stripe_subscription_id: subscriptionId || null,
            creator_id: metadata.creator_id || null,
            subscriber_email: session.customer_details?.email || null,
            subscriber_name: session.customer_details?.name || "Anónimo",
            amount_cents: session.amount_total || 0,
            status: "active",
          });
        } catch (_) {}
        console.log(`Subscription created: ${session.id}, creator: ${metadata.creator_id}`);
      }
    }

    // RECURRING SUBSCRIPTION PAYMENT
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subId = invoice.subscription as string;
      if (subId) {
        try {
          await supabase
            .from("subscriptions")
            .update({ last_payment_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        } catch (_) {}
      }
    }

    // STRIPE CONNECT ACCOUNT UPDATED — track real onboarding completion
    if (event.type === "account.updated") {
      const account = event.data.object as unknown as Record<string, unknown>;
      const connectId = account.id as string;
      if (connectId && account.details_submitted && account.charges_enabled) {
        try {
          await supabase
            .from("profiles")
            .update({ stripe_onboarded: true })
            .eq("stripe_connect_id", connectId);
          console.log(`Stripe onboarding complete for account: ${connectId}`);
        } catch (_) {}
      }
    }

    // SUBSCRIPTION CANCELLED
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as unknown as Record<string, unknown>;
      const subId = subscription.id as string;
      if (subId) {
        try {
          await supabase
            .from("subscriptions")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        } catch (_) {}
      }
      console.log(`Subscription cancelled: ${subId}`);
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
