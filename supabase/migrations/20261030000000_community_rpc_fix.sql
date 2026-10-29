-- Fix community creation + join RPCs.
-- community_members.role_id is NOT NULL (no default) and has no role_name column:
--  - create_community (7-arg) inserted members without role_id        -> 23502 crash
--  - create_community (14-arg) / join_community (2-arg) used role_name -> column missing
-- This migration rewrites the functions the app actually calls (7-arg create, 1-arg join)
-- to create default roles and satisfy the constraint, and drops the broken overloads.

-- ---------------------------------------------------------------- create
CREATE OR REPLACE FUNCTION public.create_community(
  p_name text,
  p_slug text,
  p_description text DEFAULT NULL::text,
  p_category text DEFAULT 'General'::text,
  p_is_private boolean DEFAULT false,
  p_avatar_url text DEFAULT NULL::text,
  p_banner_url text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  me uuid;
  slug_clean text;
  vis public.community_visibility_enum;
  join_pol public.community_join_policy_enum;
  cid uuid;
  row public.communities;
  owner_role_id uuid;
BEGIN
  me := public.current_profile_id();
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN RAISE EXCEPTION 'Name required'; END IF;

  slug_clean := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-z0-9_]+', '', 'g'));
  IF length(slug_clean) < 3 THEN
    slug_clean := 'c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;
  IF EXISTS (SELECT 1 FROM public.communities WHERE slug::text = slug_clean) THEN
    slug_clean := left(slug_clean, 20) || '_' || substr(md5(random()::text), 1, 4);
  END IF;

  IF p_is_private THEN
    vis := 'private';
    join_pol := 'invite_only';
  ELSE
    vis := 'public';
    join_pol := 'open';
  END IF;

  INSERT INTO public.communities (
    name, slug, description, category, created_by, visibility, join_policy,
    avatar_url, banner_url, member_count, is_active
  ) VALUES (
    trim(p_name), slug_clean, p_description, coalesce(p_category, 'General'), me,
    vis, join_pol, p_avatar_url, p_banner_url, 1, true
  )
  RETURNING * INTO row;
  cid := row.id;

  -- default roles (owner / moderator / member)
  INSERT INTO public.community_roles (community_id, name, description, sort_order, is_system, is_default, permissions, created_by)
  VALUES (cid, 'owner', 'Community owner', 0, true, false, '{"*": true}'::jsonb, me)
  RETURNING id INTO owner_role_id;

  INSERT INTO public.community_roles (community_id, name, description, sort_order, is_system, is_default, permissions, created_by)
  VALUES
    (cid, 'moderator', 'Community moderator', 1, true, false, '{"manage_members": true, "manage_threads": true}'::jsonb, me),
    (cid, 'member', 'Community member', 2, true, true, '{"create_threads": true, "reply_threads": true}'::jsonb, me);

  -- owner membership (role_id is NOT NULL — this was the crash)
  INSERT INTO public.community_members (community_id, profile_id, status, role_id, is_owner, is_moderator, joined_at)
  VALUES (cid, me, 'active', owner_role_id, true, true, now());

  INSERT INTO public.community_channels (community_id, name, slug, channel_type, is_default, created_by, can_create_threads)
  VALUES
    (cid, 'general', 'general', 'text', true, me, true),
    (cid, 'announcements', 'announcements', 'text', false, me, true)
  ON CONFLICT DO NOTHING;

  RETURN to_jsonb(row);
END;
$fn$;

-- ---------------------------------------------------------------- join
-- (existing overload returns a different type — must drop first)
DROP FUNCTION IF EXISTS public.join_community(uuid);
CREATE OR REPLACE FUNCTION public.join_community(p_community_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  me uuid;
  v_role uuid;
BEGIN
  me := public.current_profile_id();
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = p_community_id AND is_active) THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  SELECT id INTO v_role
  FROM public.community_roles
  WHERE community_id = p_community_id AND name = 'member'
  ORDER BY sort_order
  LIMIT 1;

  IF v_role IS NULL THEN
    INSERT INTO public.community_roles (community_id, name, description, sort_order, is_system, is_default, permissions, created_by)
    VALUES (p_community_id, 'member', 'Community member', 2, true, true, '{"create_threads": true, "reply_threads": true}'::jsonb, me)
    RETURNING id INTO v_role;
  END IF;

  INSERT INTO public.community_members (community_id, profile_id, status, role_id, is_owner, is_moderator, joined_at)
  VALUES (p_community_id, me, 'active', v_role, false, false, now())
  ON CONFLICT (community_id, profile_id)
  DO UPDATE SET status = 'active', left_at = NULL, updated_at = now(), joined_at = COALESCE(community_members.joined_at, now());
END;
$fn$;

-- ---------------------------------------------------------------- drop broken overloads
-- (14-arg create / 2-arg join referenced a nonexistent role_name column)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS fn FROM pg_proc
    WHERE proname = 'create_community' AND pg_get_function_arguments(oid) LIKE 'p_name text, p_slug text DEFAULT%'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.fn);
  END LOOP;
  FOR r IN
    SELECT oid::regprocedure AS fn FROM pg_proc
    WHERE proname = 'join_community' AND pg_get_function_arguments(oid) LIKE 'p_community_id uuid, %'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.fn);
  END LOOP;
END $$;

-- Author embed for community_threads (PostgREST needs an FK to embed profiles)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_threads_author_id_fkey'
  ) THEN
    ALTER TABLE public.community_threads
      ADD CONSTRAINT community_threads_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
