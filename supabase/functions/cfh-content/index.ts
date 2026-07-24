import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
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
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(auth);
  return user;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();

    // Rate limit public endpoints by IP
    const publicActions = ["list", "get", "list-subcategories", "list-comments"];
    if (publicActions.includes(action)) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const { data: rl } = await supabaseAdmin.rpc("check_rate_limit", {
        p_key: `cfh_public:${ip}`,
        p_limit: 60,
        p_window_seconds: 60,
      });
      if (rl === false) return json({ error: "Rate limit exceeded" }, 429);
    }

    // ─── PUBLIC: List content (no auth required) ───
    if (action === "list") {
      const { category, subcategory_id, creator_id, is_free, page = 1, limit = 24, search } = params;
      const offset = (page - 1) * Math.min(limit, 50);
      const pageSize = Math.min(limit, 50);

      let query = supabaseAdmin
        .from("cfh_content")
        .select("*, creator:creator_id(id, username, display_name, avatar_url, stripe_onboarded), subcategory:subcategory_id(id, name)", { count: "exact" })
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (category) query = query.eq("category", category);
      if (subcategory_id) query = query.eq("subcategory_id", subcategory_id);
      if (creator_id) query = query.eq("creator_id", creator_id);
      if (is_free !== undefined) query = query.eq("is_free", is_free);
      if (search) {
        const s = String(search).replace(/[%_(),.{}\\]/g, "").trim().slice(0, 100);
        if (s) query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,tags.cs.{${s}}`);
      }

      const { data, count, error } = await query;
      if (error) return json({ error: error.message }, 400);
      return json({ data, total: count, page, limit: pageSize });
    }

    // ─── PUBLIC: Get single content item ───
    if (action === "get") {
      const { id } = params;
      if (!id) return json({ error: "id required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("cfh_content")
        .select("*, creator:creator_id(id, username, display_name, avatar_url, bio, stripe_onboarded, stripe_connect_id, mecenas_settings, meta_fixed_price_cents), subcategory:subcategory_id(id, name)")
        .eq("id", id)
        .single();

      if (error) return json({ error: error.message }, 404);

      // Record view
      await supabaseAdmin.rpc("cfh_record_view", { p_content_id: id });

      return json({ data });
    }

    // ─── PUBLIC: List subcategories ───
    if (action === "list-subcategories") {
      const { category, creator_id } = params;
      let query = supabaseAdmin
        .from("cfh_subcategories")
        .select("*")
        .order("sort_order", { ascending: true });

      if (category) query = query.eq("category", category);
      if (creator_id) query = query.eq("creator_id", creator_id);

      const { data, error } = await query;
      if (error) return json({ error: error.message }, 400);
      return json({ data });
    }

    // ─── PUBLIC: List comments ───
    if (action === "list-comments") {
      const { content_id, limit = 50 } = params;
      if (!content_id) return json({ error: "content_id required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("cfh_comments")
        .select("*, author:author_id(id, username, display_name, avatar_url)")
        .eq("content_id", content_id)
        .order("created_at", { ascending: true })
        .limit(Math.min(limit, 200));

      if (error) return json({ error: error.message }, 400);
      return json({ data });
    }

    // ─── AUTH REQUIRED below ───
    const user = await getUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);

    // ─── Check subscription access ───
    if (action === "check-access") {
      const { content_id, creator_id: cid } = params;

      // Check active subscription to creator
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status")
        .eq("subscriber_id", user.id)
        .eq("creator_id", cid)
        .eq("status", "active")
        .maybeSingle();

      if (sub) return json({ access: true, type: "subscription", streaming: true, downloads: true });

      // Check access grant
      if (content_id) {
        const { data: grant } = await supabaseAdmin
          .from("cfh_access_grants")
          .select("id, downloads_only")
          .eq("user_id", user.id)
          .eq("content_id", content_id)
          .maybeSingle();

        if (grant) {
          return json({
            access: true,
            type: grant.downloads_only ? "download_only" : "full_grant",
            streaming: !grant.downloads_only,
            downloads: true,
          });
        }
      }

      return json({ access: false, type: "none", streaming: false, downloads: false });
    }

    // ─── Create content ───
    if (action === "create") {
      const {
        category, subcategory_id, title, description, content_type,
        video_url, video_type, thumbnail_url, duration_seconds,
        book_file_url, book_format, allow_download, downloadable_urls,
        is_free, tags, co_creators, brand_deal_id, status = "published",
      } = params;

      if (!category || !title || !content_type) {
        return json({ error: "category, title, and content_type are required" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("cfh_content")
        .insert({
          creator_id: user.id,
          category, subcategory_id, title, description, content_type,
          video_url, video_type, thumbnail_url, duration_seconds,
          book_file_url, book_format, allow_download: allow_download ?? false,
          downloadable_urls: downloadable_urls ?? [],
          is_free: is_free ?? true,
          tags: tags ?? [], co_creators: co_creators ?? [],
          brand_deal_id, status,
        })
        .select()
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ data }, 201);
    }

    // ─── Update content ───
    if (action === "update") {
      const { id, ...updates } = params;
      if (!id) return json({ error: "id required" }, 400);

      // Verify ownership
      const { data: existing } = await supabaseAdmin
        .from("cfh_content")
        .select("creator_id")
        .eq("id", id)
        .single();

      if (!existing || existing.creator_id !== user.id) {
        return json({ error: "Not found or not authorized" }, 403);
      }

      const allowed = ["title","description","category","subcategory_id","content_type",
        "video_url","video_type","thumbnail_url","duration_seconds",
        "book_file_url","book_format","allow_download","downloadable_urls",
        "is_free","tags","co_creators","brand_deal_id","status"];
      const safe: Record<string,unknown> = {};
      for (const k of allowed) { if (k in updates) safe[k] = updates[k]; }
      if (Object.keys(safe).length === 0) return json({ error: "No valid fields to update" }, 400);

      const { data, error } = await supabaseAdmin
        .from("cfh_content")
        .update(safe)
        .eq("id", id)
        .select()
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ data });
    }

    // ─── Delete content ───
    if (action === "delete") {
      const { id } = params;
      if (!id) return json({ error: "id required" }, 400);

      const { error } = await supabaseAdmin
        .from("cfh_content")
        .delete()
        .eq("id", id)
        .eq("creator_id", user.id);

      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ─── Create subcategory ───
    if (action === "create-subcategory") {
      const { category, name, description, cover_url, sort_order, parent_id } = params;
      if (!category || !name) return json({ error: "category and name required" }, 400);

      const row: Record<string, unknown> = { creator_id: user.id, category, name, description, cover_url, sort_order: sort_order ?? 0 };
      if (parent_id) row.parent_id = parent_id;

      const { data, error } = await supabaseAdmin
        .from("cfh_subcategories")
        .insert(row)
        .select()
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ data }, 201);
    }

    // ─── Update subcategory ───
    if (action === "update-subcategory") {
      const { id, ...updates } = params;
      if (!id) return json({ error: "id required" }, 400);
      delete updates.action;
      delete updates.creator_id;

      const { data, error } = await supabaseAdmin
        .from("cfh_subcategories")
        .update(updates)
        .eq("id", id)
        .eq("creator_id", user.id)
        .select()
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ data });
    }

    // ─── Delete subcategory ───
    if (action === "delete-subcategory") {
      const { id } = params;
      if (!id) return json({ error: "id required" }, 400);

      const { error } = await supabaseAdmin
        .from("cfh_subcategories")
        .delete()
        .eq("id", id)
        .eq("creator_id", user.id);

      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ─── Toggle like ───
    if (action === "toggle-like") {
      const { content_id } = params;
      if (!content_id) return json({ error: "content_id required" }, 400);

      const { data: liked } = await supabaseAdmin.rpc("cfh_toggle_like", {
        p_content_id: content_id,
        p_user_id: user.id,
      });

      return json({ liked });
    }

    // ─── Add comment ───
    if (action === "add-comment") {
      const { content_id, body, parent_id } = params;
      if (!content_id || !body?.trim()) return json({ error: "content_id and body required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("cfh_comments")
        .insert({
          content_id,
          author_id: user.id,
          body: body.trim().slice(0, 2000),
          parent_id: parent_id || null,
        })
        .select("*, author:author_id(id, username, display_name, avatar_url)")
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ data }, 201);
    }

    // ─── Delete comment ───
    if (action === "delete-comment") {
      const { id } = params;
      if (!id) return json({ error: "id required" }, 400);

      const { error } = await supabaseAdmin
        .from("cfh_comments")
        .delete()
        .eq("id", id)
        .eq("author_id", user.id);

      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ─── My content (creator dashboard) ───
    if (action === "my-content") {
      const { category, page = 1, limit = 50 } = params;
      const offset = (page - 1) * Math.min(limit, 100);
      const pageSize = Math.min(limit, 100);

      let query = supabaseAdmin
        .from("cfh_content")
        .select("*, subcategory:subcategory_id(id, name)", { count: "exact" })
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (category) query = query.eq("category", category);

      const { data, count, error } = await query;
      if (error) return json({ error: error.message }, 400);
      return json({ data, total: count });
    }

    // ─── Creator's free content (for Creadores tab feed) ───
    if (action === "creator-free-content") {
      const { creator_id, limit = 10 } = params;
      if (!creator_id) return json({ error: "creator_id required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("cfh_content")
        .select("id, title, thumbnail_url, video_url, video_type, content_type, category, duration_seconds, view_count, like_count, created_at")
        .eq("creator_id", creator_id)
        .eq("is_free", true)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 50));

      if (error) return json({ error: error.message }, 400);
      return json({ data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
