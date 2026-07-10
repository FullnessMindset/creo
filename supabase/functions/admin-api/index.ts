import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const ADMIN_EMAIL = "fullnessmindset@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
    if (authError || !user || user.email !== ADMIN_EMAIL)
      return json({ error: "Unauthorized" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch (_) {}
    }

    // ===== LOGIN (verify admin + return Stripe account info) =====
    if (action === "login") {
      try {
        const account = await stripe.accounts.retrieve();
        return json({
          account: {
            id: account.id,
            name:
              (account as Record<string, unknown>).business_profile &&
              ((account as Record<string, unknown>).business_profile as Record<string, unknown>)?.name
                ? ((account as Record<string, unknown>).business_profile as Record<string, unknown>).name
                : account.id,
          },
        });
      } catch (e) {
        return json({ account: { id: "stripe", name: "CREO Platform" } });
      }
    }

    // ===== DASHBOARD =====
    if (action === "dashboard") {
      const [profilesRes, authUsersRes, balanceRes, chargesRes] =
        await Promise.all([
          sbAdmin
            .from("profiles")
            .select("*")
            .order("created_at", { ascending: false }),
          sbAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
          stripe.balance.retrieve().catch(() => null),
          stripe.charges.list({ limit: 20 }).catch(() => ({ data: [] })),
        ]);

      const profiles = profilesRes.data || [];
      const authUsers = authUsersRes.data?.users || [];

      const emailMap = new Map(
        authUsers.map((u) => [u.id, u.email])
      );
      profiles.forEach((p: Record<string, unknown>) => {
        if (!p.email) p.email = emailMap.get(p.id as string) || null;
      });

      const totalRevenue =
        (
          chargesRes as {
            data: Array<{ application_fee_amount?: number }>;
          }
        ).data?.reduce(
          (sum: number, c) =>
            sum + ((c.application_fee_amount || 0) / 100),
          0
        ) || 0;
      const platformBalance =
        balanceRes?.available?.map((b) => ({
          amount: b.amount / 100,
          currency: b.currency,
        })) || [];

      return json({
        stats: {
          totalCreators: profiles.length,
          totalRevenue,
        },
        profiles,
        recentCharges:
          (
            chargesRes as { data: Array<Record<string, unknown>> }
          ).data?.map((c) => ({
            id: (c as Record<string, unknown>).id,
            amount: (c as Record<string, unknown>).amount,
            application_fee_amount: (c as Record<string, unknown>)
              .application_fee_amount,
            status: (c as Record<string, unknown>).status,
            created: (c as Record<string, unknown>).created,
          })) || [],
        platformBalance,
      });
    }

    // ===== ALL USERS (auth.users — includes users without profiles) =====
    if (action === "all-users") {
      const page = Number(url.searchParams.get("page") || "1");
      const perPage = Number(url.searchParams.get("per_page") || "500");
      const {
        data: { users },
        error: usersError,
      } = await sbAdmin.auth.admin.listUsers({ page, perPage });
      if (usersError) return json({ error: usersError.message }, 500);

      const { data: profiles } = await sbAdmin
        .from("profiles")
        .select("id, username, display_name, avatar_url, email");

      const profileMap = new Map(
        (profiles || []).map((p: Record<string, unknown>) => [p.id, p])
      );

      const merged = (users || []).map((u) => ({
        auth_id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        provider: u.app_metadata?.provider || "email",
        has_profile: profileMap.has(u.id),
        profile: profileMap.get(u.id) || null,
      }));

      return json({ users: merged, total: merged.length });
    }

    // ===== UPDATE PROFILE =====
    if (action === "update-profile") {
      const profileId = body.profile_id as string;
      const updates = body.updates as Record<string, unknown>;
      if (!profileId || !updates)
        return json({ error: "Missing profile_id or updates" }, 400);
      const { error } = await sbAdmin
        .from("profiles")
        .update(updates)
        .eq("id", profileId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ===== DELETE PROFILE =====
    if (action === "delete-profile") {
      const profileId = body.profile_id as string;
      if (!profileId) return json({ error: "Missing profile_id" }, 400);
      const { error } = await sbAdmin
        .from("profiles")
        .delete()
        .eq("id", profileId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ===== IDENTITY STATUS =====
    if (action === "identity-status") {
      const sessionId = body.session_id as string;
      if (!sessionId) return json({ error: "Missing session_id" }, 400);
      try {
        const session = await stripe.identity.verificationSessions.retrieve(
          sessionId
        );
        return json({ status: session.status, type: session.type });
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }

    // ===== STRIPE ACCOUNT STATUS =====
    if (action === "stripe-account-status") {
      const connectId = body.connect_id as string;
      if (!connectId) return json({ error: "Missing connect_id" }, 400);
      const account = await stripe.accounts.retrieve(connectId);
      return json({
        id: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        country: account.country,
        details_submitted: account.details_submitted,
      });
    }

    // ===== CONNECTED ACCOUNTS =====
    if (action === "connected-accounts") {
      const accounts = await stripe.accounts.list({ limit: 100 });
      const mapped = accounts.data.map((a) => ({
        id: a.id,
        email: a.email,
        charges_enabled: a.charges_enabled,
        payouts_enabled: a.payouts_enabled,
        country: a.country,
        created: a.created * 1000,
        business_type: a.business_type,
        details_submitted: a.details_submitted,
      }));
      return json({ accounts: mapped, data: mapped });
    }

    // ===== PAYMENTS =====
    if (action === "payments") {
      const limit = parseInt(url.searchParams.get("limit") || "25");
      const startingAfter = url.searchParams.get("starting_after") || undefined;
      const params: Record<string, unknown> = { limit };
      if (startingAfter) params.starting_after = startingAfter;
      const payments = await stripe.paymentIntents.list(
        params as Stripe.PaymentIntentListParams
      );

      return json({
        data: payments.data.map((pi) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          created: pi.created,
          description: pi.description,
          metadata: pi.metadata,
          application_fee_amount: (pi as Record<string, unknown>)
            .application_fee_amount,
          transfer_data: (pi as Record<string, unknown>).transfer_data,
        })),
        has_more: payments.has_more,
      });
    }

    // ===== PAYOUTS (platform payouts to your bank) =====
    if (action === "payouts") {
      const payouts = await stripe.payouts.list({ limit: 20 });
      return json({
        data: payouts.data.map((p) => ({
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

    // ===== BALANCE =====
    if (action === "balance") {
      const balance = await stripe.balance.retrieve();
      return json({
        available: balance.available.map((b) => ({
          amount: b.amount,
          currency: b.currency,
        })),
        pending: balance.pending.map((b) => ({
          amount: b.amount,
          currency: b.currency,
        })),
      });
    }

    // ===== APPROVE PAYOUT (transfer funds to creator's connected account) =====
    if (action === "approve-payout") {
      const metaId = body.meta_id as string;
      const amountCents = body.amount_cents as number;
      const connectId = body.connect_id as string;
      const description = (body.description as string) || "CREO Meta fund release";

      if (!metaId || !amountCents || !connectId)
        return json(
          { error: "Missing meta_id, amount_cents, or connect_id" },
          400
        );

      try {
        const transfer = await stripe.transfers.create({
          amount: amountCents,
          currency: "usd",
          destination: connectId,
          description,
          metadata: { meta_id: metaId, type: "meta_payout" },
        });

        await sbAdmin.from("payout_log").insert({
          meta_id: metaId,
          connect_id: connectId,
          amount_cents: amountCents,
          stripe_transfer_id: transfer.id,
          approved_by: user.email,
        }).catch(() => {});

        return json({ success: true, transfer_id: transfer.id });
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }

    // ===== SEND EMAIL (via Gmail SMTP) =====
    if (action === "send-email") {
      const toEmail = body.to_email as string;
      const toName = (body.to_name as string) || "";
      const subject = body.subject as string;
      const message = body.message as string;

      if (!toEmail || !subject || !message)
        return json({ error: "Missing to_email, subject, or message" }, 400);

      const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
      const gmailUser = "fullnessmindset@gmail.com";

      if (!gmailPassword)
        return json({ error: "GMAIL_APP_PASSWORD not configured. Generate one at myaccount.google.com/apppasswords" }, 500);

      const sanitizedMsg = (message as string)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      const htmlBody = `<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1a0a3e;">
    <h2 style="color:#1a0a3e;font-size:22px;letter-spacing:0.15em;margin:0;">CREO</h2>
    <p style="color:#a8a29e;font-size:11px;margin:4px 0 0;letter-spacing:0.05em;">Crea. Yo Creo En Ti</p>
  </div>
  <p style="color:#1c1917;font-size:15px;margin:0 0 8px;">Hola${toName ? " " + toName : ""},</p>
  <div style="color:#44403c;font-size:14px;line-height:1.7;margin:16px 0;">${sanitizedMsg}</div>
  <hr style="border:none;border-top:1px solid #e7e5e4;margin:28px 0 16px;">
  <p style="color:#a8a29e;font-size:11px;text-align:center;margin:0;">
    Este mensaje fue enviado por el equipo de CREO.<br>
    <a href="https://fullnessmindset.github.io/creo/" style="color:#7c3aed;text-decoration:none;">Visitar CREO</a>
  </p>
</div>`;

      const boundary = "----creo" + Date.now();
      const mimeMessage = [
        `From: CREO <${gmailUser}>`,
        `To: ${toName ? toName + " <" + toEmail + ">" : toEmail}`,
        `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        message,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        htmlBody,
        ``,
        `--${boundary}--`,
      ].join("\r\n");

      const raw = btoa(unescape(encodeURIComponent(mimeMessage)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // Use Gmail SMTP via Google's API with OAuth-less SMTP relay
      // Since Deno Edge Functions can't do raw SMTP, we use the Gmail API via service account
      // Fallback: use nodemailer-compatible SMTP via fetch to a relay

      // Direct SMTP approach using Deno's TCP
      try {
        const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

        const client = new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: {
              username: gmailUser,
              password: gmailPassword,
            },
          },
        });

        await client.send({
          from: `CREO <${gmailUser}>`,
          to: toEmail,
          subject: subject,
          content: message,
          html: htmlBody,
        });

        await client.close();

        await sbAdmin
          .from("admin_emails")
          .insert({
            to_email: toEmail,
            to_name: toName,
            subject,
            message,
            sent_by: user.email,
            resend_id: "gmail-" + Date.now(),
          })
          .catch(() => {});

        return json({ success: true, email_id: "gmail-" + Date.now() });
      } catch (e) {
        return json({ error: "Gmail send failed: " + (e as Error).message }, 500);
      }
    }

    // ===== SENT EMAILS LOG =====
    if (action === "sent-emails") {
      const { data, error } = await sbAdmin
        .from("admin_emails")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ emails: data || [] });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
