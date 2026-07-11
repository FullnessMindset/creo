#!/bin/bash
# CREO Deployment Verification Script
# Run: bash verify-deploy.sh

echo "============================================"
echo "  CREO DEPLOYMENT VERIFICATION"
echo "  $(date)"
echo "============================================"
echo ""

BASE="https://qddxoyjtoxtdcezwuvcq.supabase.co/functions/v1"

FUNCTIONS=(
  "create-checkout"
  "create-meta-checkout"
  "create-subscription-checkout"
  "create-deal-payment"
  "create-identity-session"
  "identity-webhook"
  "stripe-webhook"
  "admin-api"
)

echo "=== EDGE FUNCTIONS ==="
for fn in "${FUNCTIONS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$fn")
  if [ "$CODE" = "404" ]; then
    STATUS="NOT DEPLOYED"
  elif [ "$CODE" = "500" ]; then
    STATUS="DEPLOYED - ERROR (missing secret?)"
  elif [ "$CODE" = "405" ] || [ "$CODE" = "400" ] || [ "$CODE" = "401" ]; then
    STATUS="DEPLOYED - OK"
  else
    STATUS="UNKNOWN ($CODE)"
  fi
  printf "  %-35s %s  %s\n" "$fn" "$CODE" "$STATUS"
done

echo ""
echo "=== SUPABASE CLI ==="
if command -v supabase &> /dev/null; then
  echo "  Supabase CLI: INSTALLED ($(supabase --version 2>/dev/null || echo 'unknown version'))"
else
  echo "  Supabase CLI: NOT INSTALLED (run: npm i -g supabase)"
fi

echo ""
echo "=== SUPABASE LINK ==="
if [ -f ".supabase/project-ref" ] || supabase projects list &>/dev/null; then
  echo "  Project linked: YES"
else
  echo "  Project linked: UNKNOWN (run: supabase link --project-ref qddxoyjtoxtdcezwuvcq)"
fi

echo ""
echo "=== SQL MIGRATIONS (local files) ==="
MIGRATIONS=(
  "realtime-notifications.sql"
  "message-reactions.sql"
  "meta-contributions.sql"
)
for m in "${MIGRATIONS[@]}"; do
  if [ -f "supabase/migrations/$m" ]; then
    echo "  $m — FILE EXISTS (verify it was run in SQL Editor)"
  else
    echo "  $m — FILE MISSING"
  fi
done

echo ""
echo "=== SECRETS CHECKLIST ==="
echo "  Verify these exist in Supabase > Edge Functions > Manage Secrets:"
echo "  [ ] STRIPE_SECRET_KEY              (sk_live_...)"
echo "  [ ] STRIPE_WEBHOOK_SECRET          (whsec_... from payment endpoint)"
echo "  [ ] STRIPE_IDENTITY_WEBHOOK_SECRET (whsec_... from identity endpoint)"
echo "  [ ] SUPABASE_URL                   (auto-set by Supabase)"
echo "  [ ] SUPABASE_SERVICE_ROLE_KEY      (auto-set by Supabase)"

echo ""
echo "=== STRIPE CHECKLIST ==="
echo "  [ ] Stripe account verified (business details complete)"
echo "  [ ] Live mode enabled (toggle top-right in Stripe Dashboard)"
echo "  [ ] Payment webhook created (stripe-webhook URL, 3 events)"
echo "  [ ] Identity webhook created (identity-webhook URL, 1 event)"

echo ""
echo "============================================"
echo "  Copy everything above and paste it back"
echo "============================================"
