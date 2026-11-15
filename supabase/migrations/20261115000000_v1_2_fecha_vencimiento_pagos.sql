-- =====================================================================
-- Migración versión 1.2 — SOLO AGREGA (no borra ni renombra nada).
-- Respaldo de la estructura anterior: supabase/respaldo-v1.1.sql
-- =====================================================================
-- Qué hace:
--   1. Moneda por deuda: la columna public.debts.currency YA EXISTE desde la
--      1.1 (texto, obligatoria, solo 'USD' o 'COP'). La sentencia de abajo no
--      cambia nada si ya existe; se deja para que la migración sea completa
--      en un proyecto que no la tuviera. Las deudas de la app siempre llevan
--      moneda, así que no hay filas por completar.
--   2. Pagos: la fecha real de pago YA EXISTE (public.payments.paid_on).
--      Se AGREGA due_on (fecha de vencimiento de la cuota que se pagó).
--   3. due_on se llena automáticamente con un trigger NUEVO a partir del dato
--      que la app ya envía (extra->>'dueDate'), sin cambiar las funciones de
--      sincronización existentes. Se rellenan las filas que ya existen.
--   4. Índice para consultar pagos por fecha de vencimiento.
-- RLS: no cambia; las 4 políticas por tabla (solo filas propias) siguen activas
-- y cubren la columna nueva.
-- =====================================================================

alter table public.debts
  add column if not exists currency text not null default 'USD'
  check (currency in ('USD', 'COP'));

alter table public.payments
  add column if not exists due_on date;

create or replace function public.mpdd_payments_due_on()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text := new.extra->>'dueDate';
begin
  new.due_on := null;
  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      new.due_on := v::date;
    exception when others then
      new.due_on := null; -- fecha imposible (por ejemplo 2026-02-30): se deja vacía
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.mpdd_payments_due_on() from public, anon, authenticated;

drop trigger if exists payments_due_on on public.payments;
create trigger payments_due_on before insert or update on public.payments
  for each row execute function public.mpdd_payments_due_on();

-- Rellenar filas existentes (el trigger calcula due_on).
update public.payments set extra = extra where extra ? 'dueDate';

create index if not exists payments_user_due_on_idx on public.payments (user_id, due_on);

-- ---------------------------------------------------------------------
-- Cómo deshacer (solo si fuera necesario volver a la 1.1):
--   drop trigger if exists payments_due_on on public.payments;
--   drop function if exists public.mpdd_payments_due_on();
--   drop index if exists public.payments_user_due_on_idx;
--   alter table public.payments drop column if exists due_on;
-- La 1.1 no usa due_on, así que dejar la columna no la afecta.
-- ---------------------------------------------------------------------
