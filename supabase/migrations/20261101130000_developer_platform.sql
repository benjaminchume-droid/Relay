set search_path to public, extensions;

-- Relay developer platform: businesses, apps (auth + messaging SDK), templates,
-- OAuth consent/codes and SDK messaging directory. Mirrors the Genjutsu Auth
-- provider pattern: one business per account, secrets hashed, codes short-lived,
-- SDK backend only ever touches ciphertext.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- businesses
create table if not exists public.developer_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  username text not null unique check (username ~ '^[a-z0-9_]{2,30}$'),
  description text check (char_length(coalesce(description, '')) <= 500),
  avatar_url text,
  website_url text,
  synced_from text check (synced_from in ('genjutsu')),
  genjutsu_username text check (genjutsu_username ~ '^[a-z0-9_]{2,30}(\.auth)?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.developer_businesses is
  'One developer business per Relay account. Public read powers consent + sync.';

alter table public.developer_businesses enable row level security;

drop policy if exists businesses_public_read on public.developer_businesses;
create policy businesses_public_read on public.developer_businesses
  for select using (true);

drop policy if exists businesses_owner_write on public.developer_businesses;
create policy businesses_owner_write on public.developer_businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------- apps
create table if not exists public.developer_apps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.developer_businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  product text not null default 'auth' check (product in ('auth', 'messaging_sdk')),
  platform text not null default 'web' check (platform in ('android', 'ios', 'web')),
  package_name text check (package_name is null or package_name ~* '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  origins text[] not null default '{}',
  redirect_uris text[] not null default '{}',
  scopes text[] not null default '{identity}'
    check (scopes <@ array['identity','profile:read','email:read','messages:send','messages:read']::text[]),
  client_id text not null unique check (client_id ~ '^rl_[a-f0-9]{24}$'),
  client_secret_hash text,
  is_active boolean not null default true,
  last_secret_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists developer_apps_business_idx on public.developer_apps (business_id);

alter table public.developer_apps enable row level security;

drop policy if exists apps_owner_read on public.developer_apps;
create policy apps_owner_read on public.developer_apps
  for select using (exists (
    select 1 from public.developer_businesses b
    where b.id = developer_apps.business_id and b.owner_id = auth.uid()
  ));

drop policy if exists apps_owner_write on public.developer_apps;
create policy apps_owner_write on public.developer_apps
  for all using (exists (
    select 1 from public.developer_businesses b
    where b.id = developer_apps.business_id and b.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.developer_businesses b
    where b.id = developer_apps.business_id and b.owner_id = auth.uid()
  ));

-- ----------------------------------------------------------------- templates
create table if not exists public.developer_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.developer_businesses(id) on delete cascade,
  kind text not null check (kind in ('otp','magic_link','password_change','account_update','custom')),
  name text not null check (char_length(name) between 1 and 60),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 5000),
  ttl_seconds int not null default 60 check (ttl_seconds between 30 and 3600),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists developer_templates_business_idx on public.developer_templates (business_id);

alter table public.developer_templates enable row level security;

drop policy if exists templates_owner_all on public.developer_templates;
create policy templates_owner_all on public.developer_templates
  for all using (exists (
    select 1 from public.developer_businesses b
    where b.id = developer_templates.business_id and b.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.developer_businesses b
    where b.id = developer_templates.business_id and b.owner_id = auth.uid()
  ));

-- ------------------------------------------------------------------ consents
create table if not exists public.oauth_consents (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null default '{identity}',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (app_id, user_id)
);
alter table public.oauth_consents enable row level security;

drop policy if exists consents_own on public.oauth_consents;
create policy consents_own on public.oauth_consents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------------- codes
-- 10-minute single-use authorization codes. Service role only (edge functions).
create table if not exists public.oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null default '{identity}',
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.oauth_codes enable row level security;
-- no policies: locked for clients, service role bypasses RLS

-- ------------------------------------------------------- SDK messaging tables
-- Directory of third-party app users' public keys. Envelopes are ciphertext
-- (ECDH + AES-GCM done inside the SDK); our backend never holds plaintext.
create table if not exists public.sdk_identities (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  external_id text not null check (char_length(external_id) between 1 and 128),
  public_key jsonb not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, external_id)
);
create index if not exists sdk_identities_app_idx on public.sdk_identities (app_id);
alter table public.sdk_identities enable row level security;

create table if not exists public.sdk_messages (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  sender_external_id text not null,
  recipient_external_id text not null,
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz
);
create index if not exists sdk_messages_inbox_idx
  on public.sdk_messages (app_id, recipient_external_id, created_at desc);
create index if not exists sdk_messages_sender_idx
  on public.sdk_messages (app_id, sender_external_id, created_at desc);
alter table public.sdk_messages enable row level security;

