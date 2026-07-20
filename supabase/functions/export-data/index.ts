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

    const supabase = createClient(
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

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `export-data:${user.id}`, p_max_requests: 3, p_window_seconds: 600,
    });
    if (allowed === false) return json({ error: "Too many requests. Please wait." }, 429);

    const { user_id } = await req.json();
    if (user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    const safeQuery = async (table: string, column: string, id: string, opts?: { limit?: number; order?: string }) => {
      try {
        let q = supabase.from(table).select("*").eq(column, id);
        if (opts?.order) q = q.order(opts.order, { ascending: false });
        if (opts?.limit) q = q.limit(opts.limit);
        const { data } = await q;
        return data || [];
      } catch { return []; }
    };

    const [
      profileResult,
      metas,
      posts,
      stories,
      communityPosts,
      followsOut,
      followsIn,
      tipsReceived,
      tipsSent,
      subscriptionsAsCreator,
      subscriptionsAsSupporter,
      messagesSent,
      messagesReceived,
      notifications,
      brandDeals,
      brandDealRequests,
      attachments,
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      safeQuery("metas", "creator_id", user.id),
      safeQuery("posts", "creator_id", user.id),
      safeQuery("creator_stories", "creator_id", user.id),
      safeQuery("community_posts", "author_id", user.id),
      safeQuery("follows", "follower_id", user.id),
      safeQuery("follows", "following_id", user.id),
      safeQuery("tips", "creator_id", user.id, { order: "created_at", limit: 1000 }),
      safeQuery("tips", "tipper_id", user.id, { order: "created_at", limit: 1000 }),
      safeQuery("subscriptions", "creator_id", user.id),
      safeQuery("subscriptions", "subscriber_id", user.id),
      safeQuery("messages", "sender_id", user.id, { order: "created_at", limit: 1000 }),
      safeQuery("messages", "receiver_id", user.id, { order: "created_at", limit: 1000 }),
      safeQuery("notifications", "user_id", user.id, { order: "created_at", limit: 500 }),
      safeQuery("brand_deals", "brand_id", user.id),
      safeQuery("brand_deal_requests", "creator_id", user.id),
      safeQuery("message_attachments", "uploader_id", user.id, { order: "created_at", limit: 500 }),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user_email: user.email,
      profile: profileResult.data,
      metas,
      posts,
      stories,
      community_posts: communityPosts,
      following: followsOut,
      followers: followsIn,
      tips_received: tipsReceived,
      tips_sent: tipsSent,
      subscriptions_as_creator: subscriptionsAsCreator,
      subscriptions_as_supporter: subscriptionsAsSupporter,
      messages_sent: messagesSent,
      messages_received: messagesReceived,
      notifications,
      brand_deals: brandDeals,
      brand_deal_requests: brandDealRequests,
      media_attachments: attachments,
    };

    const body = JSON.stringify(exportData, null, 2);

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=creo-mis-datos.json",
      },
    });
  } catch (err) {
    console.error("Export data error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
