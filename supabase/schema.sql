-- RELAY Production Database Schema & Security Architecture
-- Migration Target: PostgreSQL / Supabase
-- Features: Auth, Profiles, Direct & Group Messaging, Communities, Statuses, Notifications, RLS, Realtime Sync

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    banner_url TEXT,
    bio TEXT DEFAULT 'New RELAY member.',
    status_message TEXT DEFAULT 'Available',
    online_status TEXT DEFAULT 'offline',
    last_seen TEXT DEFAULT 'Just now',
    country TEXT DEFAULT 'United States',
    date_of_birth DATE,
    contacts JSONB DEFAULT '[]'::jsonb,
    blocked_users JSONB DEFAULT '[]'::jsonb,
    sent_requests JSONB DEFAULT '[]'::jsonb,
    received_requests JSONB DEFAULT '[]'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    settings JSONB DEFAULT '{
        "appearance": {
            "themeMode": "light",
            "designLanguage": "liquid-glass",
            "accentColor": "liquid-azure",
            "blurIntensity": 24,
            "transparency": 40,
            "cornerRadius": 18,
            "shadowDepth": 30,
            "glassDepth": 40,
            "refraction": 30,
            "edgeGlow": 25,
            "animationSpeed": "smooth",
            "uiDensity": "comfortable",
            "chatWallpaper": "glass-gradient",
            "storiesLayout": "horizontal",
            "bubbleStyle": "edge-glow",
            "bubbleSpacing": 10,
            "fontSize": "sm",
            "appIcon": "liquid-blue",
            "soundEnabled": true,
            "hapticsEnabled": true,
            "reducedMotion": false,
            "perChatThemes": {}
        },
        "privacy": {
            "whoCanMessage": "everyone",
            "whoCanAddGroups": "everyone",
            "hideOnline": false,
            "hideLastSeen": false,
            "readReceipts": true,
            "offlineMode": false,
            "profilePhotoVisibility": "everyone",
            "bioVisibility": "everyone",
            "allowTagging": true,
            "messageRequests": true,
            "communityInvites": true,
            "typingIndicator": true,
            "linkPreview": true
        },
        "security": {
            "twoFactorEnabled": false,
            "activeSessions": [],
            "loginAlerts": true
        },
        "notifications": {
            "enabled": true,
            "directMessages": true,
            "groupMentions": true,
            "reactions": true,
            "sound": "gentle_chime",
            "vibration": true
        }
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar_url TEXT,
    bio VARCHAR(500),
    status VARCHAR(100) DEFAULT 'offline',
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DEVICE SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.user_sessions (
    token TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    browser TEXT,
    ip_address TEXT DEFAULT '127.0.0.1',
    location TEXT DEFAULT 'Active Region',
    last_active TEXT DEFAULT 'Just now',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);

-- 4. OTP CODES TABLE
CREATE TABLE IF NOT EXISTS public.otp_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    purpose TEXT DEFAULT 'verification',
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CHATS TABLE
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group')),
    name TEXT,
    description TEXT,
    avatar_url TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_private BOOLEAN DEFAULT FALSE,
    pinned_message_id UUID,
    disappearing_messages TEXT DEFAULT 'off',
    invite_link TEXT,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CHAT PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS public.chat_participants (
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('creator', 'admin', 'member')),
    unread_count INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON public.chat_participants(user_id);

-- 7. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    content TEXT,
    type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'voice', 'file', 'audio', 'system')),
    attachments JSONB DEFAULT '[]'::jsonb,
    reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    reactions JSONB DEFAULT '[]'::jsonb,
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_forwarded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON public.messages(chat_id, created_at DESC);

-- 8. TYPING STATES TABLE
CREATE TABLE IF NOT EXISTS public.typing_states (
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_name TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    PRIMARY KEY (chat_id, user_id)
);

-- 9. COMMUNITIES TABLE
CREATE TABLE IF NOT EXISTS public.communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    handle VARCHAR(30) UNIQUE NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'General',
    banner_url TEXT,
    avatar_url TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    member_count INT DEFAULT 1,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communities_handle ON public.communities(handle);

-- 10. COMMUNITY MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.community_members (
    community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

-- 11. COMMUNITY POSTS TABLE
CREATE TABLE IF NOT EXISTS public.community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    image_url TEXT,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_community ON public.community_posts(community_id, created_at DESC);

-- 12. COMMUNITY POST COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.community_post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    author_name TEXT NOT NULL,
    author_avatar TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. COMMUNITY POST LIKES TABLE
CREATE TABLE IF NOT EXISTS public.community_post_likes (
    post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

-- 14. STATUSES / STORIES TABLE
CREATE TABLE IF NOT EXISTS public.statuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'audio', 'location', 'poll')),
    content TEXT,
    media_url TEXT,
    background_gradient TEXT,
    privacy TEXT DEFAULT 'everyone' CHECK (privacy IN ('everyone', 'contacts', 'selected')),
    poll_options JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. STATUS VIEWS TABLE
CREATE TABLE IF NOT EXISTS public.status_views (
    status_id UUID REFERENCES public.statuses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (status_id, user_id)
);

-- 16. STATUS LIKES TABLE
CREATE TABLE IF NOT EXISTS public.status_likes (
    status_id UUID REFERENCES public.statuses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (status_id, user_id)
);

-- 17. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. USER REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. USER BLOCKS TABLE
CREATE TABLE IF NOT EXISTS public.user_blocks (
    blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- AUTHENTICATION HOOK AUTOMATION (PROFILE SYNC)
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

    v_raw_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
    IF v_raw_username IS NOT NULL THEN
        v_username := LOWER(REGEXP_REPLACE(v_raw_username, '[^a-zA-Z0-9_]', '', 'g'));
    END IF;

    IF v_username IS NULL OR LENGTH(v_username) < 3 THEN
        v_username := 'user_' || SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8);
    END IF;

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

    BEGIN
        INSERT INTO public.profiles (
            id, username, full_name, email, avatar_url, bio, status_message, online_status, country
        )
        VALUES (
            NEW.id, v_username, v_display_name, v_email, v_avatar, 'Exploring Relay.', 'Available', 'offline', 'United States'
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = CASE WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: Profile insert exception for %: %', NEW.id, SQLERRM;
    END;

    BEGIN
        INSERT INTO public.users (
            id, username, display_name, email, avatar_url, bio, status, is_verified
        )
        VALUES (
            NEW.id, v_username, v_display_name, v_email, v_avatar, 'Exploring Relay.', 'offline', FALSE
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
