-- =====================================================================
-- RESPALDO DE ESTRUCTURA — versión 1.1 (antes de la 1.2)
-- Proyecto Supabase: mi-plan-de-deudas-dev (gwykdlwuipirusfixioo)
-- Tomado el 15 de noviembre de 2026, leyendo el catálogo de la base
-- (information_schema, pg_policies, pg_constraint, pg_proc). Solo estructura:
-- NO contiene datos.
--
-- Para qué sirve: dejar constancia exacta de las tablas, restricciones,
-- políticas RLS y funciones que existían antes de la migración de la 1.2.
-- Si hubiera que reconstruir la base 1.1 desde cero, ejecutar este archivo en
-- un proyecto VACÍO (SQL Editor → Run). La migración de la 1.2 solo agrega
-- una columna, un índice y un trigger; para deshacerla basta con
-- supabase/migrations/20261115000000_v1_2_fecha_vencimiento_pagos.sql
-- (sección "Cómo deshacer").
--
-- Resumen de lo que había (verificado en el catálogo):
--   public.debts         RLS activo · 4 políticas (select/insert/update/delete propias)
--   public.payments      RLS activo · 4 políticas · columnas: user_id, debt_id, seq,
--                        amount, paid_on (fecha de pago), extra, created_at, updated_at
--   public.user_settings RLS activo · 4 políticas
--   Funciones: mpdd_ts, mpdd_touch, mpdd_pull, mpdd_push, mpdd_delete_my_data
--   Esquema previo debt_private (no creado por esta app; RLS activo, sin
--   políticas = acceso denegado) y sus funciones, al final del archivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1: esquema de la app (idéntico a lo aplicado en la base)
-- ---------------------------------------------------------------------
-- =====================================================================
-- SolviPath — esquema de nube para Supabase
-- =====================================================================
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo
-- → Run. Se puede ejecutar más de una vez (es idempotente).
--
-- Seguridad:
--   * Row Level Security (RLS) activo en TODAS las tablas.
--   * Cada usuario solo puede leer, insertar, actualizar y borrar sus
--     propias filas (user_id = auth.uid()).
--   * El rol "anon" (visitante sin sesión) no tiene ningún permiso.
--   * Las funciones RPC son SECURITY INVOKER: se ejecutan con los permisos
--     del usuario que llama, de modo que RLS también se aplica dentro de ellas.
--
-- Modelo de sincronización (ver README.md):
--   * updated_at es la hora de la última modificación del registro. El
--     cliente la propone; el servidor la limita (nunca más de 5 minutos en
--     el futuro) y garantiza que siempre aumente.
--   * Una deuda borrada queda como "lápida" (deleted_at con valor) para que
--     los demás dispositivos sepan que se eliminó. Las lápidas no conservan
--     datos financieros: nombre genérico, saldos en cero y sin pagos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------

-- Formato de fecha fijo (milisegundos, UTC) para comparar versiones como texto.
create or replace function public.mpdd_ts(ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Normaliza updated_at y protege created_at en cualquier escritura.
create or replace function public.mpdd_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  if new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now();
  end if;
  new.updated_at := date_trunc('milliseconds', new.updated_at);
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Deudas. Los campos replican lo que la app guarda en el navegador.
create table if not exists public.debts (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null,
  name        text not null,
  balance     numeric not null,
  initial     numeric not null,
  "limit"     numeric,
  rate        numeric,
  currency    text not null,
  due         smallint,
  source      text,
  extra       jsonb not null default '{}'::jsonb,  -- campos adicionales desconocidos, para no perderlos
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id),
  constraint debts_id_len        check (char_length(id) between 1 and 200),
  constraint debts_name_len      check (char_length(name) <= 80 and char_length(btrim(name)) >= 1),
  constraint debts_currency      check (currency in ('USD', 'COP')),
  constraint debts_balance       check (balance >= 0 and balance <= 90071992547409),
  constraint debts_initial       check (initial >= 0 and initial <= 90071992547409),
  constraint debts_limit         check ("limit" is null or ("limit" >= 0 and "limit" <= 90071992547409)),
  constraint debts_rate          check (rate is null or (rate >= 0 and rate <= 90071992547409)),
  constraint debts_due           check (due is null or due between 1 and 31),
  constraint debts_source_len    check (source is null or char_length(source) <= 200),
  constraint debts_extra_obj     check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 65536)
);

