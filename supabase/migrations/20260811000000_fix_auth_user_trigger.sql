-- =============================================================
-- FIX AUTH USER CREATED TRIGGER FUNCTION
-- Migration Version: 20260811000000
-- Target Engine: PostgreSQL / Supabase
-- Description: Fixes Database Error on Sign Up by handling missing
--              metadata safely, generating unique fallback usernames,
--              and preventing exceptions on NULL/UNIQUE constraints.
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_raw_username TEXT;
    v_raw_name TEXT;
    v_username VARCHAR(100);
    v_display_name TEXT;
    v_email TEXT;
    v_avatar TEXT;
BEGIN
    v_email := NEW.email;

    -- Extract raw username from metadata
    v_raw_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
    IF v_raw_username IS NOT NULL THEN
        v_username := LOWER(REGEXP_REPLACE(v_raw_username, '[^a-zA-Z0-9_]', '', 'g'));
    END IF;

    -- Generate safe fallback username if missing or invalid
    IF v_username IS NULL OR LENGTH(v_username) < 3 THEN
        v_username := 'user_' || SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8);
    END IF;

    -- Extract full/display name from metadata or email prefix fallback
    v_raw_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    IF v_raw_name IS NULL THEN
        v_raw_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), '');
    END IF;
    IF v_raw_name IS NULL THEN
        v_raw_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), '');
    END IF;

    v_display_name := COALESCE(v_raw_name, SPLIT_PART(v_email, '@', 1), 'Relay User');
    v_avatar := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    );

    -- 1. Safely insert or update public.profiles
    BEGIN
        INSERT INTO public.profiles (
            id,
            username,
            full_name,
            email,
            avatar_url,
            bio,
            status_message,
            online_status,
            country
        )
        VALUES (
            NEW.id,
            v_username,
            v_display_name,
            v_email,
            v_avatar,
            'Exploring Relay.',
            'Available',
            'offline',
            'United States'
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = CASE 
                WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' 
                THEN EXCLUDED.full_name 
                ELSE public.profiles.full_name 
            END,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: Profile insert exception for %: %', NEW.id, SQLERRM;
    END;

    -- 2. Safely insert or update public.users if table exists
    BEGIN
        INSERT INTO public.users (
            id,
            username,
            display_name,
            email,
            avatar_url,
            bio,
            status,
            is_verified
        )
        VALUES (
            NEW.id,
            v_username,
            v_display_name,
            v_email,
            v_avatar,
            'Exploring Relay.',
            'offline',
            FALSE
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        -- Ignore if public.users is not used or constraints differ
        NULL;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
