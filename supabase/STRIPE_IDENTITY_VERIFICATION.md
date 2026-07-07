# Stripe Identity Verification — Implementation Reference

> SAVED FOR LATER: This system will gate creators from receiving payments
> until they complete Stripe Identity verification. Currently bypassed
> for testing — all creators with a stripe_connect_id can receive payments.

## How It Works

1. **Creator clicks "Verificar Identidad"** in their Panel
2. Frontend calls a Supabase Edge Function `create-identity-session`
3. The function creates a Stripe Identity VerificationSession
4. Creator is redirected to Stripe's hosted verification UI
5. They upload ID (passport/license) + take a selfie
6. Stripe verifies identity and fires a webhook
7. Webhook updates `profiles.verification_status` to `approved`
8. Payments are now enabled on their profile

## Edge Function: `create-identity-session`

```typescript
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { user_id },
      options: {
        document: {
          allowed_types: ["driving_license", "passport", "id_card"],
          require_matching_selfie: true,
        },
      },
      return_url: `https://fullnessmindset.github.io/creo/redirect.html?status=identity_verified`,
    });

    // Store the session ID on the profile
    await supabase
      .from("profiles")
      .update({
        stripe_identity_id: session.id,
        verification_status: "pending",
      })
      .eq("id", user_id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

## Webhook Handler (add to `stripe-webhook` function)

```typescript
// Inside the webhook handler, add this case:
case "identity.verification_session.verified": {
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  if (userId) {
    await supabase
      .from("profiles")
      .update({ verification_status: "approved" })
      .eq("id", userId);
  }
  break;
}

case "identity.verification_session.requires_input": {
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  if (userId) {
    await supabase
      .from("profiles")
      .update({ verification_status: "failed" })
      .eq("id", userId);
  }
  break;
}
```

## Profile.html Gate Logic (currently bypassed)

```javascript
// In fetchProfile(), after loading data:
if (data.verification_status !== 'approved' || !data.stripe_connect_id) {
  disablePayments();
  if (data.verification_status !== 'approved') {
    document.getElementById('not-verified-banner').classList.remove('hidden');
  }
}
```

## Database Columns Needed

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_identity_id TEXT;
-- verification_status already exists with values: null, 'pending', 'approved', 'failed'
```

## Stripe Dashboard Setup

1. Enable Stripe Identity in your Stripe Dashboard
2. Add webhook endpoint for `identity.verification_session.verified` and
   `identity.verification_session.requires_input` events
3. Stripe Identity costs $1.50 per verification (charged to your platform)

## Re-enabling the Gate

When ready to enforce verification:
1. Deploy the `create-identity-session` edge function
2. Add the webhook cases above to your `stripe-webhook` function
3. Restore the gate in profile.html (uncomment the disablePayments block)
4. Add a "Verificar Identidad" button in index.html Panel
