-- Encrypted, account-scoped identity backup.
-- Lets a user restore their Signal identity after sign-out / storage eviction
-- / new device, so historical messages stay decryptable after re-login.
-- The blob is AES-GCM ciphertext; the wrapping key is derived client-side
-- from the user's own auth uid + profile id (never stored in this table).

CREATE TABLE IF NOT EXISTS public.signal_identity_backup (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    blob TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.signal_identity_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "identity backup owner select" ON public.signal_identity_backup;
DROP POLICY IF EXISTS "identity backup owner write" ON public.signal_identity_backup;

CREATE POLICY "identity backup owner select" ON public.signal_identity_backup
    FOR SELECT USING (profile_id = public.current_profile_id());

CREATE POLICY "identity backup owner write" ON public.signal_identity_backup
    FOR INSERT WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "identity backup owner update" ON public.signal_identity_backup
    FOR UPDATE USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());
