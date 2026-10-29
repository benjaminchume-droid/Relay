-- =============================================================
-- RELAY GLOBAL COMMUNICATION PLATFORM DATABASE SCHEMA
-- GLASSLINE STUDIO • ENGINE VERSION v2.0
-- =============================================================

-- Enable required Postgres extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- CORE DOMAIN TABLES
-- =============================================================

-- 1. USERS PROFILE TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY, -- Synchronized with auth.users(id) via hooks
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar_url TEXT,
    bio VARCHAR(500),
    status VARCHAR(100) DEFAULT 'offline'::character varying,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for lightning fast username or name autocompletion
CREATE INDEX IF NOT EXISTS idx_users_username_search ON public.users (username);
CREATE INDEX IF NOT EXISTS idx_users_display_name_search ON public.users (display_name);

-- 2. CONVERSATIONS TABLE (Scales direct message, group chat, and workspace channels)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR(50) NOT NULL CONSTRAINT check_conv_type CHECK (type IN ('direct', 'group', 'channel', 'workspace')),
    name VARCHAR(255),
    description VARCHAR(1000),
    avatar TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for layout sorting
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations (type);

-- 3. CONVERSATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.conversation_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(50) DEFAULT 'member' NOT NULL CONSTRAINT check_member_role CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_read_message_id UUID,
    muted BOOLEAN DEFAULT FALSE NOT NULL,
    archived BOOLEAN DEFAULT FALSE NOT NULL,
    CONSTRAINT uniq_member_conversation UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_user_id ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_composite ON public.conversation_members(conversation_id, user_id);

-- 4. MESSAGES TABLE (Standardized and robust message payload)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text' NOT NULL CONSTRAINT check_msg_type CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'system')),
    content TEXT,
    edited BOOLEAN DEFAULT FALSE NOT NULL,
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sorted ON public.messages(conversation_id, created_at DESC);

-- 5. MESSAGE ATTACHMENTS (Direct support for media buckets)
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
    storage_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL, -- in bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. MESSAGE REACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_reactions_user_msg UNIQUE (message_id, user_id, emoji)
);

-- 7. READ RECEIPTS TABLE
CREATE TABLE IF NOT EXISTS public.read_receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_read_receipt_user UNIQUE (message_id, user_id)
);

-- 8. CONTACTS RELATIONSHIP TABLE (Builds real user social graph)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    contact_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL CONSTRAINT check_contact_status CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_user_relation UNIQUE (user_id, contact_user_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id, status);

-- 9. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE (read = FALSE);

-- =============================================================
-- SECURITY, REPORTS AND MODERATION
-- =============================================================

-- 10. REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reported_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CONSTRAINT check_report_status CHECK (status IN ('pending', 'under_review', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. BLOCKED USERS MAP
CREATE TABLE IF NOT EXISTS public.blocked_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    blocked_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_block_mapping UNIQUE (user_id, blocked_user_id)
);

-- 12. MUTED USERS MAP
CREATE TABLE IF NOT EXISTS public.muted_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    muted_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uniq_mute_mapping UNIQUE (user_id, muted_user_id)
);

-- =============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muted_users ENABLE ROW LEVEL SECURITY;

-- 1. PROFILE PROTECTION
CREATE POLICY "Profiles are readable by authenticated network users"
    ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can edit their personal profiles"
    ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 2. CONVERSATION ISOLATION
CREATE POLICY "Conversations are readable only by members"
    ON public.conversations FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = id
              AND conversation_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Allows user to start active conversations"
    ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

-- 3. MEMBERS DISCOVERY
CREATE POLICY "Members view matches of their chats"
    ON public.conversation_members FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members AS cm
            WHERE cm.conversation_id = conversation_id
              AND cm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join conversations"
    ON public.conversation_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 4. MESSAGE EXCLUSIONS
CREATE POLICY "Messages readable by conversation participants"
    ON public.messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = conversation_id
              AND conversation_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Messages transmittable by members"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = conversation_id
              AND conversation_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Authors can delete or edit messages"
    ON public.messages FOR UPDATE TO authenticated
    USING (sender_id = auth.uid());

-- =============================================================
-- AUTHENTICATION HOOK AUTOMATION (PROFILE SYNC)
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_username VARCHAR(100);
BEGIN
    v_username := COALESCE(
        (new.raw_user_meta_data->>'username'),
        split_part(new.email, '@', 1) || '_' || substring(md5(random()::text) from 1 for 4)
    );

    INSERT INTO public.users (id, username, display_name, email, avatar_url, bio, status, is_verified)
    VALUES (
        new.id,
        LOWER(v_username),
        COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
        new.email,
        COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'),
        COALESCE(new.raw_user_meta_data->>'bio', 'New RELAY Communicator'),
        'offline',
        FALSE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
