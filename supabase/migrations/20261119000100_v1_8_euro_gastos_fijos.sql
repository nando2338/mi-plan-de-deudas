-- =====================================================================
-- Versión 1.8 — euro (EUR) y gastos fijos. Solo AGREGA: no borra tablas,
-- columnas ni datos. Las deudas y planes guardados no cambian.
--  1) Euro: las reglas de moneda ahora aceptan 'EUR' además de 'USD' y 'COP'
--     (se reemplaza cada regla por una más amplia; ninguna fila cambia).
--  2) Planes: columnas nuevas para la tasa del euro usada (dólares por 1 euro).
--  3) Tabla exchange_rates_eur: tasa del euro del Banco Central Europeo (la escribe
--     solo la función "tasa-euro"; la leen los usuarios con sesión).
--  4) Tabla gastos_fijos con RLS: cada usuario solo ve y cambia los suyos.
-- =====================================================================

-- 1) Euro en las deudas y en los planes.
alter table public.debts drop constraint debts_currency, add constraint debts_currency check (currency = any (array['USD', 'COP', 'EUR']));
alter table public.debt_plans drop constraint debt_plans_income_currency, add constraint debt_plans_income_currency check (income_currency = any (array['USD', 'COP', 'EUR']));
alter table public.debt_plans drop constraint debt_plans_plan_currency, add constraint debt_plans_plan_currency check (plan_currency = any (array['USD', 'COP', 'EUR']));

-- 2) Tasa del euro usada en el plan.
alter table public.debt_plans add column if not exists eur_rate numeric check (eur_rate is null or (eur_rate >= 0.2 and eur_rate <= 5));
alter table public.debt_plans add column if not exists eur_date date;
alter table public.debt_plans add column if not exists eur_type text check (eur_type is null or eur_type in ('oficial', 'personalizada'));

-- 3) Tasa de referencia del euro (Banco Central Europeo): dólares por 1 euro.
create table if not exists public.exchange_rates_eur (
  fecha date primary key,
  usd_por_eur numeric not null check (usd_por_eur >= 0.2 and usd_por_eur <= 5),
  fuente text not null default 'Banco Central Europeo',
  creado timestamptz not null default now()
);
alter table public.exchange_rates_eur enable row level security;
revoke all on public.exchange_rates_eur from anon, authenticated, public;
grant select on public.exchange_rates_eur to authenticated;
grant select, insert on public.exchange_rates_eur to service_role;
drop policy if exists exchange_rates_eur_select on public.exchange_rates_eur;
create policy exchange_rates_eur_select on public.exchange_rates_eur for select to authenticated using (true);

-- 4) Gastos fijos (agua, luz, gas, HOA, impuestos…), uno por fila.
--    Borrar = marcar "borrado" (así el borrado llega a los demás dispositivos).
create table if not exists public.gastos_fijos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  nombre text check (nombre is null or char_length(btrim(nombre)) between 1 and 80),
  monto numeric check (monto is null or (monto > 0 and monto <= 1000000000000)),
  moneda text check (moneda is null or moneda in ('USD', 'COP', 'EUR')),
  frecuencia text check (frecuencia is null or frecuencia in ('mensual', 'trimestral', 'semestral', 'anual')),
  dia smallint check (dia is null or dia between 1 and 31),
  mes smallint check (mes is null or mes between 1 and 12),
  categoria text check (categoria is null or char_length(categoria) <= 40),
  nota text check (nota is null or char_length(nota) <= 300),
  pagos jsonb not null default '[]'::jsonb check (jsonb_typeof(pagos) = 'array' and jsonb_array_length(pagos) <= 60),
  creado_en date,
  actualizado timestamptz not null default now(),
  borrado timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  -- Un gasto activo tiene todos sus datos; uno no mensual necesita el mes de pago.
  constraint gastos_fijos_completo check (
    borrado is not null or (nombre is not null and monto is not null and moneda is not null
      and frecuencia is not null and dia is not null and (frecuencia = 'mensual' or mes is not null)))
);

create or replace function public.mpdd_gastos_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists gastos_fijos_touch on public.gastos_fijos;
create trigger gastos_fijos_touch before update on public.gastos_fijos
  for each row execute function public.mpdd_gastos_touch();

alter table public.gastos_fijos enable row level security;
revoke all on public.gastos_fijos from anon, authenticated, public;
grant select, insert, update, delete on public.gastos_fijos to authenticated;
grant select on public.gastos_fijos to service_role; -- notificaciones (solo servidor)

drop policy if exists gastos_fijos_select_own on public.gastos_fijos;
create policy gastos_fijos_select_own on public.gastos_fijos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists gastos_fijos_insert_own on public.gastos_fijos;
create policy gastos_fijos_insert_own on public.gastos_fijos for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists gastos_fijos_update_own on public.gastos_fijos;
create policy gastos_fijos_update_own on public.gastos_fijos for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists gastos_fijos_delete_own on public.gastos_fijos;
create policy gastos_fijos_delete_own on public.gastos_fijos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Cómo deshacer (solo si se quiere quitar la 1.8 de la base; la 1.6 funciona sin hacerlo,
-- salvo que ya existan deudas en euros):
--   drop table if exists public.gastos_fijos;
--   drop function if exists public.mpdd_gastos_touch();
--   drop table if exists public.exchange_rates_eur;
