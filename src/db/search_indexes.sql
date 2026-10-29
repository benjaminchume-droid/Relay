-- =========================================================================
-- Relay Database Optimization & Fast Search Indexing Script
-- Enables pg_trgm for fast ILIKE / Fuzzy Search and RPC Query Functions
-- Execution target: Under 100ms query time for large user databases
-- =========================================================================

-- 1. Enable Trigram Extension for fast ILIKE wildcard matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN Trigram Indexes on User Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm 
ON public.profiles USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm 
ON public.profiles USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm 
ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm 
ON public.profiles USING gin (email gin_trgm_ops);

-- 3. GIN Trigram Indexes on Group Chats / Conversations
CREATE INDEX IF NOT EXISTS idx_chats_name_trgm 
ON public.chats USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_conversations_name_trgm 
ON public.conversations USING gin (name gin_trgm_ops);

-- 4. GIN Trigram Indexes on Communities
CREATE INDEX IF NOT EXISTS idx_communities_name_trgm 
ON public.communities USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_communities_handle_trgm 
ON public.communities USING gin (handle gin_trgm_ops);

-- =========================================================================
-- Fast RPC Search Functions with Strict Performance Limits
-- =========================================================================

-- RPC 1: Fast Profile Search
CREATE OR REPLACE FUNCTION public.search_profiles(query_text text)
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT *
  FROM public.profiles
  WHERE 
    query_text IS NULL OR query_text = '' OR
    username ILIKE '%' || query_text || '%' OR
    full_name ILIKE '%' || query_text || '%' OR
    display_name ILIKE '%' || query_text || '%' OR
    email ILIKE '%' || query_text || '%'
  ORDER BY 
    CASE WHEN username ILIKE query_text || '%' THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 25;
$$;

-- RPC 2: Fast Group Search
CREATE OR REPLACE FUNCTION public.search_groups(query_text text)
RETURNS SETOF public.chats
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT *
  FROM public.chats
  WHERE 
    is_group = true AND (
      query_text IS NULL OR query_text = '' OR
      name ILIKE '%' || query_text || '%'
    )
  ORDER BY updated_at DESC
  LIMIT 25;
$$;

-- RPC 3: Fast Community Search
CREATE OR REPLACE FUNCTION public.search_communities(query_text text)
RETURNS SETOF public.communities
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT *
  FROM public.communities
  WHERE 
    query_text IS NULL OR query_text = '' OR
    name ILIKE '%' || query_text || '%' OR
    handle ILIKE '%' || query_text || '%' OR
    description ILIKE '%' || query_text || '%'
  ORDER BY member_count DESC
  LIMIT 25;
$$;
