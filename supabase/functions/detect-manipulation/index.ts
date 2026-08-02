import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fullnessmindset.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: require service-role key or valid user token
    const authHeader = req.headers.get("Authorization");
    const internalKey = Deno.env.get("INTERNAL_SERVICE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceCall = req.headers.get("X-Service-Key") === internalKey;

    if (!isServiceCall) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { actor_id, post_id, action_type } = body;

    if (!actor_id || !post_id || !action_type) {
      return json({ error: "actor_id, post_id, action_type required" }, 400);
    }

    // If user-authenticated (not service call), actor_id must match the authenticated user
    if (!isServiceCall) {
      const { data: { user } } = await supabase.auth.getUser(
        authHeader!.replace("Bearer ", "")
      );
      if (user && actor_id !== user.id) {
        return json({ error: "actor_id must match authenticated user" }, 403);
      }
    }

    // 1. Rate limit check (defense-in-depth at API layer)
    const { data: allowed } = await supabase.rpc(
      "check_engagement_rate_limit",
      { p_user_id: actor_id, p_action_type: action_type }
    );

    if (allowed === false) {
      // Log rate-limit hit
      await supabase.from("manipulation_signals").insert({
        account_id: actor_id,
        post_id,
        signal_type: "velocity_anomaly",
        confidence: 0.6,
        action_taken: "rate_limit",
        details: { reason: "rate_limit_exceeded", action_type },
      });

      return json({
        allowed: false,
        action: "rate_limit",
        message: "Too many actions. Please slow down.",
      });
    }

    // 2. Check user sanction status
    const { data: profile } = await supabase
      .from("profiles")
      .select("sanction_status")
      .eq("id", actor_id)
      .single();

    if (
      profile?.sanction_status &&
      ["temporary_lock", "life_ban"].includes(profile.sanction_status)
    ) {
      return json({
        allowed: false,
        action: "blocked",
        message: "Account restricted.",
      });
    }

    // 3. Run manipulation detection suite via DB function
    const { data: result, error } = await supabase.rpc("check_manipulation", {
      p_actor_id: actor_id,
      p_post_id: post_id,
    });

    if (error) {
      console.error("check_manipulation error:", error);
      // Fail open — allow engagement but log the error
      return json({ allowed: true, action: "none", confidence: 0 });
    }

    const row = result?.[0] || {
      should_discount: false,
      action_taken: "none",
      total_confidence: 0,
    };

    // 4. If discounted, mark the engagement
    if (row.should_discount) {
      await supabase
        .from("engagements")
        .update({
          manipulation_discounted: true,
          discount_reason: row.action_taken,
        })
        .eq("actor_id", actor_id)
        .eq("post_id", post_id)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    // 5. If high confidence → queue for admin review
    if (row.action_taken === "queue_review") {
      await supabase.from("moderation_flags").upsert(
        {
          content_type: "post",
          content_id: post_id,
          category: "spam",
          confidence: row.total_confidence,
          status: "pending",
          source: "automated",
        },
        { onConflict: "content_type,content_id,category" }
      );
    }

    return json({
      allowed: true,
      discounted: row.should_discount,
      action: row.action_taken,
      confidence: row.total_confidence,
    });
  } catch (err) {
    console.error("detect-manipulation error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
