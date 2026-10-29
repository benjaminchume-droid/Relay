-- Relay migration 2026-10-31
--  1. Allow 'channel' conversation_type (Discord-style community channels map
--     to real conversations; the check constraint rejected them).
--  2. Stories: 'voice' story type, media duration, text styling columns,
--     create_story RPC extended, audio allowed in story-media bucket,
--     get_active_stories returns the new fields.

-- 1) conversations type check
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_conversation_type_check
  CHECK (((conversation_type)::text = ANY (ARRAY[
    'direct'::character varying, 'group'::character varying, 'channel'::character varying
  ]::text[])));

-- 2) stories voice + styling
ALTER TYPE public.story_type_enum ADD VALUE IF NOT EXISTS 'voice';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS media_duration_ms integer;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/*','video/*','audio/*']::text[]
WHERE id = 'story-media';

CREATE OR REPLACE FUNCTION public.create_story(
  p_story_type text DEFAULT 'text',
  p_caption text DEFAULT NULL,
  p_media_url text DEFAULT NULL,
  p_privacy text DEFAULT 'everyone',
  p_background_color text DEFAULT NULL,
  p_duration_hours integer DEFAULT 24,
  p_duration_ms integer DEFAULT NULL,
  p_text_color text DEFAULT NULL,
  p_font_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me uuid;
  st text;
  pr text;
  row public.stories;
BEGIN
  me := public.current_profile_id();
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  st := lower(coalesce(p_story_type, 'text'));
  IF st NOT IN ('image','video','text','voice') THEN st := 'text'; END IF;
  pr := lower(coalesce(p_privacy, 'everyone'));
  IF pr NOT IN ('everyone','contacts','close_friends','custom','only_me') THEN pr := 'everyone'; END IF;

  INSERT INTO public.stories (
    profile_id, story_type, privacy, caption, media_url,
    background_color, text_color, font_name, media_duration_ms, expires_at
  ) VALUES (
    me,
    st::public.story_type_enum,
    pr::public.story_privacy_enum,
    p_caption,
    p_media_url,
    p_background_color,
    p_text_color,
    p_font_name,
    p_duration_ms,
    now() + make_interval(hours => greatest(1, least(coalesce(p_duration_hours, 24), 72)))
  )
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_stories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'profile_id', s.profile_id,
      'story_type', s.story_type,
      'caption', s.caption,
      'media_url', s.media_url,
      'background_color', s.background_color,
      'text_color', s.text_color,
      'font_name', s.font_name,
      'media_duration_ms', s.media_duration_ms,
      'privacy', s.privacy,
      'view_count', coalesce(s.view_count, 0),
      'expires_at', s.expires_at,
      'created_at', s.created_at,
      'display_name', coalesce(p.display_name, p.full_name, p.username),
      'username', p.username,
      'avatar_url', p.avatar_url
    ) ORDER BY s.created_at DESC)
    FROM public.stories s
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.expires_at > now()
      AND coalesce(s.privacy::text, 'everyone') IN ('everyone', 'contacts', 'close_friends')
  ), '[]'::jsonb);
END;
$function$;
