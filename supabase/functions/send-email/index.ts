import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "CREO <noreply@creo.app>";
const PLATFORM_URL = "https://fullnessmindset.github.io/creo";

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

interface EmailTemplate {
  subject: string;
  html: string;
}

function getTemplate(type: string, data: Record<string, string>): EmailTemplate | null {
  const templates: Record<string, () => EmailTemplate> = {
    tip_received: () => ({
      subject: `Recibiste un apoyo de $${data.amount}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafafa;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1a0a3e;font-size:24px;margin:0;">CREO</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1a0a3e;font-size:18px;margin:0 0 8px;">Nuevo apoyo recibido</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px;"><strong style="color:#059669;">${data.supporter_name}</strong> te envió un apoyo de <strong style="color:#059669;">$${data.amount}</strong></p>
            <div style="background:linear-gradient(135deg,#1a0a3e,#4338ca);color:white;padding:16px;border-radius:10px;text-align:center;margin:16px 0;">
              <p style="font-size:28px;font-weight:bold;margin:0;">$${data.amount}</p>
              <p style="font-size:12px;opacity:0.8;margin:4px 0 0;">Yo Creo en Ti</p>
            </div>
            <a href="${PLATFORM_URL}/index.html" style="display:block;background:#33f0b0;color:#1a0a3e;text-align:center;padding:12px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:16px;">Ver mi panel</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">CREO — Plataforma de apoyo a creadores</p>
        </div>`,
    }),

    subscription_started: () => ({
      subject: `Nuevo suscriptor: $${data.amount}/mes`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafafa;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1a0a3e;font-size:24px;margin:0;">CREO</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1a0a3e;font-size:18px;margin:0 0 8px;">Nuevo suscriptor</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px;"><strong style="color:#7c3aed;">${data.supporter_name}</strong> se suscribió a tu Apoyo Full por <strong style="color:#7c3aed;">$${data.amount}/mes</strong></p>
            <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;padding:16px;border-radius:10px;text-align:center;margin:16px 0;">
              <p style="font-size:28px;font-weight:bold;margin:0;">$${data.amount}/mes</p>
              <p style="font-size:12px;opacity:0.8;margin:4px 0 0;">Apoyo Full</p>
            </div>
            <a href="${PLATFORM_URL}/index.html" style="display:block;background:#33f0b0;color:#1a0a3e;text-align:center;padding:12px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:16px;">Ver suscriptores</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">CREO — Plataforma de apoyo a creadores</p>
        </div>`,
    }),

    subscription_cancelled: () => ({
      subject: "Un suscriptor canceló su Apoyo Full",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafafa;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1a0a3e;font-size:24px;margin:0;">CREO</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1a0a3e;font-size:18px;margin:0 0 8px;">Suscripción cancelada</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">${data.supporter_name || "Un suscriptor"} canceló su Apoyo Full de $${data.amount}/mes. La suscripción permanecerá activa hasta el final del período actual.</p>
            <a href="${PLATFORM_URL}/index.html" style="display:block;background:#33f0b0;color:#1a0a3e;text-align:center;padding:12px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:16px;">Ver panel</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">CREO — Plataforma de apoyo a creadores</p>
        </div>`,
    }),

    meta_goal_reached: () => ({
      subject: `Tu meta "${data.meta_title}" alcanzó su objetivo`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafafa;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1a0a3e;font-size:24px;margin:0;">CREO</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1a0a3e;font-size:18px;margin:0 0 8px;">Meta completada</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">Tu meta <strong>"${data.meta_title}"</strong> alcanzó su objetivo de <strong style="color:#d97706;">$${data.goal_amount}</strong></p>
            <div style="background:linear-gradient(135deg,#d97706,#f59e0b);color:white;padding:16px;border-radius:10px;text-align:center;margin:16px 0;">
              <p style="font-size:14px;opacity:0.9;margin:0 0 4px;">Meta Completada</p>
              <p style="font-size:28px;font-weight:bold;margin:0;">$${data.goal_amount}</p>
            </div>
            <a href="${PLATFORM_URL}/index.html" style="display:block;background:#33f0b0;color:#1a0a3e;text-align:center;padding:12px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:16px;">Ver mis metas</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">CREO — Plataforma de apoyo a creadores</p>
        </div>`,
    }),

    verification_approved: () => ({
      subject: "Tu CREO ID ha sido verificado",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafafa;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1a0a3e;font-size:24px;margin:0;">CREO</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
            <div style="text-align:center;margin-bottom:16px;">
              <div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:inline-flex;align-items:center;justify-content:center;">
                <span style="font-size:32px;">✅</span>
              </div>
            </div>
            <h2 style="color:#1a0a3e;font-size:18px;margin:0 0 8px;text-align:center;">Identidad verificada</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px;text-align:center;">Tu CREO ID ha sido aprobado. Ahora puedes recibir pagos y acceder a todas las funciones de la plataforma.</p>
            <a href="${PLATFORM_URL}/index.html" style="display:block;background:#33f0b0;color:#1a0a3e;text-align:center;padding:12px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:16px;">Ir a mi panel</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">CREO — Plataforma de apoyo a creadores</p>
        </div>`,
    }),

    verification_rejected: () => ({
      subject: "Actualización sobre tu verificación CREO ID",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafafa;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#1a0a3e;font-size:24px;margin:0;">CREO</h1>
          </div>
          <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1a0a3e;font-size:18px;margin:0 0 8px;">Verificación no aprobada</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">Tu verificación de identidad no pudo ser aprobada. Puedes intentar nuevamente desde tu panel de CREO.</p>
            <a href="${PLATFORM_URL}/index.html" style="display:block;background:#33f0b0;color:#1a0a3e;text-align:center;padding:12px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:16px;">Reintentar verificación</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">CREO — Plataforma de apoyo a creadores</p>
        </div>`,
    }),
  };

  const templateFn = templates[type];
  if (!templateFn) return null;
  return templateFn();
}

async function sendViaResend(to: string, template: EmailTemplate): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: template.subject,
      html: template.html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const isServiceCall = req.headers.get("X-Service-Key") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!isServiceCall && !authHeader) return json({ error: "Unauthorized" }, 401);

    if (!isServiceCall) {
      const { data: { user } } = await supabase.auth.getUser(authHeader!.replace("Bearer ", ""));
      if (!user || user.email !== Deno.env.get("ADMIN_EMAIL")) return json({ error: "Admin only" }, 403);
    }

    const { type, to, data } = await req.json();

    if (!type || !to) return json({ error: "type and to are required" }, 400);

    const template = getTemplate(type, data || {});
    if (!template) return json({ error: `Unknown email type: ${type}` }, 400);

    if (!RESEND_API_KEY) {
      console.log(`Email skipped (no RESEND_API_KEY): ${type} → ${to}`);
      return json({ sent: false, reason: "No email provider configured. Set RESEND_API_KEY." });
    }

    const sent = await sendViaResend(to, template);

    await supabase.from("admin_emails").insert({
      recipient: to,
      subject: template.subject,
      body: template.html,
      status: sent ? "sent" : "failed",
    }).then(() => {});

    return json({ sent });
  } catch (err) {
    console.error("send-email error:", err);
    return json({ error: "Failed to send email" }, 500);
  }
});
