import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth" }, 401);

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await sbAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 403);

    const { data: allowed } = await sbAdmin.rpc("check_rate_limit", {
      p_key: `check-stripe:${user.id}`, p_max_requests: 10, p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Too many requests. Please wait." }, 429);

    const { data: profile } = await sbAdmin
      .from("profiles")
      .select("stripe_connect_id, stripe_onboarded")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_connect_id) {
      return json({ status: "not_started", details_submitted: false, charges_enabled: false, payouts_enabled: false });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_connect_id);

    const isComplete = account.details_submitted && account.charges_enabled;

    if (isComplete && !profile.stripe_onboarded) {
      await sbAdmin
        .from("profiles")
        .update({ stripe_onboarded: true })
        .eq("id", user.id);
    }

    return json({
      status: isComplete ? "complete" : "incomplete",
      details_submitted: account.details_submitted || false,
      charges_enabled: account.charges_enabled || false,
      payouts_enabled: account.payouts_enabled || false,
    });
  } catch (err) {
    console.error("check-stripe-status error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
