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

    const { redirect_url } = await req.json();
    const returnUrl =
      redirect_url || "https://fullnessmindset.github.io/creo/redirect.html";

    const { data: profile } = await sbAdmin
      .from("profiles")
      .select("stripe_connect_id")
      .eq("id", user.id)
      .single();

    let connectId = profile?.stripe_connect_id;

    if (!connectId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { user_id: user.id },
      });
      connectId = account.id;

      await sbAdmin
        .from("profiles")
        .update({ stripe_connect_id: connectId })
        .eq("id", user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: connectId,
      refresh_url: returnUrl + "?stripe=refresh",
      return_url: returnUrl + "?stripe=success",
      type: "account_onboarding",
    });

    return json({ url: accountLink.url });
  } catch (err) {
    console.error("stripe-onboard error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
