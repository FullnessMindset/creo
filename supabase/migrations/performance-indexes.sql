-- ============================================================
-- CREO Platform — Performance Indexes & Query Optimization
-- Covers all tables used by frontend queries
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- ===== PROFILES — most queried table =====
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles (account_type);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect ON public.profiles (stripe_connect_id) WHERE stripe_connect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_identity_verified ON public.profiles (identity_verified) WHERE identity_verified = true;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_onboarded ON public.profiles (stripe_onboarded) WHERE stripe_onboarded = true;
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status ON public.profiles (verification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_last_activity ON public.profiles (last_activity_at DESC NULLS LAST);

-- ===== METAS — heavy read path (profile page, dashboard, explore) =====
CREATE INDEX IF NOT EXISTS idx_metas_creator ON public.metas (creator_id);
CREATE INDEX IF NOT EXISTS idx_metas_active ON public.metas (is_active, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_metas_creator_active ON public.metas (creator_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_metas_fund_stage ON public.metas (fund_stage) WHERE fund_stage > 0;
CREATE INDEX IF NOT EXISTS idx_metas_created ON public.metas (created_at DESC);

-- ===== META CONTRIBUTIONS =====
CREATE INDEX IF NOT EXISTS idx_meta_contributions_meta ON public.meta_contributions (meta_id);
CREATE INDEX IF NOT EXISTS idx_meta_contributions_created ON public.meta_contributions (created_at DESC);

-- ===== META LIKES & COMMENTS =====
CREATE INDEX IF NOT EXISTS idx_meta_likes_meta ON public.meta_likes (meta_id);
CREATE INDEX IF NOT EXISTS idx_meta_likes_user ON public.meta_likes (user_id, meta_id);
CREATE INDEX IF NOT EXISTS idx_meta_comments_meta ON public.meta_comments (meta_id, created_at DESC);

-- ===== META INVITES =====
CREATE INDEX IF NOT EXISTS idx_meta_invites_invitee ON public.meta_invites (invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_invites_meta ON public.meta_invites (meta_id);

-- ===== POSTS — feed page, heavy pagination =====
CREATE INDEX IF NOT EXISTS idx_posts_creator ON public.posts (creator_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_creator_created ON public.posts (creator_id, created_at DESC);

-- ===== POST LIKES & COMMENTS =====
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON public.post_likes (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON public.post_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON public.comment_likes (user_id, comment_id);

-- ===== CREATOR STORIES — explore page =====
CREATE INDEX IF NOT EXISTS idx_stories_creator ON public.creator_stories (creator_id);
CREATE INDEX IF NOT EXISTS idx_stories_created ON public.creator_stories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_likes_story ON public.story_likes (story_id);
CREATE INDEX IF NOT EXISTS idx_story_likes_user ON public.story_likes (user_id, story_id);
CREATE INDEX IF NOT EXISTS idx_story_comments_story ON public.story_comments (story_id, created_at DESC);

-- ===== FOLLOWS =====
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

-- ===== COMMUNITY POSTS =====
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON public.community_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON public.community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_likes_post ON public.community_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_community_likes_user ON public.community_likes (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON public.community_comments (post_id, created_at DESC);

-- ===== BRAND DEALS =====
CREATE INDEX IF NOT EXISTS idx_brand_deals_brand ON public.brand_deals (brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_deals_status ON public.brand_deals (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_brand_deals_created ON public.brand_deals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_deals_category ON public.brand_deals (category);
CREATE INDEX IF NOT EXISTS idx_deal_requests_deal ON public.brand_deal_requests (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_requests_creator ON public.brand_deal_requests (creator_id);
CREATE INDEX IF NOT EXISTS idx_deal_requests_brand ON public.brand_deal_requests (brand_id);
CREATE INDEX IF NOT EXISTS idx_deal_requests_status ON public.brand_deal_requests (status);

-- ===== DEAL CONVERSATIONS & MESSAGES =====
CREATE INDEX IF NOT EXISTS idx_deal_convos_creator ON public.deal_conversations (creator_id);
CREATE INDEX IF NOT EXISTS idx_deal_convos_brand ON public.deal_conversations (brand_id);
CREATE INDEX IF NOT EXISTS idx_deal_convos_deal ON public.deal_conversations (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_messages_convo ON public.deal_messages (conversation_id, created_at ASC);

-- ===== NOTIFICATIONS — read on every page load =====
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent ON public.notifications (user_id, created_at DESC);

-- ===== CONVERSATIONS & MESSAGES (DMs) =====
CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON public.conversations (user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON public.conversations (user2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON public.conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_messages_convo ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages (receiver_id, is_read) WHERE is_read = false;

-- ===== TIPS & SUBSCRIPTIONS =====
CREATE INDEX IF NOT EXISTS idx_tips_creator ON public.tips (creator_id);
CREATE INDEX IF NOT EXISTS idx_tips_created ON public.tips (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_creator ON public.subscriptions (creator_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status) WHERE status = 'active';

-- ===== REPORTS =====
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status);

-- ===== ANNOUNCEMENTS =====
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements (is_active, created_at DESC) WHERE is_active = true;

-- ===== TERMS ACCEPTANCE =====
-- Already has idx_terms_acceptance_user from fix-everything migration

-- ===== MECENAS SETTINGS =====
CREATE INDEX IF NOT EXISTS idx_mecenas_settings_creator ON public.mecenas_settings (creator_id);

-- ===== DEAL CATEGORIES =====
CREATE INDEX IF NOT EXISTS idx_deal_categories_slug ON public.deal_categories (slug);

-- ===== ANALYZE all tables to update query planner stats =====
ANALYZE public.profiles;
ANALYZE public.metas;
ANALYZE public.meta_contributions;
ANALYZE public.posts;
ANALYZE public.creator_stories;
ANALYZE public.follows;
ANALYZE public.community_posts;
ANALYZE public.brand_deals;
ANALYZE public.brand_deal_requests;
ANALYZE public.deal_conversations;
ANALYZE public.deal_messages;
ANALYZE public.notifications;
ANALYZE public.tips;
ANALYZE public.subscriptions;
ANALYZE public.reports;
ANALYZE public.announcements;
