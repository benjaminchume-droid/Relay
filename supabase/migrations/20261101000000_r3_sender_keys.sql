-- R3 sender-key distribution storage.
-- Group/community senders wrap their chain key once per (recipient, chain)
-- inside the recipient's pairwise R1 session; recipients fetch their own row
-- on first decrypt of a chain. The backend stores wrapped blobs only.
create table if not exists public.sender_key_distributions (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_profile_id uuid not null references public.profiles(id) on delete cascade,
    recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
    chain_id text not null,
    wrapped text not null,
    created_at timestamptz not null default now(),
    unique (sender_profile_id, recipient_profile_id, chain_id)
);

create index if not exists idx_skd_recipient
    on public.sender_key_distributions(conversation_id, recipient_profile_id, sender_profile_id);

alter table public.sender_key_distributions enable row level security;

drop policy if exists "skd read own" on public.sender_key_distributions;
create policy "skd read own"
    on public.sender_key_distributions for select to authenticated
    using (
        recipient_profile_id = auth.uid()
        or sender_profile_id = auth.uid()
    );

drop policy if exists "skd insert as sender" on public.sender_key_distributions;
create policy "skd insert as sender"
    on public.sender_key_distributions for insert to authenticated
    with check (sender_profile_id = auth.uid());

drop policy if exists "skd delete own" on public.sender_key_distributions;
create policy "skd delete own"
    on public.sender_key_distributions for delete to authenticated
    using (sender_profile_id = auth.uid());
