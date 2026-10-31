-- Username login: resolve a handle to the auth email so the client can call
-- GoTrue's signInWithPassword. SECURITY DEFINER because profiles.email is not
-- anonymously readable; only the handle→email mapping is exposed (handles are
-- already public via people search), never bulk.
create or replace function public.relay_lookup_login(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select email
    from public.profiles
    where lower(btrim(p_username)) = lower(username)
      and coalesce(btrim(p_username), '') <> ''
    limit 1;
$$;

grant execute on function public.relay_lookup_login(text) to authenticated, anon;
