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

// ── Config cache (refreshed every 5 min) ──
let configCache: Record<string, number> = {};
let configLastFetched = 0;

async function loadConfig(): Promise<void> {
  if (
    Date.now() - configLastFetched < 300_000 &&
    Object.keys(configCache).length > 0
  )
    return;
  const { data } = await supabase.from("algorithm_config").select("key,value");
  const cfg: Record<string, number> = {};
  for (const row of data || []) cfg[row.key] = Number(row.value);
  configCache = cfg;
  configLastFetched = Date.now();
}

function cfg(key: string, fallback: number): number {
  return configCache[key] ?? fallback;
}

// ── Types ──
interface FeedItem {
  id: string;
  content_type: string;
  content_id: string;
  creator_id: string;
  composite_score: number;
  engagement_score: number;
  momentum_score: number;
  decay_factor: number;
  created_at: string;
  tier: string;
  content: Record<string, unknown>;
  profile: Record<string, unknown>;
}

// ── Feed response cache (in-memory, short TTL) ──
const feedCache = new Map<string, { data: unknown; expires: number }>();

function getCached(key: string): unknown | null {
  const entry = feedCache.get(key);
  if (!entry || Date.now() > entry.expires) {
    feedCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown, ttlSeconds: number): void {
  if (feedCache.size > 500) {
    const oldest = feedCache.keys().next().value;
    if (oldest) feedCache.delete(oldest);
  }
  feedCache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
}

// ═══════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startMs = Date.now();

  try {
    // Rate limiting
    const clientIp = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `feed:${clientIp}`,
      p_max_requests: 60,
      p_window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Rate limit exceeded" }, 429);

    // Authenticate user from JWT (don't trust client-supplied user_id)
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }

    const body = await req.json();
    const surface: string = body.surface || "feed";
    const cursor: number = body.cursor || 0;
    const limit: number = Math.min(body.limit || 15, 50);

    await loadConfig();

    // Rollout gate: check if user gets ranked feed or simple chronological
    const rolloutPercent = cfg("deploy_rollout_percent", 100);
    if (rolloutPercent < 100 && userId) {
      const hash = userId.charCodeAt(0) % 100;
      if (hash >= rolloutPercent) {
        // User not in rollout — return simple chronological
        const { data: posts } = await supabase
          .from("posts")
          .select("*, profiles:creator_id(id, username, display_name, avatar_url, verification_status)")
          .eq("moderation_status", "approved")
          .order("created_at", { ascending: false })
          .range(cursor, cursor + limit - 1);

        return json({
          items: posts || [],
          next_cursor: cursor + (posts?.length || 0),
          has_more: (posts?.length || 0) === limit,
        });
      }
    }

    // Cache check (for non-personalized surfaces)
    const cacheTtl = cfg("perf_feed_cache_ttl_seconds", 30);
    const cacheKey = `${surface}:${userId || "anon"}:${cursor}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      trackLatency(startMs, surface, true);
      return json(cached);
    }

    let items: FeedItem[];

    switch (surface) {
      case "feed":
        items = await composeFeed(cursor, limit, userId);
        break;
      case "following":
        items = await composeFollowing(cursor, limit, userId);
        break;
      case "explore":
        items = await composeExplore(cursor, limit, userId);
        break;
      case "creator":
        items = await composeCreator(cursor, limit);
        break;
      case "stories":
        items = await composeStories(cursor, limit, userId);
        break;
      case "profile":
        items = await composeProfile(cursor, limit, body.creator_id || null);
        break;
      default:
        items = await composeFeed(cursor, limit, userId);
    }

    const response = {
      items,
      next_cursor: cursor + items.length,
      has_more: items.length === limit,
    };

    setCache(cacheKey, response, cacheTtl);
    trackLatency(startMs, surface, false);

    return json(response);
  } catch (err) {
    console.error("get-feed error:", err);
    trackLatency(startMs, "error", false);
    return json({ error: (err as Error).message }, 500);
  }
});

// Track feed latency (fire-and-forget, don't block response)
function trackLatency(startMs: number, surface: string, cached: boolean): void {
  const latencyMs = Date.now() - startMs;
  supabase.rpc("record_metric", {
    p_name: "feed_latency_ms",
    p_value: latencyMs,
    p_tags: { surface, cached },
  }).then(() => {}).catch(() => {});
}

// ═══════════════════════════════════════════════════
// FEED COMPOSER (main feed — Creadores)
// 5-tier: newest injection → ranked → trending → fairness → backfill
// ═══════════════════════════════════════════════════
async function composeFeed(
  cursor: number,
  limit: number,
  userId: string | null
): Promise<FeedItem[]> {
  const newestSlots = cursor === 0 ? cfg("newest_injection_slots", 3) : 0;
  const fairnessPercent = cfg("fairness_quota_percent", 18);
  const fairnessSlots = Math.max(1, Math.round(limit * fairnessPercent / 100));
  const rankedSlots = limit - newestSlots - fairnessSlots;
  const results: FeedItem[] = [];
  const excludeIds: string[] = [];

  // Tier 1: Newest (unranked, first page only)
  if (newestSlots > 0) {
    const newest = await queryScores({
      orderBy: "created_at",
      limit: newestSlots,
      minAge: null,
      maxAgeDays: 1,
      excludeIds,
    });
    for (const item of newest) {
      item.tier = "newest";
      results.push(item);
      excludeIds.push(item.content_id);
    }
  }

  // Tier 2: Ranked by composite_score
  const ranked = await queryScores({
    orderBy: "composite_score",
    limit: rankedSlots,
    offset: cursor === 0 ? 0 : cursor,
    maxAgeDays: cfg("relevance_window_days", 7),
    excludeIds,
  });
  for (const item of ranked) {
    item.tier = "ranked";
    results.push(item);
    excludeIds.push(item.content_id);
  }

  // Tier 3: Fairness injection (small/new creators, 1 per creator)
  const fairness = await getFairnessContent(fairnessSlots, excludeIds);
  results.push(...fairness);

  // Apply cooldown to prevent creator dominance in top-3
  const cooled = applyCooldown(results);

  await hydrateItems(cooled);
  return cooled;
}

// ═══════════════════════════════════════════════════
// EXPLORE COMPOSER
// Epsilon-greedy: trending discovery + random quality-gated
// ═══════════════════════════════════════════════════
async function composeExplore(
  cursor: number,
  limit: number,
  userId: string | null
): Promise<FeedItem[]> {
  const epsilonPercent = cfg("explore_epsilon", 15);
  const randomSlots = Math.max(1, Math.round(limit * epsilonPercent / 100));
  const discoverySlots = limit - randomSlots;
  const results: FeedItem[] = [];
  const excludeIds: string[] = [];

  // Trending by momentum
  const trending = await queryScores({
    orderBy: "momentum_score",
    limit: discoverySlots,
    offset: cursor,
    maxAgeDays: cfg("relevance_window_days", 7),
    excludeIds,
  });
  for (const item of trending) {
    item.tier = "trending";
    results.push(item);
    excludeIds.push(item.content_id);
  }

  // Epsilon-greedy random (quality gate: ≥1 unique engager)
  const random = await getRandomQuality(randomSlots, excludeIds);
  results.push(...random);

  await hydrateItems(results);
  return results;
}

// ═══════════════════════════════════════════════════
// CREATOR FEED (brand deals — capped payment weight)
// ═══════════════════════════════════════════════════
async function composeCreator(
  cursor: number,
  limit: number
): Promise<FeedItem[]> {
  const paymentCap = cfg("brand_deal_payment_cap_percent", 25) / 100;

  const { data: deals } = await supabase
    .from("brand_deals")
    .select(
      "*, brand:brand_id(id, username, display_name, avatar_url)"
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1);

  if (!deals || deals.length === 0) return [];

  const scored = deals.map((deal: Record<string, unknown>) => {
    const deadline = deal.deadline
      ? new Date(deal.deadline as string)
      : null;
    const daysLeft = deadline
      ? Math.max(0, (deadline.getTime() - Date.now()) / 86400000)
      : 30;
    const urgency = Math.max(0, 1 - daysLeft / 30);
    const budget =
      Math.min(1, ((deal.budget_per_creator_cents as number) || 0) / 50000) *
      paymentCap;
    const recency = Math.max(
      0,
      1 -
        (Date.now() - new Date(deal.created_at as string).getTime()) /
          (30 * 86400000)
    );
    const composite = recency * 0.35 + urgency * 0.25 + budget + 0.15;

    return {
      id: deal.id as string,
      content_type: "brand_deal",
      content_id: deal.id as string,
      creator_id: deal.brand_id as string,
      composite_score: composite,
      engagement_score: 0,
      momentum_score: urgency,
      decay_factor: recency,
      created_at: deal.created_at as string,
      tier: "ranked",
      content: deal,
      profile: (deal.brand || {}) as Record<string, unknown>,
    } as FeedItem;
  });

  scored.sort(
    (a: FeedItem, b: FeedItem) => b.composite_score - a.composite_score
  );
  return scored;
}

// ═══════════════════════════════════════════════════
// FOLLOWING FEED (chronological, no fairness injection)
// Light quality de-prioritization for muted/low-quality
// ═══════════════════════════════════════════════════
async function composeFollowing(
  cursor: number,
  limit: number,
  userId: string | null
): Promise<FeedItem[]> {
  if (!userId) return [];

  const { data: followedIds } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (!followedIds || followedIds.length === 0) return [];

  const ids = followedIds.map((f: { following_id: string }) => f.following_id);

  const { data: mutedIds } = await supabase
    .from("user_mutes")
    .select("muted_user_id")
    .eq("user_id", userId);
  const muted = new Set((mutedIds || []).map((m: { muted_user_id: string }) => m.muted_user_id));

  const windowDays = cfg("relevance_window_days", 7);
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

  const { data: posts } = await supabase
    .from("posts")
    .select("*, profiles:creator_id(id, username, display_name, avatar_url, identity_verified, verification_status, account_type)")
    .in("creator_id", ids)
    .eq("moderation_status", "approved")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1);

  if (!posts || posts.length === 0) return [];

  const items: FeedItem[] = posts.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    content_type: "post",
    content_id: p.id as string,
    creator_id: p.creator_id as string,
    composite_score: 0,
    engagement_score: 0,
    momentum_score: 0,
    decay_factor: 1,
    created_at: p.created_at as string,
    tier: muted.has(p.creator_id as string) ? "muted" : "following",
    content: p,
    profile: (p.profiles || {}) as Record<string, unknown>,
  }));

  // De-prioritize muted (push to end, don't hide)
  items.sort((a, b) => {
    if (a.tier === "muted" && b.tier !== "muted") return 1;
    if (a.tier !== "muted" && b.tier === "muted") return -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return items;
}

// ═══════════════════════════════════════════════════
// STORIES COMPOSER (Mi Historia discovery)
// Order: unseen from followed → high-interaction → recency → quality
// ═══════════════════════════════════════════════════
async function composeStories(
  cursor: number,
  limit: number,
  userId: string | null
): Promise<FeedItem[]> {
  const expiryHours = cfg("story_expiry_hours", 24);
  const cutoff = new Date(Date.now() - expiryHours * 3600000).toISOString();

  const { data: stories } = await supabase
    .from("creator_stories")
    .select("*, profile:creator_id(id, username, display_name, avatar_url, verification_status)")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit * 2 - 1);

  if (!stories || stories.length === 0) return [];

  let viewedSet = new Set<string>();
  let followedSet = new Set<string>();

  if (userId) {
    const [viewsRes, followsRes] = await Promise.all([
      supabase.from("story_views").select("story_id").eq("user_id", userId),
      supabase.from("follows").select("following_id").eq("follower_id", userId),
    ]);
    viewedSet = new Set((viewsRes.data || []).map((v: { story_id: string }) => v.story_id));
    followedSet = new Set((followsRes.data || []).map((f: { following_id: string }) => f.following_id));
  }

  const items: FeedItem[] = stories.map((s: Record<string, unknown>) => {
    const isViewed = viewedSet.has(s.id as string);
    const isFollowed = followedSet.has(s.creator_id as string);
    let priority = 0;
    if (!isViewed && isFollowed) priority = 3;
    else if (!isViewed) priority = 2;
    else if (isFollowed) priority = 1;

    return {
      id: s.id as string,
      content_type: "story",
      content_id: s.id as string,
      creator_id: s.creator_id as string,
      composite_score: priority,
      engagement_score: (s.view_count as number) || 0,
      momentum_score: 0,
      decay_factor: 1,
      created_at: s.created_at as string,
      tier: isViewed ? "viewed" : "unseen",
      content: s,
      profile: (s.profile || {}) as Record<string, unknown>,
    } as FeedItem;
  });

  items.sort((a, b) => {
    if (a.composite_score !== b.composite_score) return b.composite_score - a.composite_score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return items.slice(0, limit);
}

// ═══════════════════════════════════════════════════
// PROFILE TIMELINE (pinned first, then chronological, cursor-paginated)
// ═══════════════════════════════════════════════════
async function composeProfile(
  cursor: number,
  limit: number,
  creatorId: string | null
): Promise<FeedItem[]> {
  if (!creatorId) return [];

  const results: FeedItem[] = [];

  // Pinned posts first (only on first page)
  if (cursor === 0) {
    const { data: pinned } = await supabase
      .from("posts")
      .select("*, profiles:creator_id(id, username, display_name, avatar_url, verification_status)")
      .eq("creator_id", creatorId)
      .eq("is_pinned", true)
      .eq("moderation_status", "approved")
      .order("pin_order", { ascending: true });

    for (const p of pinned || []) {
      results.push({
        id: p.id,
        content_type: "post",
        content_id: p.id,
        creator_id: p.creator_id,
        composite_score: 0,
        engagement_score: p.like_count || 0,
        momentum_score: 0,
        decay_factor: 1,
        created_at: p.created_at,
        tier: "pinned",
        content: p,
        profile: p.profiles || {},
      });
    }
  }

  const pinnedIds = results.map((r) => r.content_id);

  // Regular posts (chronological)
  let query = supabase
    .from("posts")
    .select("*, profiles:creator_id(id, username, display_name, avatar_url, verification_status)")
    .eq("creator_id", creatorId)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1);

  const { data: posts } = await query;

  for (const p of posts || []) {
    if (pinnedIds.includes(p.id)) continue;
    results.push({
      id: p.id,
      content_type: "post",
      content_id: p.id,
      creator_id: p.creator_id,
      composite_score: 0,
      engagement_score: p.like_count || 0,
      momentum_score: 0,
      decay_factor: 1,
      created_at: p.created_at,
      tier: "chronological",
      content: p,
      profile: p.profiles || {},
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════
// SHARED QUERY HELPERS
// ═══════════════════════════════════════════════════

interface ScoreQuery {
  orderBy: "composite_score" | "momentum_score" | "created_at";
  limit: number;
  offset?: number;
  minAge?: number | null;
  maxAgeDays?: number;
  excludeIds?: string[];
}

async function queryScores(q: ScoreQuery): Promise<FeedItem[]> {
  const maxAge = q.maxAgeDays ?? cfg("relevance_window_days", 7);
  const cutoff = new Date(Date.now() - maxAge * 86400000).toISOString();

  let query = supabase
    .from("feed_scores")
    .select("*")
    .gte("created_at", cutoff)
    .order(q.orderBy, { ascending: false })
    .limit(q.limit);

  if (q.offset) query = query.range(q.offset, q.offset + q.limit - 1);

  const { data } = await query;
  const items = (data || [])
    .filter(
      (r: Record<string, unknown>) =>
        !(q.excludeIds || []).includes(r.content_id as string)
    )
    .map(toFeedItem);

  return items;
}

async function getFairnessContent(
  limit: number,
  excludeIds: string[]
): Promise<FeedItem[]> {
  const followerThreshold = cfg("new_creator_threshold_followers", 1000);
  const daysThreshold = cfg("new_creator_threshold_days", 90);
  const dateCutoff = new Date(
    Date.now() - daysThreshold * 86400000
  ).toISOString();
  const recentActivity = new Date(
    Date.now() - 7 * 86400000
  ).toISOString();

  const { data: smallCreators } = await supabase
    .from("profiles")
    .select("id")
    .lt("follower_count", followerThreshold)
    .not("username", "is", null)
    .or(`created_at.gte.${dateCutoff},last_activity_at.gte.${recentActivity}`)
    .limit(200);

  if (!smallCreators || smallCreators.length === 0) return [];

  const creatorIds = smallCreators.map((c: { id: string }) => c.id);
  const windowDays = cfg("relevance_window_days", 7);
  const contentCutoff = new Date(
    Date.now() - windowDays * 86400000
  ).toISOString();

  const { data } = await supabase
    .from("feed_scores")
    .select("*")
    .in("creator_id", creatorIds)
    .gte("created_at", contentCutoff)
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  const filtered = (data || []).filter(
    (r: Record<string, unknown>) =>
      !excludeIds.includes(r.content_id as string)
  );

  // 1 item per creator max in fairness slots
  const seen = new Set<string>();
  const picked: FeedItem[] = [];
  for (const row of filtered) {
    if (seen.has(row.creator_id)) continue;
    seen.add(row.creator_id);
    const item = toFeedItem(row);
    item.tier = "fairness";
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

async function getRandomQuality(
  limit: number,
  excludeIds: string[]
): Promise<FeedItem[]> {
  const windowDays = cfg("relevance_window_days", 7);
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

  const { data } = await supabase
    .from("feed_scores")
    .select("*")
    .gte("created_at", cutoff)
    .gte("unique_engagers", 1)
    .limit(100);

  if (!data || data.length === 0) return [];

  const filtered = data.filter(
    (r: Record<string, unknown>) =>
      !excludeIds.includes(r.content_id as string)
  );
  // Fisher-Yates shuffle
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }

  return filtered.slice(0, limit).map((r: Record<string, unknown>) => {
    const item = toFeedItem(r);
    item.tier = "explore_random";
    return item;
  });
}

// ── Cooldown: prevent one creator dominating top-3 ──
function applyCooldown(items: FeedItem[]): FeedItem[] {
  const maxPercent = cfg("cooldown_max_top3_percent", 30) / 100;
  const maxTop3 = Math.max(1, Math.round(3 * maxPercent));
  const creatorTop3: Record<string, number> = {};
  const result: FeedItem[] = [];
  const deferred: FeedItem[] = [];

  for (const item of items) {
    if (result.length < 3) {
      const count = creatorTop3[item.creator_id] || 0;
      if (count >= maxTop3) {
        deferred.push(item);
        continue;
      }
      creatorTop3[item.creator_id] = count + 1;
    }
    result.push(item);
  }
  return [...result, ...deferred];
}

// ── Convert feed_scores row → FeedItem ──
function toFeedItem(row: Record<string, unknown>): FeedItem {
  return {
    id: row.id as string,
    content_type: row.content_type as string,
    content_id: row.content_id as string,
    creator_id: row.creator_id as string,
    composite_score: Number(row.composite_score) || 0,
    engagement_score: Number(row.engagement_score) || 0,
    momentum_score: Number(row.momentum_score) || 0,
    decay_factor: Number(row.decay_factor) || 0,
    created_at: row.created_at as string,
    tier: "ranked",
    content: {},
    profile: {},
  };
}

// ═══════════════════════════════════════════════════
// HYDRATION — join content + profile data
// ═══════════════════════════════════════════════════
async function hydrateItems(items: FeedItem[]): Promise<void> {
  if (items.length === 0) return;

  const postIds = items
    .filter((i) => i.content_type === "post")
    .map((i) => i.content_id);
  const metaIds = items
    .filter((i) => i.content_type === "meta")
    .map((i) => i.content_id);
  const storyIds = items
    .filter((i) => i.content_type === "story")
    .map((i) => i.content_id);

  const [postsRes, metasRes, storiesRes] = await Promise.all([
    postIds.length > 0
      ? supabase
          .from("posts")
          .select(
            "*, profiles:creator_id(id, username, display_name, avatar_url, identity_verified, verification_status, account_type)"
          )
          .in("id", postIds)
      : { data: [] },
    metaIds.length > 0
      ? supabase
          .from("metas")
          .select(
            "*, profiles:creator_id(id, username, display_name, avatar_url, verification_status)"
          )
          .in("id", metaIds)
      : { data: [] },
    storyIds.length > 0
      ? supabase
          .from("creator_stories")
          .select(
            "*, profile:creator_id(id, username, display_name, avatar_url, verification_status)"
          )
          .in("id", storyIds)
      : { data: [] },
  ]);

  const maps: Record<string, Record<string, Record<string, unknown>>> = {
    post: {},
    meta: {},
    story: {},
  };
  const profileKeys: Record<string, string> = {
    post: "profiles",
    meta: "profiles",
    story: "profile",
  };

  for (const p of postsRes.data || []) maps.post[p.id] = p;
  for (const m of metasRes.data || []) maps.meta[m.id] = m;
  for (const s of storiesRes.data || []) maps.story[s.id] = s;

  // Attach and prune missing
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const row = maps[item.content_type]?.[item.content_id];
    if (!row) {
      items.splice(i, 1);
      continue;
    }
    item.content = row;
    const pKey = profileKeys[item.content_type] || "profiles";
    item.profile = (row[pKey] || {}) as Record<string, unknown>;
  }
}