-- ==========================================================================
-- RPCs — business
-- ==========================================================================
create or replace function public.developer_create_business(
  p_name text,
  p_username text,
  p_description text default null,
  p_avatar_url text default null,
  p_website_url text default null,
  p_synced_from text default null,
  p_genjutsu_username text default null
)
returns public.developer_businesses
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.developer_businesses;
  v_handle text := lower(trim(p_username));
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not (v_handle ~ '^[a-z0-9_]{2,30}$') then
    raise exception 'handle must be 2-30 chars: a-z, 0-9, underscore';
  end if;
  if p_synced_from is not null and p_synced_from not in ('genjutsu') then
    raise exception 'unknown sync source';
  end if;

  insert into public.developer_businesses
    (owner_id, name, username, description, avatar_url, website_url,
     synced_from, genjutsu_username)
  values
    (v_uid, trim(p_name), v_handle, p_description, p_avatar_url, p_website_url,
     p_synced_from,
     case when p_genjutsu_username is null then null
          else lower(trim(p_genjutsu_username)) end)
  on conflict (owner_id) do update
    set name = excluded.name,
        username = excluded.username,
        description = excluded.description,
        avatar_url = excluded.avatar_url,
        website_url = excluded.website_url,
        synced_from = excluded.synced_from,
        genjutsu_username = excluded.genjutsu_username,
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$function$;

create or replace function public.developer_update_business(
  p_name text default null,
  p_description text default null,
  p_avatar_url text default null,
  p_website_url text default null
)
returns public.developer_businesses
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare v_row public.developer_businesses;
begin
  update public.developer_businesses set
    name = coalesce(p_name, name),
    description = coalesce(p_description, description),
    avatar_url = coalesce(p_avatar_url, avatar_url),
    website_url = coalesce(p_website_url, website_url),
    updated_at = now()
  where owner_id = auth.uid()
  returning * into v_row;
  if v_row is null then raise exception 'no business profile' using errcode = '42501'; end if;
  return v_row;
end;
$function$;

-- ==========================================================================
-- RPCs — apps
-- ==========================================================================
create or replace function public.developer_create_app(
  p_business_id uuid,
  p_name text,
  p_product text default 'auth',
  p_platform text default 'web',
  p_package_name text default null,
  p_origins text[] default null,
  p_redirect_uris text[] default null,
  p_scopes text[] default '{identity}'
)
returns table(client_id text, client_secret text)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_app public.developer_apps;
  v_secret text;
  v_cid text;
begin
  if v_uid is null or not exists (
    select 1 from public.developer_businesses
    where id = p_business_id and owner_id = v_uid
  ) then
    raise exception 'not your business' using errcode = '42501';
  end if;

  if p_product not in ('auth','messaging_sdk') then
    raise exception 'invalid product';
  end if;
  if p_platform not in ('android','ios','web') then
    raise exception 'invalid platform';
  end if;
  if p_platform in ('android','ios') then
    if p_package_name is null or p_package_name !~* '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' then
      raise exception 'mobile apps need a package name like com.example.app';
    end if;
  elsif p_redirect_uris is null or cardinality(p_redirect_uris) = 0 then
    raise exception 'web apps need at least one redirect URI';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then
    p_scopes := array['identity'];
  end if;
  if not (p_scopes <@ array['identity','profile:read','email:read','messages:send','messages:read']::text[]) then
    raise exception 'invalid scopes';
  end if;

  v_cid := 'rl_' || encode(extensions.gen_random_bytes(12), 'hex');
  v_secret := 'rs_' || encode(extensions.gen_random_bytes(32), 'base64url');

  insert into public.developer_apps
    (business_id, name, product, platform, package_name, origins, redirect_uris,
     scopes, client_id, client_secret_hash, last_secret_rotated_at)
  values
    (p_business_id, trim(p_name), p_product, p_platform, p_package_name,
     coalesce(p_origins, '{}'), coalesce(p_redirect_uris, '{}'), p_scopes,
     v_cid, encode(extensions.digest(v_secret, 'sha256'), 'hex'), now())
  returning * into v_app;

  return query select v_app.client_id, v_secret;
end;
$function$;

create or replace function public.developer_rotate_app_secret(p_app_id uuid)
returns table(client_id text, client_secret text)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_app public.developer_apps;
  v_secret text;
begin
  select a.* into v_app from public.developer_apps a
  join public.developer_businesses b on b.id = a.business_id
  where a.id = p_app_id and b.owner_id = auth.uid();
  if v_app is null then raise exception 'not your app' using errcode = '42501'; end if;

  v_secret := 'rs_' || encode(extensions.gen_random_bytes(32), 'base64url');
  update public.developer_apps set
    client_secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex'),
    last_secret_rotated_at = now(),
    updated_at = now()
  where id = p_app_id
  returning * into v_app;

  return query select v_app.client_id, v_secret;
end;
$function$;

