-- Relay — Zero-knowledge encrypted sync vault (2026-11-01).
--
-- The client (src/lib/sync/vault.ts + vaultCrypto.ts) owns the whole key
-- hierarchy:
--   universal key  -> wrapped by PBKDF2(passphrase) in sync_vaults
--   space key      -> wrapped by the universal key in sync_space_keys
--   record key     -> fresh per write, wrapped by the space key in sync_blobs
--   shares         -> space key re-wrapped via ephemeral ECDH channel
--
-- The server contributes NO key material and can decrypt nothing. RLS is
-- strictly owner-scoped; the only cross-user reads are a share addressed to
-- the current user and the public half of a vault keypair (publishing a
-- public key is its purpose).

-- ---------------------------------------------------------------- vaults --
create table if not exists public.sync_vaults (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  kdf_salt   text not null,                   -- base64, per-user random
  uk_wrap    text not null,                   -- base64 ciphertext of the universal key
  wrap_iv    text not null,                   -- base64 96-bit IV for uk_wrap
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sync_vaults enable row level security;

drop policy if exists sync_vaults_owner_all on public.sync_vaults;
create policy sync_vaults_owner_all
  on public.sync_vaults for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -------------------------------------------------------------- keypairs --
-- Public half: readable by any authenticated user (that is how a share is
-- addressed). Writable by the owner only.
create table if not exists public.vault_pubkeys (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  pub_jwk    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.vault_pubkeys enable row level security;

drop policy if exists vault_pubkeys_owner_write on public.vault_pubkeys;
create policy vault_pubkeys_owner_write
  on public.vault_pubkeys for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists vault_pubkeys_authed_read on public.vault_pubkeys;
create policy vault_pubkeys_authed_read
  on public.vault_pubkeys for select to authenticated
  using (true);

-- Private half: stored ONLY wrapped by the universal key — the server never
-- sees the private key itself, so it cannot open shares addressed to the user.
create table if not exists public.vault_private_keys (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  priv_wrap    text not null,                 -- base64 ciphertext of the private JWK, sealed with the UK
  priv_wrap_iv text not null,
  created_at   timestamptz not null default now()
);

alter table public.vault_private_keys enable row level security;

drop policy if exists vault_privkeys_owner_all on public.vault_private_keys;
create policy vault_privkeys_owner_all
  on public.vault_private_keys for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------- space keys --
create table if not exists public.sync_space_keys (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  space     text not null,
  sk_wrap   text not null,                    -- wrapped by the universal key
  wrap_iv   text not null,
  primary key (user_id, space)
);

alter table public.sync_space_keys enable row level security;

drop policy if exists sync_space_keys_owner_all on public.sync_space_keys;
create policy sync_space_keys_owner_all
  on public.sync_space_keys for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------- blobs ---
create table if not exists public.sync_blobs (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  space       text not null,
  record_id   text not null default 'default',
  iv          text not null,                  -- record IV
  ct          text not null,                  -- AES-256-GCM ciphertext
  rk_wrap     text not null,                  -- record key wrapped by the space key
  rk_wrap_iv  text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, space, record_id),
  constraint sync_blob_size check (length(ct) <= 786432)  -- 768 KiB ciphertext ceiling
);

alter table public.sync_blobs enable row level security;

drop policy if exists sync_blobs_owner_all on public.sync_blobs;
create policy sync_blobs_owner_all
  on public.sync_blobs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists sync_blobs_user_updated_idx
  on public.sync_blobs (user_id, updated_at desc);

-- --------------------------------------------------------------- shares ---
create table if not exists public.sync_space_shares (
  space_owner      uuid not null references public.profiles(id) on delete cascade,
  space            text not null,
  recipient_id     uuid not null references public.profiles(id) on delete cascade,
  ephemeral_pub_jwk jsonb not null,           -- sender's throwaway ECDH public key
  sk_wrap          text not null,             -- space key sealed to the recipient's vault pubkey
  wrap_iv          text not null,
  created_at       timestamptz not null default now(),
  primary key (space_owner, space, recipient_id)
);

alter table public.sync_space_shares enable row level security;

drop policy if exists sync_shares_owner_manage on public.sync_space_shares;
create policy sync_shares_owner_manage
  on public.sync_space_shares for all to authenticated
  using (space_owner = auth.uid())
  with check (space_owner = auth.uid());

drop policy if exists sync_shares_recipient_read on public.sync_space_shares;
create policy sync_shares_recipient_read
  on public.sync_space_shares for select to authenticated
  using (recipient_id = auth.uid());

-- --------------------------------------------------------------- grants ---
grant select, insert, update, delete on
  public.sync_vaults, public.vault_pubkeys, public.vault_private_keys,
  public.sync_space_keys, public.sync_blobs, public.sync_space_shares
  to authenticated;

comment on table public.sync_vaults is
  'Zero-knowledge sync: passphrase-wrapped universal key. The server never sees plaintext key material.';
comment on table public.sync_space_shares is
  'Space keys sealed to a recipient via an EPHEMERAL ECDH(P-256)+HKDF channel — only the holder of the recipient vault private key can open them.';
