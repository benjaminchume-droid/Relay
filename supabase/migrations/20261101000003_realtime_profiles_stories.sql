-- Live profile + story updates: put both tables on the realtime publication
-- so avatar/banner/profile edits and new stories propagate to every open
-- client immediately (avatars used to stay stale until a full refetch).
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
