import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://gobwknacvpgysmgpvzqt.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvYndrbmFjdnBneXNtZ3B2enF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTk5MzUsImV4cCI6MjA5NjU5NTkzNX0.1PsVy5VJiTr2vp7Qfj4zBEfBWHYrR6mvfqTkcZl48N4";

const metaEnv = (import.meta as any).env || {};
export const supabaseUrl = metaEnv.VITE_SUPABASE_URL || metaEnv.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

const globalForSupabase = globalThis as unknown as {
  supabaseBrowserInstance?: SupabaseClient;
};

export const supabase: SupabaseClient =
  globalForSupabase.supabaseBrowserInstance ||
  (globalForSupabase.supabaseBrowserInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
    realtime: {
      params: { eventsPerSecond: 12 },
    },
  }));