-- Historial de pagos de cada deuda (equivale a debt.history en la app).
create table if not exists public.payments (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debt_id     text not null,
  seq         integer not null,            -- posición dentro del historial
  amount      numeric not null,
  paid_on     date,
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, debt_id, seq),
  foreign key (user_id, debt_id) references public.debts (user_id, id) on delete cascade,
  constraint payments_seq        check (seq between 0 and 99999),
  constraint payments_amount     check (amount > 0 and amount <= 90071992547409),
  constraint payments_extra_obj  check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 8192)
);

-- Ajustes: presupuesto, recordatorios, orden, idioma y moneda preferida.
-- data = { "<clave de localStorage>": { "value": "<texto>" | null, "updatedAt": "<fecha ISO>" } }
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_settings_obj   check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2097152)
);

drop trigger if exists debts_touch on public.debts;
create trigger debts_touch before insert or update on public.debts
  for each row execute function public.mpdd_touch();
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before insert or update on public.payments
  for each row execute function public.mpdd_touch();
drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before insert or update on public.user_settings
  for each row execute function public.mpdd_touch();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.debts         enable row level security;
alter table public.payments      enable row level security;
alter table public.user_settings enable row level security;

revoke all on public.debts, public.payments, public.user_settings from anon, public, authenticated;
grant select, insert, update, delete on public.debts, public.payments, public.user_settings to authenticated;

