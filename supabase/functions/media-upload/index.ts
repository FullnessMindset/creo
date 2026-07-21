import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "dll", "js", "vbs", "ps1", "sh", "msi",
  "scr", "pif", "hta", "cpl", "inf", "reg", "ws", "wsf", "jar",
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const BUCKET = "dm-media";

function categorize(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `media-upload:${user.id}`,
      p_max_requests: 30,
      p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Too many requests" }, 429);

    const body = await req.json();
    const { action } = body;

    // ===== INITIATE =====
    if (action === "initiate") {
      const { file_name, file_size, mime_type } = body;

      if (!file_name || !file_size) return json({ error: "file_name and file_size required" }, 400);
      if (file_size > MAX_FILE_SIZE) return json({ error: "File too large (max 500MB)" }, 400);
      if (file_size === 0) return json({ error: "Empty file" }, 400);

      const ext = (file_name.split(".").pop() || "").toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) return json({ error: "File type not allowed" }, 400);

      const category = categorize(mime_type || "application/octet-stream");
      const storagePath = `${user.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

      const { data: attachment, error: insertErr } = await supabase
        .from("message_attachments")
        .insert({
          uploader_id: user.id,
          file_name,
          file_size,
          mime_type: mime_type || "application/octet-stream",
          category,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          upload_status: "pending",
        })
        .select("id")
        .single();

      if (insertErr) return json({ error: "Failed to create attachment: " + insertErr.message }, 500);

      return json({
        attachment_id: attachment.id,
        storage_path: storagePath,
        bucket: BUCKET,
        upload_mode: file_size <= 5 * 1024 * 1024 ? "direct" : "chunked",
      });
    }

    // ===== COMPLETE =====
    if (action === "complete") {
      const { attachment_id, width, height, duration, thumbnail, waveform } = body;
      if (!attachment_id) return json({ error: "attachment_id required" }, 400);

      const { data: att, error: fetchErr } = await supabase
        .from("message_attachments")
        .select("*")
        .eq("id", attachment_id)
        .eq("uploader_id", user.id)
        .single();

      if (fetchErr || !att) return json({ error: "Attachment not found" }, 404);

      const { data: urlData } = supabase.storage.from(att.storage_bucket).getPublicUrl(att.storage_path);
      const publicUrl = urlData?.publicUrl || "";

      const updates: Record<string, unknown> = {
        upload_status: "complete",
        public_url: publicUrl,
        is_safe: true,
        scan_status: "skipped",
      };
      if (width) updates.width = width;
      if (height) updates.height = height;
      if (duration) updates.duration_seconds = duration;
      if (thumbnail) updates.thumbnail_url = thumbnail;
      if (waveform) updates.waveform_data = waveform;

      const { error: updateErr } = await supabase
        .from("message_attachments")
        .update(updates)
        .eq("id", attachment_id)
        .eq("uploader_id", user.id);

      if (updateErr) return json({ error: "Failed to complete: " + updateErr.message }, 500);

      return json({
        public_url: publicUrl,
        category: att.category,
        mime_type: att.mime_type,
        file_name: att.file_name,
      });
    }

    // ===== SEND (message with attachment) =====
    if (action === "send") {
      const { receiver_id, body: msgBody, attachment_id, media_url, media_type } = body;
      if (!receiver_id) return json({ error: "receiver_id required" }, 400);

      const messageData: Record<string, unknown> = {
        sender_id: user.id,
        receiver_id,
      };
      if (msgBody) messageData.body = msgBody;
      if (media_url) messageData.media_url = media_url;
      if (media_type) messageData.media_type = media_type;
      if (attachment_id) messageData.attachment_id = attachment_id;

      const { error: msgErr } = await supabase.from("messages").insert(messageData);
      if (msgErr) return json({ error: "Failed to send: " + msgErr.message }, 500);

      // Create notification for receiver
      await supabase.from("notifications").insert({
        user_id: receiver_id,
        type: "message",
        title: msgBody ? msgBody.substring(0, 80) : (media_type === "gif" ? "🎬 GIF" : "📎 " + (media_type || "file")),
        link: "messages.html#chat-" + user.id,
      }).catch(() => {});

      return json({ ok: true });
    }

    return json({ error: "Invalid action. Use: initiate, complete, send" }, 400);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ error: message }, 500);
  }
});
