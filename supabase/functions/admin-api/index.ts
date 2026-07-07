import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const ADMIN_EMAIL = "fullnessmindset@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth" }, 401);

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sbAdmin.auth.getUser(token);
    if (authError || !user || user.email !== ADMIN_EMAIL) return json({ error: "Unauthorized" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "dashboard") {
      const [balance, charges, payouts, accounts] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.charges.list({ limit: 5 }),
        stripe.payouts.list({ limit: 5 }),
        stripe.accounts.list({ limit: 100 }),
      ]);

      const totalRevenue = charges.data.reduce((sum, c) => sum + (c.amount_captured || 0), 0);
      const platformFees = charges.data.reduce((sum, c) => sum + (c.application_fee_amount || 0), 0);

      return json({
        balance: {
          available: balance.available.map(b => ({ amount: b.amount, currency: b.currency })),
          pending: balance.pending.map(b => ({ amount: b.amount, currency: b.currency })),
        },
        total_accounts: accounts.data.length,
        active_accounts: accounts.data.filter(a => a.charges_enabled).length,
      });
    }

    if (action === "balance") {
      const balance = await stripe.balance.retrieve();
      return json({
        available: balance.available.map(b => ({ amount: b.amount, currency: b.currency })),
        pending: balance.pending.map(b => ({ amount: b.amount, currency: b.currency })),
      });
    }

    if (action === "payments") {
      const limit = parseInt(url.searchParams.get("limit") || "25");
      const starting_after = url.searchParams.get("starting_after") || undefined;
      const params: Stripe.PaymentIntentListParams = { limit, expand: ["data.latest_charge"] };
      if (starting_after) params.starting_after = starting_after;
      const payments = await stripe.paymentIntents.list(params);

      return json({
        data: payments.data.map(pi => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          created: pi.created,
          description: pi.description,
          metadata: pi.metadata,
          application_fee_amount: (pi as any).application_fee_amount,
          transfer_data: (pi as any).transfer_data,
        })),
        has_more: payments.has_more,
      });
    }

    if (action === "payouts") {
      const payouts = await stripe.payouts.list({ limit: 20 });
      return json({
        data: payouts.data.map(p => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          arrival_date: p.arrival_date,
          created: p.created,
          method: p.method,
        })),
      });
    }

    if (action === "connected-accounts") {
      const accounts = await stripe.accounts.list({ limit: 100 });
      return json({
        data: accounts.data.map(a => ({
          id: a.id,
          email: a.email,
          charges_enabled: a.charges_enabled,
          payouts_enabled: a.payouts_enabled,
          country: a.country,
          created: a.created,
          business_type: a.business_type,
          details_submitted: a.details_submitted,
        })),
      });
    }

    if (action === "stripe-account-status") {
      const body = await req.json();
      if (!body.connect_id) return json({ error: "Missing connect_id" }, 400);
      const account = await stripe.accounts.retrieve(body.connect_id);
      return json({
        id: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        country: account.country,
        details_submitted: account.details_submitted,
      });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
