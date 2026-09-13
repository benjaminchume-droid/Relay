-- Feature flags for Relay (schema already exists on project gobwknacvpgysmgpvzqt)
-- Columns: key (PK text), enabled (bool default false), description (text), updated_at (timestamptz)

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read flags; only service role / admin writes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_flags' AND policyname = 'feature_flags_select_authenticated'
  ) THEN
    CREATE POLICY feature_flags_select_authenticated ON public.feature_flags
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.feature_flags (key, enabled, description, updated_at) VALUES
  ('messages', true, 'Direct messages and group chats', now()),
  ('calls', true, 'Voice and video calls', now()),
  ('voice_calls', true, 'Voice calling', now()),
  ('video_calls', true, 'Video calling', now()),
  ('group_calls', true, 'Group calling', now()),
  ('stories', true, '24h status / stories', now()),
  ('communities', true, 'Public and private communities', now()),
  ('uploads', true, 'Images, video, voice notes, files', now()),
  ('avatar_crop', true, 'Crop and size profile photos', now()),
  ('invite_links', true, 'Public /g /c /invite join links', now()),
  ('google_auth', true, 'Google OAuth via system browser', now()),
  ('light_mode', true, 'Allow users to switch light/dark theme', now()),
  ('e2ee', true, 'End-to-end encryption for DMs', now()),
  ('posts', true, 'Public and private posts', now())
ON CONFLICT (key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = now();