create or replace function public.developer_update_app(
  p_app_id uuid,
  p_name text default null,
  p_package_name text default null,
  p_origins text[] default null,
  p_redirect_uris text[] default null,
  p_scopes text[] default null,
  p_is_active boolean default null
)
returns void
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
begin
  if not exists (
    select 1 from public.developer_apps a
    join public.developer_businesses b on b.id = a.business_id
    where a.id = p_app_id and b.owner_id = auth.uid()
  ) then
    raise exception 'not your app' using errcode = '42501';
  end if;
  if p_scopes is not null
     and not (p_scopes <@ array['identity','profile:read','email:read','messages:send','messages:read']::text[]) then
    raise exception 'invalid scopes';
  end if;
  if p_package_name is not null
     and p_package_name !~* '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' then
    raise exception 'package name must look like com.example.app';
  end if;

  update public.developer_apps set
    name = coalesce(p_name, name),
    package_name = coalesce(p_package_name, package_name),
    origins = coalesce(p_origins, origins),
    redirect_uris = coalesce(p_redirect_uris, redirect_uris),
    scopes = coalesce(p_scopes, scopes),
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  where id = p_app_id;
end;
$function$;

-- ==========================================================================
-- RPCs — OAuth provider side
-- ==========================================================================
create or replace function public.oauth_client_public_info(p_client_id text)
returns jsonb
language sql
security definer
set search_path to 'public, extensions'
as $function$
  select jsonb_build_object(
    'id', a.id,
    'client_id', a.client_id,
    'name', a.name,
    'product', a.product,
    'platform', a.platform,
    'scopes', a.scopes,
    'is_active', a.is_active,
    'business_username', b.username,
    'business_display_name', b.name,
    'business_avatar', b.avatar_url
  )
  from public.developer_apps a
  join public.developer_businesses b on b.id = a.business_id
  where a.client_id = p_client_id and a.is_active
$function$;

create or replace function public.oauth_my_consent(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare r jsonb;
begin
  select jsonb_build_object(
    'granted', revoked_at is null,
    'scopes', scopes,
    'granted_at', granted_at
  ) into r
  from public.oauth_consents
  where app_id = p_app_id and user_id = auth.uid();
  return coalesce(r, '{"granted": false, "scopes": []}'::jsonb);
end;
$function$;

create or replace function public.oauth_grant_consent(p_app_id uuid, p_scope text[])
returns void
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_scope is null or cardinality(p_scope) = 0 then
    p_scope := array['identity'];
  end if;
  insert into public.oauth_consents (app_id, user_id, scopes)
  values (p_app_id, auth.uid(), p_scope)
  on conflict (app_id, user_id) do update
    set scopes = excluded.scopes, granted_at = now(), revoked_at = null;
end;
$function$;

create or replace function public.oauth_revoke_consent(p_app_id uuid)
returns void
language sql
security definer
set search_path to 'public, extensions'
as $function$
  update public.oauth_consents set revoked_at = now()
  where app_id = p_app_id and user_id = auth.uid()
$function$;

create or replace function public.oauth_create_authorization_code(
  p_client_id text,
  p_redirect_uri text,
  p_scope text[],
  p_code_challenge text
)
returns text
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_app public.developer_apps;
  v_uid uuid := auth.uid();
  v_raw text;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;

  select * into v_app from public.developer_apps
  where client_id = p_client_id and is_active;
  if v_app is null then raise exception 'unknown client'; end if;

  if p_redirect_uri is null or not (p_redirect_uri = any (v_app.redirect_uris)) then
    raise exception 'redirect_uri not registered for this app';
  end if;

  -- consent must already exist (the consent screen saves it first)
  if not exists (
    select 1 from public.oauth_consents
    where app_id = v_app.id and user_id = v_uid and revoked_at is null
      and scopes @> coalesce(nullif(p_scope, '{}'), array['identity'])
  ) then
    raise exception 'consent missing for requested scopes';
  end if;

  v_raw := encode(extensions.gen_random_bytes(32), 'base64url');
  insert into public.oauth_codes
    (code_hash, app_id, user_id, redirect_uri, scopes, code_challenge, expires_at)
  values
    (encode(extensions.digest(v_raw, 'sha256'), 'hex'), v_app.id, v_uid, p_redirect_uri,
     coalesce(nullif(p_scope, '{}'), array['identity']), p_code_challenge, now() + interval '10 minutes');
  return v_raw;
end;
$function$;

-- ==========================================================================
-- Grant edge functions access (service role bypasses RLS; this helper is for
-- the gateway to resolve apps without trusting client input)
-- ==========================================================================
create or replace function public.sdk_resolve_app(p_client_id text, p_secret text)
returns jsonb
language sql
security definer
set search_path to 'public, extensions'
as $function$
  select jsonb_build_object(
    'id', a.id, 'product', a.product, 'is_active', a.is_active,
    'scopes', a.scopes, 'business_id', a.business_id,
    'business_username', b.username, 'business_name', b.name
  )
  from public.developer_apps a
  join public.developer_businesses b on b.id = a.business_id
  where a.client_id = p_client_id
    and a.client_secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
    and a.is_active
$function$;

revoke all on function public.sdk_resolve_app(text, text) from anon, authenticated;