do $$
declare t text;
begin
  foreach t in array array['debts', 'payments', 'user_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: descarga completa y coherente de los datos del usuario
-- ---------------------------------------------------------------------
create or replace function public.mpdd_pull()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'debts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'balance', d.balance, 'initial', d.initial,
        'limit', d."limit", 'rate', d.rate, 'currency', d.currency, 'due', d.due,
        'source', d.source, 'extra', d.extra,
        'deleted', d.deleted_at is not null,
        'updated_at', public.mpdd_ts(d.updated_at),
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object('amount', p.amount, 'paid_on', p.paid_on, 'extra', p.extra) order by p.seq)
          from public.payments p
          where p.user_id = d.user_id and p.debt_id = d.id
        ), '[]'::jsonb)
      ) order by d.created_at, d.id)
      from public.debts d
      where d.user_id = uid
    ), '[]'::jsonb),
    'settings', coalesce((select s.data from public.user_settings s where s.user_id = uid), '{}'::jsonb),
    'server_time', public.mpdd_ts(now())
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: envío de cambios con control de versiones
-- p_debts: [{ id, base, updated_at, deleted, name, balance, initial, limit,
--             rate, currency, due, source, extra, payments:[{amount,paid_on,extra}] }]
-- p_settings: { "<clave>": { value, updatedAt, base } }
-- Un cambio se acepta si el registro no existe, si el cliente partió de la
-- versión vigente (base) o si su updated_at es más reciente. Si no, se
-- rechaza y el cliente lo resuelve en la siguiente descarga.
-- ---------------------------------------------------------------------
create or replace function public.mpdd_push(p_debts jsonb default '[]'::jsonb, p_settings jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d jsonb;
  cur public.debts%rowtype;
  found_row boolean;
  v_id text;
  v_ts timestamptz;
  v_new timestamptz;
  accepted jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
  s_result jsonb := '{}'::jsonb;
  s_data jsonb;
  k text;
  s jsonb;
  e jsonb;
  n integer;
  allowed text[] := array['nando-recordatorios-v1', 'deudas-lang-v1', 'deudas-currency-pref-v1', 'nando-deudas-sort-v1', 'deudas-budget-v1'];
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_debts, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_debts, '[]'::jsonb)) > 500 then
    raise exception 'invalid debts payload' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid settings payload' using errcode = '22023';
  end if;

  for d in select * from jsonb_array_elements(coalesce(p_debts, '[]'::jsonb)) loop
    v_id := d->>'id';
    if v_id is null or char_length(v_id) not between 1 and 200 then
      raise exception 'invalid id' using errcode = '22023';
    end if;
    v_ts := least(coalesce((d->>'updated_at')::timestamptz, now()), now() + interval '5 minutes');

    select * into cur from public.debts where user_id = uid and id = v_id for update;
    found_row := found;

    if found_row and not (
         (d->>'base') is not null and public.mpdd_ts(cur.updated_at) = d->>'base'
         or v_ts > cur.updated_at
       ) then
      rejected := rejected || to_jsonb(v_id);
      continue;
    end if;

    v_new := date_trunc('milliseconds', case when found_row then greatest(v_ts, cur.updated_at + interval '1 millisecond') else v_ts end);

    if coalesce((d->>'deleted')::boolean, false) then
      if found_row then
        delete from public.payments where user_id = uid and debt_id = v_id;
        update public.debts
           set name = 'eliminada', balance = 0, initial = 0, "limit" = null, rate = null,
               due = null, source = null, extra = '{}'::jsonb,
               deleted_at = v_new, updated_at = v_new
         where user_id = uid and id = v_id;
        accepted := accepted || jsonb_build_object('id', v_id, 'updated_at', public.mpdd_ts(v_new));
      else
        accepted := accepted || jsonb_build_object('id', v_id, 'updated_at', null);
      end if;
      continue;
    end if;

    insert into public.debts as t (user_id, id, name, balance, initial, "limit", rate, currency, due, source, extra, deleted_at, updated_at)
    values (uid, v_id, d->>'name', (d->>'balance')::numeric, (d->>'initial')::numeric,
            (d->>'limit')::numeric, (d->>'rate')::numeric, d->>'currency', (d->>'due')::smallint,
            d->>'source', coalesce(d->'extra', '{}'::jsonb), null, v_new)
    on conflict (user_id, id) do update
       set name = excluded.name, balance = excluded.balance, initial = excluded.initial,
           "limit" = excluded."limit", rate = excluded.rate, currency = excluded.currency,
           due = excluded.due, source = excluded.source, extra = excluded.extra,
           deleted_at = null, updated_at = excluded.updated_at
     -- If another request created the row a moment ago, keep the newer one.
     where found_row or t.updated_at < excluded.updated_at;
    get diagnostics n = row_count;
    if n = 0 then
      rejected := rejected || to_jsonb(v_id);
      continue;
    end if;

    delete from public.payments where user_id = uid and debt_id = v_id;
    insert into public.payments (user_id, debt_id, seq, amount, paid_on, extra)
    select uid, v_id, (x.ord - 1)::integer, (x.p->>'amount')::numeric, (x.p->>'paid_on')::date,
           coalesce(x.p->'extra', '{}'::jsonb)
      from jsonb_array_elements(coalesce(d->'payments', '[]'::jsonb)) with ordinality as x(p, ord);

    accepted := accepted || jsonb_build_object('id', v_id, 'updated_at', public.mpdd_ts(v_new));
  end loop;

  -- Ajustes, clave por clave.
  if p_settings is not null and p_settings <> '{}'::jsonb then
    insert into public.user_settings (user_id) values (uid) on conflict (user_id) do nothing;
    select data into s_data from public.user_settings where user_id = uid for update;
    for k, s in select * from jsonb_each(p_settings) loop
      if not (k = any (allowed)) then
        raise exception 'setting not allowed' using errcode = '22023';
      end if;
      if jsonb_typeof(s->'value') not in ('string', 'null') or char_length(coalesce(s->>'value', '')) > 1000000 then
        raise exception 'invalid setting value' using errcode = '22023';
      end if;
      v_ts := least(coalesce((s->>'updatedAt')::timestamptz, now()), now() + interval '5 minutes');
      e := s_data->k;
      if e is not null and not (
           (s->>'base') is not null and e->>'updatedAt' = s->>'base'
           or v_ts > (e->>'updatedAt')::timestamptz
         ) then
        s_result := s_result || jsonb_build_object(k, jsonb_build_object('accepted', false));
        continue;
      end if;
      v_new := date_trunc('milliseconds', case when e is null then v_ts
                 else greatest(v_ts, (e->>'updatedAt')::timestamptz + interval '1 millisecond') end);
      s_data := s_data || jsonb_build_object(k, jsonb_build_object('value', s->'value', 'updatedAt', public.mpdd_ts(v_new)));
      s_result := s_result || jsonb_build_object(k, jsonb_build_object('accepted', true, 'updatedAt', public.mpdd_ts(v_new)));
    end loop;
    update public.user_settings set data = s_data, updated_at = now() where user_id = uid;
  end if;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected, 'settings', s_result,
                            'server_time', public.mpdd_ts(now()));
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: borrar todos los datos del usuario en la nube (no borra la cuenta;
-- para eso está la función de servidor supabase/functions/delete-account).
-- ---------------------------------------------------------------------
create or replace function public.mpdd_delete_my_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.payments where user_id = uid;
  delete from public.debts where user_id = uid;
  get diagnostics n = row_count;
  delete from public.user_settings where user_id = uid;
  return jsonb_build_object('deleted_debts', n);
