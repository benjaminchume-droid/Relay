-- Relay developer platform patch (2026-11-02)
--
-- 1. Secret encoding fix: encode(x, 'base64url') is not valid Postgres —
--    it raised `unrecognized encoding: "base64url"` on app creation and
--    secret rotation. Replace with base64 translated to its URL-safe form.
-- 2. Businesses are bound to the account: drop the public read policy so a
--    signed-out visitor or another account can never see your business.
-- 3. Templates are keyed by channel/request type the way the auth product
--    actually uses them: email OTP, WhatsApp OTP, email magic link.
-- 4. auth_challenges backs POST /v1/auth/otp + /v1/auth/magic-link —
--    hashed codes/tokens, TTL from the business template, no client access.

-- ---------------------------------------------------------------- (1) secrets

CREATE OR REPLACE FUNCTION public.developer_create_app(
  p_business_id uuid,
  p_name text,
  p_product text DEFAULT 'auth',
  p_platform text DEFAULT 'web',
  p_package_name text DEFAULT NULL,
  p_origins text[] DEFAULT NULL,
  p_redirect_uris text[] DEFAULT NULL,
  p_scopes text[] DEFAULT '{identity}'
)
RETURNS TABLE(client_id text, client_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
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
    p_redirect_uris := '{}';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then
    p_scopes := array['identity'];
  end if;
  if not (p_scopes <@ array['identity','profile:read','email:read','messages:send','messages:read']::text[]) then
    raise exception 'invalid scopes';
  end if;

  v_cid := 'rl_' || encode(extensions.gen_random_bytes(12), 'hex');
  v_secret := 'rs_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

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

CREATE OR REPLACE FUNCTION public.developer_rotate_app_secret(p_app_id uuid)
RETURNS TABLE(client_id text, client_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
declare
  v_app public.developer_apps;
  v_secret text;
begin
  select a.* into v_app from public.developer_apps a
  join public.developer_businesses b on b.id = a.business_id
  where a.id = p_app_id and b.owner_id = auth.uid();
  if v_app is null then raise exception 'not your app' using errcode = '42501'; end if;

  v_secret := 'rs_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.developer_apps set
    client_secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex'),
    last_secret_rotated_at = now(),
    updated_at = now()
  where id = p_app_id
  returning * into v_app;

  return query select v_app.client_id, v_secret;
end;
$function$;

CREATE OR REPLACE FUNCTION public.oauth_create_authorization_code(
  p_client_id text,
  p_redirect_uri text,
  p_scope text[],
  p_code_challenge text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
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

  if not exists (
    select 1 from public.oauth_consents
    where app_id = v_app.id and user_id = v_uid and revoked_at is null
      and scopes @> coalesce(nullif(p_scope, '{}'), array['identity'])
  ) then
    raise exception 'consent missing for requested scopes';
  end if;

  v_raw := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.oauth_codes
    (code_hash, app_id, user_id, redirect_uri, scopes, code_challenge, expires_at)
  values
    (encode(extensions.digest(v_raw, 'sha256'), 'hex'), v_app.id, v_uid, p_redirect_uri,
     coalesce(nullif(p_scope, '{}'), array['identity']), p_code_challenge, now() + interval '10 minutes');
  return v_raw;
end;
$function$;

-- --------------------------------------------------------- (2) account binding

drop policy if exists businesses_public_read on public.developer_businesses;
drop policy if exists businesses_owner_read on public.developer_businesses;
create policy businesses_owner_read on public.developer_businesses
  for select to authenticated
  using (owner_id = auth.uid());

-- --------------------------------------------- (3) templates keyed by channel

update public.developer_templates set kind = 'email_otp' where kind = 'otp';
update public.developer_templates set kind = 'email_magic_link' where kind = 'magic_link';

alter table public.developer_templates drop constraint if exists developer_templates_kind_check;
alter table public.developer_templates
  add constraint developer_templates_kind_check
  check (kind in ('email_otp','whatsapp_otp','email_magic_link','email_notice','custom'));

-- ------------------------------------------------------- (4) auth challenges

create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','magic_link')),
  destination text not null,
  code_hash text,
  token_hash text,
  ttl_seconds int not null default 60 check (ttl_seconds between 30 and 3600),
  attempts int not null default 0,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_lookup_idx
  on public.auth_challenges (app_id, destination, created_at desc);
create index if not exists auth_challenges_expiry_idx
  on public.auth_challenges (expires_at);

alter table public.auth_challenges enable row level security;
-- deliberately NO policies: only the service role (edge functions) touches it
