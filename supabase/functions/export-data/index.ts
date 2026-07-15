import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `export-data:${user.id}`, p_max_requests: 3, p_window_seconds: 600,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [
      { data: profile },
      { data: metas },
      { data: posts },
      { data: stories },
      { data: communityPosts },
      { data: follows },
      { data: tips },
      { data: subscriptions },
      { data: messages },
      { data: notifications },
      { data: brandDeals },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("metas").select("*").eq("creator_id", user.id),
      supabase.from("posts").select("*").eq("creator_id", user.id),
      supabase.from("creator_stories").select("*").eq("creator_id", user.id),
      supabase.from("community_posts").select("*").eq("author_id", user.id),
      supabase.from("follows").select("*").or(`follower_id.eq.${user.id},following_id.eq.${user.id}`),
      supabase.from("tips").select("*").eq("creator_id", user.id),
      supabase.from("subscriptions").select("*").eq("creator_id", user.id),
      supabase.from("messages").select("*").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(1000),
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
      supabase.from("brand_deals").select("*").eq("brand_id", user.id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user_email: user.email,
      profile,
      metas: metas || [],
      posts: posts || [],
      stories: stories || [],
      community_posts: communityPosts || [],
      follows: follows || [],
      tips_received: tips || [],
      subscriptions: subscriptions || [],
      messages_sent: messages || [],
      notifications: notifications || [],
      brand_deals: brandDeals || [],
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
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