end;
$$;

revoke all on function public.mpdd_pull() from public, anon;
revoke all on function public.mpdd_push(jsonb, jsonb) from public, anon;
revoke all on function public.mpdd_delete_my_data() from public, anon;
revoke all on function public.mpdd_touch() from public, anon, authenticated;
revoke all on function public.mpdd_ts(timestamptz) from public, anon;
grant execute on function public.mpdd_pull() to authenticated;
grant execute on function public.mpdd_push(jsonb, jsonb) to authenticated;
grant execute on function public.mpdd_delete_my_data() to authenticated;
grant execute on function public.mpdd_ts(timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 2: objetos previos que ya existían en el proyecto (no son de esta
-- app). Se dejan documentados tal como están.
-- ---------------------------------------------------------------------
create schema if not exists debt_private;

create table if not exists debt_private.documents (
  owner_id   uuid not null references auth.users (id) on delete restrict,
  revision   bigint not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  constraint documents_pkey primary key (owner_id),
  constraint documents_revision_check check (revision >= 1),
  constraint documents_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint documents_payload_check1 check (octet_length(payload::text) <= 1048576)
);
create table if not exists debt_private.applied_operations (
  owner_id           uuid not null references auth.users (id) on delete restrict,
  operation_id       uuid not null,
  expected_revision  bigint not null,
  payload            jsonb not null,
  resulting_revision bigint not null,
  created_at         timestamptz not null default now(),
  constraint applied_operations_pkey primary key (owner_id, operation_id),
  constraint applied_operations_expected_revision_check check (expected_revision >= 0),
  constraint applied_operations_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint applied_operations_payload_check1 check (octet_length(payload::text) <= 1048576)
);
alter table debt_private.documents enable row level security;          -- sin políticas
alter table debt_private.applied_operations enable row level security; -- sin políticas

CREATE OR REPLACE FUNCTION debt_private.debt_read_document()
 RETURNS TABLE(revision bigint, payload jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'debt_private'
AS $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return query select d.revision,d.payload,d.updated_at from debt_private.documents d where d.owner_id=v_user;
end $function$;

CREATE OR REPLACE FUNCTION debt_private.debt_write_document(p_expected_revision bigint, p_operation_id uuid, p_payload jsonb)
 RETURNS TABLE(status text, revision bigint, payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'debt_private'
AS $function$
declare v_user uuid := auth.uid(); v_doc debt_private.documents%rowtype; v_op debt_private.applied_operations%rowtype; v_rev bigint;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_operation_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 1048576 then
    raise exception 'Invalid input' using errcode='22023';
  end if;
  -- Serialize operations per account even before the first document exists.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  select * into v_op from debt_private.applied_operations o where o.owner_id=v_user and o.operation_id=p_operation_id;
  if found then
    if v_op.expected_revision <> p_expected_revision or v_op.payload <> p_payload then
      raise exception 'Operation ID reused with different content' using errcode='22023';
    end if;
    return query select 'already_applied'::text,v_op.resulting_revision,null::jsonb; return;
  end if;
  select * into v_doc from debt_private.documents d where d.owner_id=v_user for update;
  v_rev := case when found then v_doc.revision else 0 end;
  if v_rev <> p_expected_revision then
    return query select 'conflict'::text,v_rev,case when v_rev=0 then null::jsonb else v_doc.payload end; return;
  end if;
  insert into debt_private.documents(owner_id,revision,payload) values(v_user,v_rev+1,p_payload)
    on conflict(owner_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
  insert into debt_private.applied_operations(owner_id,operation_id,expected_revision,payload,resulting_revision)
    values(v_user,p_operation_id,p_expected_revision,p_payload,v_rev+1);
  return query select 'applied'::text,v_rev+1,null::jsonb;
end $function$;

CREATE OR REPLACE FUNCTION public.debt_read_document()
 RETURNS TABLE(revision bigint, payload jsonb, updated_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ select * from debt_private.debt_read_document() $function$;

CREATE OR REPLACE FUNCTION public.debt_write_document(p_expected_revision bigint, p_operation_id uuid, p_payload jsonb)
 RETURNS TABLE(status text, revision bigint, payload jsonb)
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ select * from debt_private.debt_write_document(p_expected_revision,p_operation_id,p_payload) $function$;

-- También existe la función de evento public.rls_auto_enable() (activa RLS
-- automáticamente en tablas nuevas de public). Es parte de la configuración
-- del proyecto en Supabase; no se recrea aquí.
