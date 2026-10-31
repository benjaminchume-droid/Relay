-- Stories visible ONLY to the author + people in their roster (share any
-- conversation: direct chat or shared group/community). Previously the RPC
-- returned EVERY active story to EVERY caller — privacy = decoration only.
-- 'close_friends' is delivered to the roster too for now (no close-friends
-- roster exists yet); 'contacts' and 'everyone' behave identically here.

CREATE OR REPLACE FUNCTION public.get_active_stories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me uuid;
BEGIN
  me := public.current_profile_id();
  IF me IS NULL THEN RETURN '[]'::jsonb; END IF;

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
      AND (
        s.profile_id = me
        OR (
          coalesce(s.privacy::text, 'everyone') IN ('everyone', 'contacts', 'close_friends')
          AND EXISTS (
            SELECT 1
            FROM public.conversation_members mine
            JOIN public.conversation_members theirs
              ON theirs.conversation_id = mine.conversation_id
            WHERE mine.profile_id = me
              AND theirs.profile_id = s.profile_id
          )
        )
      )
  ), '[]'::jsonb);
END;
$function$;
