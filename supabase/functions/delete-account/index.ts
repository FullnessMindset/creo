import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "No authorization" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { user_id, confirm_immediate } = await req.json();
    if (user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    // Rate limit: max 2 deletion requests per hour
    const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: `delete-account:${user.id}`,
      p_max_requests: 2,
      p_window_seconds: 3600,
    });
    if (allowed === false) return json({ error: "Too many requests" }, 429);

    if (confirm_immediate) {
      await performDeletion(supabaseAdmin, user.id);
      return json({ success: true, message: "Account deleted immediately" });
    }

    // Schedule deletion for 7 days from now (grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 7);

    const { error: updateErr } = await supabaseAdmin.from("profiles").update({
      deletion_requested_at: new Date().toISOString(),
      deletion_scheduled_for: deletionDate.toISOString(),
    }).eq("id", user.id);

    if (updateErr) {
      console.error("Failed to schedule deletion:", updateErr);
      return json({ error: "Failed to schedule deletion" }, 500);
    }

    return json({
      success: true,
      message: "Account scheduled for deletion",
      deletion_scheduled_for: deletionDate.toISOString(),
    });
  } catch (err) {
    console.error("Delete account error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

async function performDeletion(supabaseAdmin: ReturnType<typeof createClient>, userId: string) {
  // Delete storage files across all buckets the user may have uploaded to
  const buckets = [
    "avatars", "covers", "stories", "community-media", "meta-images",
    "documents", "backgrounds", "post-videos", "business-images",
    "dm-media", "videos", "meta-receipts", "meta-evidence",
    "meta-final-proof", "brand-deals", "message-media",
  ];
  for (const bucket of buckets) {
    try {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from(bucket).remove(paths);
      }
    } catch { /* bucket may not exist */ }
  }

  // Anonymize messages (keep conversation structure but remove content)
  // messages table uses "body" column
  await supabaseAdmin.from("messages")
    .update({ body: "[mensaje eliminado]", media_url: null })
    .eq("sender_id", userId);

  // deal_messages — wipe both encrypted and plaintext content
  try {
    await supabaseAdmin.from("deal_messages")
      .update({ encrypted_content: null, content: "[mensaje eliminado]" })
      .eq("sender_id", userId);
  } catch { /* table may not exist */ }

  // Delete user content
  const contentTables = [
    { table: "posts", col: "creator_id" },
    { table: "creator_stories", col: "creator_id" },
    { table: "community_posts", col: "author_id" },
    { table: "notifications", col: "user_id" },
    { table: "follows", col: "follower_id" },
    { table: "follows", col: "following_id" },
    { table: "meta_likes", col: "user_id" },
    { table: "meta_comments", col: "user_id" },
    { table: "post_likes", col: "user_id" },
    { table: "post_comments", col: "user_id" },
    { table: "story_likes", col: "user_id" },
    { table: "story_comments", col: "user_id" },
    { table: "community_likes", col: "user_id" },
    { table: "community_comments", col: "user_id" },
    { table: "comment_likes", col: "user_id" },
    { table: "reports", col: "reporter_id" },
    { table: "verification_documents", col: "user_id" },
    { table: "terms_acceptance", col: "user_id" },
    { table: "business_links", col: "creator_id" },
    { table: "message_attachments", col: "uploader_id" },
    { table: "upload_sessions", col: "uploader_id" },
  ];

  for (const { table, col } of contentTables) {
    try {
      await supabaseAdmin.from(table).delete().eq(col, userId);
    } catch { /* table may not exist */ }
  }

  // Anonymize financial records (keep for accounting/tax, remove PII)
  try {
    await supabaseAdmin.from("tips")
      .update({ tipper_name: "[eliminado]", tipper_email: null })
      .eq("creator_id", userId);
  } catch {}

  try {
    await supabaseAdmin.from("subscriptions")
      .update({ subscriber_name: "[eliminado]", subscriber_email: null, status: "cancelled" })
      .eq("creator_id", userId);
  } catch {}

  // Delete metas owned by this creator (cascades to contributions)
  try {
    await supabaseAdmin.from("metas").delete().eq("creator_id", userId);
  } catch {}

  // Delete brand deal requests by this creator
  try {
    await supabaseAdmin.from("brand_deal_requests").delete().eq("creator_id", userId);
  } catch {}

  // Delete profile
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  // Delete auth user
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("Auth delete error:", deleteError);
    throw new Error("Error deleting auth user");
  }
}
