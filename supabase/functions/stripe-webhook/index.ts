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

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "CREO <noreply@creo.app>";

async function sendTransactionalEmail(to: string, type: string, data: Record<string, string>) {
  if (!RESEND_API_KEY || !to) return;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.error("Email send failed (non-blocking):", e);
  }
}

async function getCreatorEmail(creatorId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("email").eq("id", creatorId).single();
  return data?.email || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });

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

    console.log(`Processing event: ${event.type} (${event.id})`);

    // Idempotency: check if this event was already processed
    const { data: existing } = await supabase
      .from("processed_webhook_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing) {
      console.log(`Event ${event.id} already processed, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // === CHECKOUT SESSION COMPLETED ===
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const type = metadata.type;
      const baseCents = metadata.base_amount_cents ? parseInt(metadata.base_amount_cents) : (session.amount_total || 0);
      const platformFeeCents = metadata.platform_fee_cents ? parseInt(metadata.platform_fee_cents) : Math.round(baseCents * 5 / 100);
      const stripeSurchargeCents = metadata.stripe_surcharge_cents ? parseInt(metadata.stripe_surcharge_cents) : 0;

      if (type === "meta" && metadata.meta_id) {
        const { error } = await supabase.rpc("increment_meta_raised", {
          p_meta_id: metadata.meta_id, p_amount: baseCents,
        });
        if (error) {
          console.error("Failed to increment meta raised:", error);
          return new Response("DB error: meta increment", { status: 500 });
        }

        const { error: insertErr } = await supabase.from("meta_contributions").insert({
          meta_id: metadata.meta_id,
          stripe_session_id: session.id,
          amount_cents: baseCents,
          platform_fee_cents: platformFeeCents,
          stripe_surcharge_cents: stripeSurchargeCents,
          contributor_name: session.customer_details?.name || "Anónimo",
        });
        if (insertErr) {
          console.error("Failed to insert meta contribution:", insertErr);
          return new Response("DB error: meta contribution", { status: 500 });
        }
      }

      if (type === "brand_deal" && metadata.conversation_id) {
        const { error } = await supabase
          .from("deal_messages")
          .update({ payment_status: "completed" })
          .eq("stripe_session_id", session.id);
        if (error) {
          console.error("Failed to update deal payment status:", error);
          return new Response(JSON.stringify({ error: "DB update failed" }), { status: 500 });
        }

        // Notify the creator
        if (metadata.creator_id) {
          await supabase.from("notifications").insert({
            user_id: metadata.creator_id,
            type: "payment",
            title: `💰 Pago de marca recibido: $${(baseCents / 100).toFixed(2)}`,
            body: "Se ha completado un pago de colaboración",
            category: "payment",
            priority: "high",
          });
        }
      }

      if (type === "tip") {
        const { error } = await supabase.from("tips").insert({
          stripe_session_id: session.id,
          creator_id: metadata.creator_id || null,
          creator_username: metadata.creator_username || null,
          amount_cents: baseCents,
          platform_fee_cents: platformFeeCents,
          stripe_surcharge_cents: stripeSurchargeCents,
          tipper_id: metadata.tipper_id || null,
          tipper_name: session.customer_details?.name || "Anónimo",
          tipper_email: session.customer_details?.email || null,
        });
        if (error) {
          console.error("Failed to record tip:", error);
          return new Response("DB error: tip insert", { status: 500 });
        }

        if (metadata.creator_id) {
          await supabase.from("notifications").insert({
            user_id: metadata.creator_id,
            type: "payment",
            title: `💰 Nuevo apoyo: $${(baseCents / 100).toFixed(2)}`,
            body: `${session.customer_details?.name || "Alguien"} te envió un apoyo`,
            category: "payment",
            priority: "high",
          });

          const creatorEmail = await getCreatorEmail(metadata.creator_id);
          if (creatorEmail) {
            sendTransactionalEmail(creatorEmail, "tip_received", {
              amount: (baseCents / 100).toFixed(2),
              supporter_name: session.customer_details?.name || "Alguien",
            });
          }
        }
      }

      if (type === "subscription") {
        const subscriptionId = (session as unknown as Record<string, unknown>).subscription as string;
        const { error } = await supabase.from("subscriptions").insert({
          stripe_session_id: session.id,
          stripe_subscription_id: subscriptionId || null,
          creator_id: metadata.creator_id || null,
          subscriber_id: metadata.subscriber_id || null,
          subscriber_email: session.customer_details?.email || null,
          subscriber_name: session.customer_details?.name || "Anónimo",
          amount_cents: baseCents,
          platform_fee_cents: platformFeeCents,
          stripe_surcharge_cents: stripeSurchargeCents,
          status: "active",
        });
        if (error) {
          console.error("Failed to record subscription:", error);
          return new Response("DB error: subscription insert", { status: 500 });
        }

        if (metadata.creator_id) {
          await supabase.from("notifications").insert({
            user_id: metadata.creator_id,
            type: "payment",
            title: `🎉 Nuevo suscriptor: $${(baseCents / 100).toFixed(2)}/mes`,
            body: `${session.customer_details?.name || "Alguien"} se suscribió a tu Apoyo Full`,
            category: "payment",
            priority: "high",
          });

          const creatorEmail = await getCreatorEmail(metadata.creator_id);
          if (creatorEmail) {
            sendTransactionalEmail(creatorEmail, "subscription_started", {
              amount: (baseCents / 100).toFixed(2),
              supporter_name: session.customer_details?.name || "Alguien",
            });
          }

          // Grant CFH content access for Apoyo Full subscriber
          if (metadata.subscriber_id) {
            await supabase.rpc("cfh_grant_subscriber_access", {
              p_user_id: metadata.subscriber_id,
              p_creator_id: metadata.creator_id,
            });
          }
        }
      }
    }

    // === CHECKOUT SESSION EXPIRED ===
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      if (metadata.type === "brand_deal" && metadata.conversation_id) {
        await supabase
          .from("deal_messages")
          .update({ payment_status: "expired" })
          .eq("stripe_session_id", session.id);
      }
    }

    // === PAYMENT INTENT FAILED ===
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.error(`Payment failed: ${pi.id}, reason: ${pi.last_payment_error?.message}`);
      const metadata = pi.metadata || {};
      if (metadata.creator_id) {
        await supabase.from("notifications").insert({
          user_id: metadata.creator_id,
          type: "warning",
          title: "⚠️ Pago fallido",
          body: "Un pago hacia tu cuenta no se completó",
          category: "payment",
          priority: "normal",
        });
      }
    }

    // === CHARGE REFUNDED ===
    if (event.type === "charge.refunded") {
      const charge = event.data.object as unknown as Record<string, unknown>;
      const piId = charge.payment_intent as string;
      console.log(`Charge refunded: ${charge.id}, payment_intent: ${piId}`);

      await supabase.from("admin_notifications").insert({
        type: "refund",
        title: `Reembolso procesado: $${((charge.amount_refunded as number || 0) / 100).toFixed(2)}`,
        data: { charge_id: charge.id, payment_intent: piId },
      }).catch(() => {});
    }

    // === CHARGE DISPUTE CREATED ===
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as unknown as Record<string, unknown>;
      console.error(`DISPUTE CREATED: ${dispute.id}, amount: ${dispute.amount}, reason: ${dispute.reason}`);

      await supabase.from("admin_notifications").insert({
        type: "dispute",
        title: `⚠️ DISPUTA: $${((dispute.amount as number || 0) / 100).toFixed(2)} — ${dispute.reason}`,
        data: { dispute_id: dispute.id, charge: dispute.charge },
        priority: "urgent",
      }).catch(() => {});
    }

    // === RECURRING SUBSCRIPTION PAYMENT ===
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subId = invoice.subscription as string;
      if (subId) {
        const { error } = await supabase
          .from("subscriptions")
          .update({ last_payment_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subId);
        if (error) console.error("Failed to update subscription payment date:", error);
      }
    }

    // === INVOICE PAYMENT FAILED (subscription renewal failure) ===
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subId = invoice.subscription as string;
      if (subId) {
        const { error } = await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subId);
        if (error) console.error("Failed to update subscription to past_due:", error);
      }
    }

    // === SUBSCRIPTION UPDATED ===
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as unknown as Record<string, unknown>;
      const subId = subscription.id as string;
      const status = subscription.status as string;
      if (subId) {
        const { error } = await supabase
          .from("subscriptions")
          .update({ status })
          .eq("stripe_subscription_id", subId);
        if (error) console.error("Failed to update subscription status:", error);
      }
    }

    // === SUBSCRIPTION CANCELLED ===
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as unknown as Record<string, unknown>;
      const subId = subscription.id as string;
      if (subId) {
        const { data: subRecord } = await supabase
          .from("subscriptions")
          .select("creator_id, subscriber_name, amount_cents")
          .eq("stripe_subscription_id", subId)
          .single();

        const { error } = await supabase
          .from("subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subId);
        if (error) console.error("Failed to mark subscription cancelled:", error);

        if (subRecord?.creator_id) {
          const creatorEmail = await getCreatorEmail(subRecord.creator_id);
          if (creatorEmail) {
            sendTransactionalEmail(creatorEmail, "subscription_cancelled", {
              amount: ((subRecord.amount_cents || 0) / 100).toFixed(2),
              supporter_name: subRecord.subscriber_name || "Un suscriptor",
            });
          }

          // Revoke CFH streaming access, keep downloads only
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("subscriber_id")
            .eq("stripe_subscription_id", subId)
            .single();
          if (subData?.subscriber_id) {
            await supabase.rpc("cfh_revoke_streaming_access", {
              p_user_id: subData.subscriber_id,
              p_creator_id: subRecord.creator_id,
            });
          }
        }
      }
    }

    // === STRIPE CONNECT ACCOUNT UPDATED ===
    if (event.type === "account.updated") {
      const account = event.data.object as unknown as Record<string, unknown>;
      const connectId = account.id as string;
      if (connectId && account.details_submitted && account.charges_enabled) {
        const { error } = await supabase
          .from("profiles")
          .update({ stripe_onboarded: true })
          .eq("stripe_connect_id", connectId);
        if (error) console.error("Failed to update stripe_onboarded:", error);
        else console.log(`Stripe onboarding complete for account: ${connectId}`);
      }
    }

    // === CONNECT ACCOUNT DEAUTHORIZED ===
    if (event.type === "account.application.deauthorized") {
      const account = event.data.object as unknown as Record<string, unknown>;
      const connectId = account.id as string;
      if (connectId) {
        const { error } = await supabase
          .from("profiles")
          .update({ stripe_onboarded: false, stripe_connect_id: null })
          .eq("stripe_connect_id", connectId);
        if (error) console.error("Failed to clear deauthorized connect account:", error);
        else console.log(`Connect account deauthorized: ${connectId}`);
      }
    }

    // Idempotency: record AFTER successful processing so retries work on failure
    await supabase.from("processed_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      stripe_session_id: (event.data.object as Record<string, unknown>).id as string || null,
      metadata: event.data.object,
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
