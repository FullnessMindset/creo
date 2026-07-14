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

    const { user_id } = await req.json();
    if (user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    // Mark profile for deletion (7-day grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 7);

    await supabaseAdmin.from("profiles").update({
      deletion_requested_at: new Date().toISOString(),
      deletion_scheduled_for: deletionDate.toISOString(),
    }).eq("id", user.id);

    // Delete storage files
    const buckets = ["avatars", "post-media", "story-media", "meta-media"];
    for (const bucket of buckets) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(user.id);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        await supabaseAdmin.storage.from(bucket).remove(paths);
      }
    }

    // Anonymize messages (keep conversation structure but remove content)
    await supabaseAdmin.from("messages")
      .update({ content: "[mensaje eliminado]", media_url: null })
      .eq("sender_id", user.id);

    // Delete user content
    await supabaseAdmin.from("posts").delete().eq("creator_id", user.id);
    await supabaseAdmin.from("creator_stories").delete().eq("creator_id", user.id);
    await supabaseAdmin.from("community_posts").delete().eq("author_id", user.id);
    await supabaseAdmin.from("notifications").delete().eq("user_id", user.id);
    await supabaseAdmin.from("follows").delete().or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);

    // Delete profile
    await supabaseAdmin.from("profiles").delete().eq("id", user.id);

    // Delete auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Auth delete error:", deleteError);
      return json({ error: "Error deleting auth user" }, 500);
    }

    return json({ success: true, message: "Account deleted" });
  } catch (err) {
    console.error("Delete account error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
