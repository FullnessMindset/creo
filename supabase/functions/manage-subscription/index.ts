import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `manage-sub:${user.id}`, p_max_requests: 10, p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Too many requests. Please wait." }, 429);

    const { action, subscription_id } = await req.json();

    // ACTION: list — get user's active subscriptions as a supporter
    if (action === "list") {
      const { data: subs, error: subErr } = await supabase
        .from("subscriptions")
        .select("id, creator_id, amount_cents, status, created_at, cancelled_at, stripe_subscription_id, profiles!subscriptions_creator_id_fkey(display_name, username, avatar_url)")
        .eq("subscriber_id", user.id)
        .order("created_at", { ascending: false });

      if (subErr) return json({ error: "Failed to fetch subscriptions" }, 500);
      return json({ subscriptions: subs || [] });
    }

    // ACTION: list-supporters — get creator's subscribers
    if (action === "list-supporters") {
      const { data: subs, error: subErr } = await supabase
        .from("subscriptions")
        .select("id, subscriber_id, subscriber_email, subscriber_name, amount_cents, status, created_at, cancelled_at")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false });

      if (subErr) return json({ error: "Failed to fetch supporters" }, 500);
      return json({ supporters: subs || [] });
    }

    // ACTION: portal — create Stripe Billing Portal session for subscriber
    if (action === "portal") {
      if (!subscription_id) return json({ error: "subscription_id required" }, 400);

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id, subscriber_id")
        .eq("id", subscription_id)
        .single();

      if (!sub) return json({ error: "Subscription not found" }, 404);
      if (sub.subscriber_id !== user.id) return json({ error: "Not your subscription" }, 403);
      if (!sub.stripe_subscription_id) return json({ error: "No Stripe subscription linked" }, 400);

      const stripeSubscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const customerId = stripeSubscription.customer as string;

      const portalSession = await stripe.billingPortals.sessions.create({
        customer: customerId,
        return_url: "https://fullnessmindset.github.io/creo/index.html",
      });

      return json({ url: portalSession.url });
    }

    // ACTION: cancel — cancel a subscription
    if (action === "cancel") {
      if (!subscription_id) return json({ error: "subscription_id required" }, 400);

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id, subscriber_id")
        .eq("id", subscription_id)
        .single();

      if (!sub) return json({ error: "Subscription not found" }, 404);
      if (sub.subscriber_id !== user.id) return json({ error: "Not your subscription" }, 403);
      if (!sub.stripe_subscription_id) return json({ error: "No Stripe subscription linked" }, 400);

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      return json({ success: true, message: "Subscription will cancel at end of billing period" });
    }

    return json({ error: "Invalid action. Use: list, list-supporters, portal, cancel" }, 400);
  } catch (err) {
    console.error("manage-subscription error:", err);
    return json({ error: "Failed to manage subscription" }, 500);
  }
});
