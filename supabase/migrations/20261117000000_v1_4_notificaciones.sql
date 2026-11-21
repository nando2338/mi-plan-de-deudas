-- =====================================================================
-- Versión 1.4 — notificaciones push (teléfono y computador).
-- Solo AGREGA: tablas, funciones, extensiones y una tarea programada.
-- No borra ni cambia tablas, columnas ni datos existentes.
--
--  * push_subscriptions: una fila por usuario y dispositivo (RLS: solo las propias).
--  * push_settings: activar, días de anticipación, hora y zona horaria (RLS: solo la propia).
--  * debt_private.push_sent: registro de avisos ya enviados (para no repetirlos).
--    Esquema privado, sin políticas: solo lo usa la función del servidor.
--  * Claves VAPID y el secreto de la tarea programada: en Supabase Vault.
--    La clave privada la genera la propia función "enviar-recordatorios" la
--    primera vez y la guarda en Vault; nunca está en el código ni en el repo.
--  * pg_cron llama a la función cada 15 minutos con pg_net.
--
-- (Los permisos del servidor están en 20261117000100_v1_4_permisos_servidor.sql.)
--
-- Cómo deshacer (solo si se quiere quitar la 1.4 de la base; la 1.3 funciona
-- sin hacerlo, porque no usa nada de esto):
--   select cron.unschedule('mpdd-enviar-recordatorios');
--   drop table if exists debt_private.push_sent;
--   drop table if exists public.push_settings;
--   drop table if exists public.push_subscriptions;
--   drop function if exists public.mpdd_push_touch();
--   drop function if exists public.mpdd_push_keys();
--   drop function if exists public.mpdd_push_store_keys(text, text);
--   drop function if exists public.mpdd_push_cron_ok(text);
--   drop function if exists public.mpdd_push_mark(uuid, text, date, text);
--   drop function if exists public.mpdd_push_unmark(uuid, text, date, text);
--   drop function if exists public.mpdd_push_prune();
--   delete from vault.secrets where name in ('mpdd_vapid_public','mpdd_vapid_private','mpdd_cron_secret');
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- Suscripciones push (una por usuario y dispositivo) ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_ok_at timestamptz,
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------- Preferencias de avisos ----------
create table if not exists public.push_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  days_before smallint not null default 1 check (days_before in (1, 3, 7)),
  send_time text not null default '08:00' check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  tz text not null default 'America/Bogota' check (char_length(tz) between 1 and 64),
  lang text not null default 'es' check (lang in ('es', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.mpdd_push_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch before insert or update on public.push_subscriptions
  for each row execute function public.mpdd_push_touch();
drop trigger if exists push_settings_touch on public.push_settings;
create trigger push_settings_touch before insert or update on public.push_settings
  for each row execute function public.mpdd_push_touch();

alter table public.push_subscriptions enable row level security;
alter table public.push_settings enable row level security;
revoke all on public.push_subscriptions, public.push_settings from anon, public;
grant select, insert, update, delete on public.push_subscriptions, public.push_settings to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists push_settings_select_own on public.push_settings;
create policy push_settings_select_own on public.push_settings for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists push_settings_insert_own on public.push_settings;
create policy push_settings_insert_own on public.push_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists push_settings_update_own on public.push_settings;
create policy push_settings_update_own on public.push_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists push_settings_delete_own on public.push_settings;
create policy push_settings_delete_own on public.push_settings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- Avisos ya enviados (solo servidor) ----------
create schema if not exists debt_private;
create table if not exists debt_private.push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  debt_id text not null,
  due_date date not null,
  kind text not null check (kind in ('antes', 'hoy', 'vencida')),
  sent_at timestamptz not null default now(),
  primary key (user_id, debt_id, due_date, kind)
);
alter table debt_private.push_sent enable row level security; -- sin políticas: solo service_role
revoke all on debt_private.push_sent from anon, authenticated, public;
grant usage on schema debt_private to service_role;
grant select, insert, delete on debt_private.push_sent to service_role;

-- ---------- Secretos en Vault (solo la función del servidor los usa) ----------
-- Secreto para que solo la tarea programada pueda pedir el envío. Se genera aquí,
-- dentro de la base: nunca sale de Supabase.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'mpdd_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'mpdd_cron_secret',
      'SolviPath 1.4: autoriza a pg_cron a llamar enviar-recordatorios');
  end if;
end;
$$;

create or replace function public.mpdd_push_keys()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'mpdd_vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'mpdd_vapid_private'));
$$;

-- Guarda el par VAPID solo si todavía no existe (si dos ejecuciones compiten, gana la primera).
create or replace function public.mpdd_push_store_keys(p_public text, p_private text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('mpdd_vapid'));
  if not exists (select 1 from vault.secrets where name = 'mpdd_vapid_private') then
    if p_public is null or p_private is null or char_length(p_public) < 80 or char_length(p_private) < 40 then
      raise exception 'claves inválidas';
    end if;
    perform vault.create_secret(p_private, 'mpdd_vapid_private', 'SolviPath 1.4: clave privada VAPID (JWK)');
    perform vault.create_secret(p_public, 'mpdd_vapid_public', 'SolviPath 1.4: clave pública VAPID');
  end if;
  return public.mpdd_push_keys();
end;
$$;

create or replace function public.mpdd_push_cron_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret is not null and char_length(p_secret) = 64 and p_secret = (
    select decrypted_secret from vault.decrypted_secrets where name = 'mpdd_cron_secret'), false);
$$;

revoke all on function public.mpdd_push_keys() from public, anon, authenticated;
revoke all on function public.mpdd_push_store_keys(text, text) from public, anon, authenticated;
revoke all on function public.mpdd_push_cron_ok(text) from public, anon, authenticated;
grant execute on function public.mpdd_push_keys() to service_role;
grant execute on function public.mpdd_push_store_keys(text, text) to service_role;
grant execute on function public.mpdd_push_cron_ok(text) to service_role;

-- Marca un aviso como enviado. Devuelve true solo la primera vez (así nunca se repite).
create or replace function public.mpdd_push_mark(p_user uuid, p_debt text, p_due date, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  insert into debt_private.push_sent (user_id, debt_id, due_date, kind)
  values (p_user, p_debt, p_due, p_kind)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- Quita la marca si no se pudo entregar a ningún dispositivo (se reintenta en la próxima vuelta).
create or replace function public.mpdd_push_unmark(p_user uuid, p_debt text, p_due date, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from debt_private.push_sent
  where user_id = p_user and debt_id = p_debt and due_date = p_due and kind = p_kind;
$$;

-- Limpia el registro de avisos de hace más de 60 días.
create or replace function public.mpdd_push_prune()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from debt_private.push_sent where due_date < current_date - 60;
$$;

revoke all on function public.mpdd_push_mark(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.mpdd_push_unmark(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.mpdd_push_prune() from public, anon, authenticated;
grant execute on function public.mpdd_push_mark(uuid, text, date, text) to service_role;
grant execute on function public.mpdd_push_unmark(uuid, text, date, text) to service_role;
grant execute on function public.mpdd_push_prune() to service_role;

-- ---------- Tarea programada: cada 15 minutos ----------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mpdd-enviar-recordatorios') then
    perform cron.unschedule('mpdd-enviar-recordatorios');
  end if;
end;
$$;
select cron.schedule(
  'mpdd-enviar-recordatorios',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://gwykdlwuipirusfixioo.supabase.co/functions/v1/enviar-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mpdd_cron_secret')),
    body := '{"accion":"programado"}'::jsonb,
    timeout_milliseconds := 30000);
  $job$
);
