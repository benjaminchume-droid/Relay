-- Relay — Signal-level E2EE support + delivery/read status + realtime presence
-- Tables: signal_identities, signal_one_time_prekeys (PUBLIC material only)
-- RPCs: get_prekey_bundle, mark_messages_status
-- Publication: user_presence for live presence

-- 1. Identity prekey bundles (public keys only)
CREATE TABLE IF NOT EXISTS public.signal_identities (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    ik_pub TEXT NOT NULL,
    sign_pub TEXT NOT NULL,
    spk_pub TEXT NOT NULL,
    spk_id BIGINT NOT NULL,
    spk_sig TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. One-time prekeys (public only; consumed/deleted on fetch)
CREATE TABLE IF NOT EXISTS public.signal_one_time_prekeys (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    opk_id BIGINT NOT NULL,
    opk_pub TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (profile_id, opk_id)
);
CREATE INDEX IF NOT EXISTS idx_signal_opk_profile ON public.signal_one_time_prekeys(profile_id);

ALTER TABLE public.signal_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_one_time_prekeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_identities_read ON public.signal_identities;
CREATE POLICY signal_identities_read ON public.signal_identities
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS signal_identities_write ON public.signal_identities;
CREATE POLICY signal_identities_write ON public.signal_identities
    FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS signal_opk_read ON public.signal_one_time_prekeys;
CREATE POLICY signal_opk_read ON public.signal_one_time_prekeys
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS signal_opk_write ON public.signal_one_time_prekeys;
CREATE POLICY signal_opk_write ON public.signal_one_time_prekeys
    FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

-- 3. Prekey bundle RPC — pops one unused OTK atomically (deleted on fetch,
--    Signal server behaviour); falls back to no-OTK when pool is empty.
CREATE OR REPLACE FUNCTION public.get_prekey_bundle(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    ik_row public.signal_identities;
    opk_row public.signal_one_time_prekeys;
    result JSONB;
BEGIN
    SELECT * INTO ik_row FROM public.signal_identities WHERE profile_id = p_profile_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No identity registered for this profile';
    END IF;

    DELETE FROM public.signal_one_time_prekeys
    WHERE id = (
        SELECT id FROM public.signal_one_time_prekeys
        WHERE profile_id = p_profile_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING opk_id, opk_pub INTO opk_row.opk_id, opk_row.opk_pub;

    result := jsonb_build_object(
        'ik_pub', ik_row.ik_pub,
        'sign_pub', ik_row.sign_pub,
        'spk_pub', ik_row.spk_pub,
        'spk_id', ik_row.spk_id,
        'spk_sig', ik_row.spk_sig,
        'opk_id', opk_row.opk_id,
        'opk_pub', opk_row.opk_pub
    );
    RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_prekey_bundle(UUID) TO authenticated;

-- 4. Delivery/read status — recipients mark peers' messages; sender sees ticks.
CREATE OR REPLACE FUNCTION public.mark_messages_status(
    p_conversation_id UUID,
    p_status TEXT,
    p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    me UUID;
    updated INT;
BEGIN
    me := public.current_profile_id();
    IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF p_status NOT IN ('delivered', 'read') THEN RAISE EXCEPTION 'Invalid status'; END IF;
    IF NOT public.is_conversation_member(p_conversation_id) THEN
        RAISE EXCEPTION 'Not a member of this conversation';
    END IF;

    UPDATE public.messages m
    SET send_status = p_status, updated_at = NOW()
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> me
      AND m.send_status <> 'read'
      AND (p_status = 'read' OR m.send_status <> 'delivered')
      AND (p_before IS NULL OR m.created_at <= p_before);
    GET DIAGNOSTICS updated = ROW_COUNT;

    -- reflect into sender-facing unread tracking
    UPDATE public.conversation_members cm
    SET unread_count = 0,
        last_read_message_id = (
            SELECT m.id FROM public.messages m
            WHERE m.conversation_id = p_conversation_id
            ORDER BY m.created_at DESC LIMIT 1
        )
    WHERE cm.conversation_id = p_conversation_id AND cm.profile_id = me;

    RETURN updated;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_messages_status(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- 5. Live presence in realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
