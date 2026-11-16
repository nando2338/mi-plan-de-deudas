-- =====================================================================
-- Migración versión 1.3 — SOLO AGREGA tablas nuevas (no borra ni renombra nada).
-- Respaldo de la estructura anterior: supabase/respaldo-v1.2.sql
-- =====================================================================
-- 1. exchange_rates: TRM USD/COP certificada por la Superintendencia Financiera.
--    La leen los usuarios autenticados. NADIE puede escribir desde la app: no hay
--    políticas de inserción/actualización/borrado; solo la función de servidor
--    "trm" escribe, con la clave de servicio que Supabase le da en el servidor.
-- 2. debt_plans: el plan de pagos de cada usuario (uno por usuario). RLS: cada
--    usuario solo lee, crea, cambia y borra el suyo. Se borra en cascada con la cuenta.
-- =====================================================================

create table if not exists public.exchange_rates (
  fecha           date primary key,              -- día para el que rige la TRM
  valor           numeric not null,              -- pesos colombianos por 1 dólar
  fuente          text not null,
  vigencia_desde  date,
  vigencia_hasta  date,
  creado          timestamptz not null default now(),
  constraint exchange_rates_valor check (valor >= 100 and valor <= 100000),
  constraint exchange_rates_fuente check (char_length(fuente) between 1 and 200)
);
alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon, public, authenticated;
grant select on public.exchange_rates to authenticated;
drop policy if exists exchange_rates_select_authenticated on public.exchange_rates;
create policy exchange_rates_select_authenticated on public.exchange_rates
  for select to authenticated using (true);

create table if not exists public.debt_plans (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  income           numeric not null,
  income_currency  text not null,
  plan_currency    text not null,
  expenses         jsonb not null default '[]'::jsonb,   -- [{ key, label, amount }] en la moneda de los ingresos
  extra            numeric not null default 0,           -- en la moneda del plan
  method           text not null default 'avalanche',
  fx_rate          numeric,                              -- pesos por dólar usados (null si no se necesitó)
  fx_date          date,
  fx_type          text,                                 -- 'oficial' o 'personalizada'
  plan_month       date not null,                        -- primer día del mes del plan
  items            jsonb not null default '[]'::jsonb,   -- pagos del mes, cada uno en su moneda
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint debt_plans_income check (income >= 0 and income <= 90071992547409),
  constraint debt_plans_extra check (extra >= 0 and extra <= 90071992547409),
  constraint debt_plans_income_currency check (income_currency in ('USD', 'COP')),
  constraint debt_plans_plan_currency check (plan_currency in ('USD', 'COP')),
  constraint debt_plans_method check (method in ('avalanche', 'snowball')),
  constraint debt_plans_fx_rate check (fx_rate is null or (fx_rate >= 100 and fx_rate <= 100000)),
  constraint debt_plans_fx_type check (fx_type is null or fx_type in ('oficial', 'personalizada')),
  constraint debt_plans_fx_pair check ((fx_rate is null) = (fx_type is null)),
  constraint debt_plans_expenses check (jsonb_typeof(expenses) = 'array' and pg_column_size(expenses) <= 16384),
  constraint debt_plans_items check (jsonb_typeof(items) = 'array' and pg_column_size(items) <= 65536)
);

create or replace function public.mpdd_plans_touch()
returns trigger
language plpgsql
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
revoke all on function public.mpdd_plans_touch() from public, anon, authenticated;
drop trigger if exists debt_plans_touch on public.debt_plans;
create trigger debt_plans_touch before insert or update on public.debt_plans
  for each row execute function public.mpdd_plans_touch();

alter table public.debt_plans enable row level security;
revoke all on public.debt_plans from anon, public, authenticated;
grant select, insert, update, delete on public.debt_plans to authenticated;
drop policy if exists debt_plans_select_own on public.debt_plans;
drop policy if exists debt_plans_insert_own on public.debt_plans;
drop policy if exists debt_plans_update_own on public.debt_plans;
drop policy if exists debt_plans_delete_own on public.debt_plans;
create policy debt_plans_select_own on public.debt_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy debt_plans_insert_own on public.debt_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy debt_plans_update_own on public.debt_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy debt_plans_delete_own on public.debt_plans for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- Cómo deshacer (solo si fuera necesario volver a la 1.2; la 1.2 no usa estas tablas):
--   drop table if exists public.debt_plans;
--   drop function if exists public.mpdd_plans_touch();
--   drop table if exists public.exchange_rates;
-- ---------------------------------------------------------------------
