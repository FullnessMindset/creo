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

// ── Classification categories ──
const CATEGORIES = [
  "safe",
  "adult_content",
  "violence",
  "hate_harassment",
  "spam",
  "scam",
  "self_harm_risk",
  "csam_risk",
  "copyright",
  "other",
] as const;

type Category = (typeof CATEGORIES)[number];

interface ClassificationResult {
  category: Category;
  confidence: number;
}

// ── Stub classifier ──
// When feature_flag_ai_moderation = 0 (default), auto-approves everything.
// When = 1, this is where you plug in your real AI classifier (OpenAI moderation,
// Google Cloud Vision, AWS Rekognition, etc.)
async function classifyContent(
  contentType: string,
  contentId: string
): Promise<ClassificationResult> {
  const { data: config } = await supabase
    .from("algorithm_config")
    .select("value")
    .eq("key", "feature_flag_ai_moderation")
    .single();

  const aiEnabled = config?.value === 1;

  if (!aiEnabled) {
    return { category: "safe", confidence: 1.0 };
  }

  // ── REAL CLASSIFIER PLACEHOLDER ──
  // When you add a real classifier service, replace this block:
  // 1. Fetch the content (text, image URLs, video keyframes)
  // 2. Send to classification API
  // 3. Map response to our category taxonomy
  // 4. Return { category, confidence }

  let textContent = "";

  if (contentType === "post") {
    const { data } = await supabase
      .from("posts")
      .select("caption, video_url")
      .eq("id", contentId)
      .single();
    textContent = data?.caption || "";
  } else if (contentType === "community_post") {
    const { data } = await supabase
      .from("community_posts")
      .select("title, body")
      .eq("id", contentId)
      .single();
    textContent = [data?.title, data?.body].filter(Boolean).join(" ");
  }

  // Basic keyword detection (stopgap until real AI classifier)
  const lowerText = textContent.toLowerCase();
  const spamSignals = ["buy now", "click here", "free money", "earn $$"];
  const isSpammy = spamSignals.some((s) => lowerText.includes(s));

  if (isSpammy) {
    return { category: "spam", confidence: 0.7 };
  }

  return { category: "safe", confidence: 0.9 };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    // Restrict to service-role calls only — system endpoint, never called by end users
    const internalKey = Deno.env.get("INTERNAL_SERVICE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceCall = req.headers.get("X-Service-Key") === internalKey;
    if (!isServiceCall) return json({ error: "Service-only endpoint" }, 403);

    const body = await req.json();
    const { content_type, content_id } = body;

    if (!content_type || !content_id) {
      return json({ error: "content_type and content_id required" }, 400);
    }

    if (!["post", "community_post", "story", "comment"].includes(content_type)) {
      return json({ error: "Invalid content_type" }, 400);
    }

    // 1. Classify content
    const result = await classifyContent(content_type, content_id);

    // 2. Load thresholds
    const { data: configs } = await supabase
      .from("algorithm_config")
      .select("key, value")
      .in("key", [
        "moderation_auto_approve_threshold",
        "moderation_auto_remove_threshold",
      ]);

    const thresholds: Record<string, number> = {};
    for (const c of configs || []) thresholds[c.key] = Number(c.value);
    const approveThreshold = thresholds["moderation_auto_approve_threshold"] ?? 0.95;
    const removeThreshold = thresholds["moderation_auto_remove_threshold"] ?? 0.9;

    // 3. CSAM-risk: MANDATORY ESCALATION — never auto-approve
    if (result.category === "csam_risk") {
      await supabase.rpc("set_moderation_status", {
        p_content_type: content_type,
        p_content_id: content_id,
        p_status: "under_review",
        p_category: "csam_risk",
        p_confidence: result.confidence,
        p_source: "automated",
      });

      // Update flag to escalated status
      await supabase
        .from("moderation_flags")
        .update({ status: "escalated" })
        .eq("content_type", content_type)
        .eq("content_id", content_id)
        .eq("category", "csam_risk");

      console.error(
        `CSAM_RISK ESCALATION: content_type=${content_type} content_id=${content_id} confidence=${result.confidence}`
      );

      return json({
        status: "escalated",
        category: result.category,
        message: "Content held for mandatory review.",
      });
    }

    // 4. Route based on confidence
    let status: string;
    let message: string;

    if (result.category === "safe" && result.confidence >= approveThreshold) {
      status = "approved";
      message = "Content approved.";
    } else if (
      result.category !== "safe" &&
      result.confidence >= removeThreshold
    ) {
      status = "removed";
      message = `Content removed: ${result.category}. You can appeal this decision.`;
    } else {
      status = "under_review";
      message = "Content held for review.";
    }

    // 5. Apply moderation status
    await supabase.rpc("set_moderation_status", {
      p_content_type: content_type,
      p_content_id: content_id,
      p_status: status,
      p_category: result.category,
      p_confidence: result.confidence,
      p_source: "automated",
    });

    // 6. If removed, notify creator
    if (status === "removed") {
      let creatorId: string | null = null;

      if (content_type === "post") {
        const { data } = await supabase
          .from("posts")
          .select("creator_id")
          .eq("id", content_id)
          .single();
        creatorId = data?.creator_id;
      } else if (content_type === "community_post") {
        const { data } = await supabase
          .from("community_posts")
          .select("author_id")
          .eq("id", content_id)
          .single();
        creatorId = data?.author_id;
      }

      if (creatorId) {
        await supabase.from("notifications").insert({
          user_id: creatorId,
          type: "moderation",
          title: "Contenido removido",
          body: `Tu publicación fue removida por: ${result.category}. Puedes apelar esta decisión desde tu panel.`,
          data: { content_type, content_id, category: result.category },
        });
      }
    }

    return json({
      status,
      category: result.category,
      confidence: result.confidence,
      message,
    });
  } catch (err) {
    console.error("moderate-content error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
