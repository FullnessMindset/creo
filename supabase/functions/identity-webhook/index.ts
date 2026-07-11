import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_IDENTITY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_IDENTITY_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const eventTypeMap: Record<string, string> = {
      "identity.verification_session.verified": "verified",
      "identity.verification_session.requires_input": "needs_review",
      "identity.verification_session.canceled": "cancelled",
      "identity.verification_session.created": "started",
      "identity.verification_session.processing": "submitted",
      "identity.verification_session.redacted": "expired",
    };

    const status = eventTypeMap[event.type];

    if (status) {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      const userId = session.metadata?.user_id;

      if (!userId) {
        console.error("No user_id in verification session metadata");
        return new Response("No user_id in metadata", { status: 400 });
      }

      const { error: rpcError } = await supabaseAdmin.rpc(
        "record_verification_event",
        {
          p_user_id: userId,
          p_status: status,
          p_stripe_session_id: session.id,
          p_metadata: {
            stripe_event_type: event.type,
            stripe_event_id: event.id,
            user_email: session.metadata?.user_email || "",
          },
        }
      );

      if (rpcError) {
        console.error("record_verification_event RPC failed:", rpcError);
        if (status === "verified") {
          await supabaseAdmin
            .from("profiles")
            .update({ identity_verified: true })
            .eq("id", userId);
        }
      }

      console.log(
        `User ${userId} verification event: ${status} (${event.type})`
      );
    } else {
      console.log(`Unhandled identity event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Identity webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
