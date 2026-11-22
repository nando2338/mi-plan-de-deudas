-- SolviPath 2.1 — base de la membresía Premium (sin cobros todavía).
-- Una fila por usuario. El usuario SOLO puede LEER su propia fila; nadie puede insertar,
-- actualizar ni borrar desde el navegador. Más adelante, un servidor (con la clave de servicio)
-- escribirá aquí al validar la compra en Google Play.
-- Al borrar la cuenta (Edge Function delete-account → auth.users) la fila se borra en cascada.

create table if not exists public.membresias (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  plan      text not null default 'gratis',
  activa    boolean not null default false,
  vence_en  timestamptz,
  creado    timestamptz not null default now(),
  constraint membresias_plan_len check (char_length(plan) between 1 and 40)
);

alter table public.membresias enable row level security;
revoke all on public.membresias from public, anon, authenticated;
grant select on public.membresias to authenticated;
grant select, insert, update, delete on public.membresias to service_role;

drop policy if exists membresias_select_propia on public.membresias;
create policy membresias_select_propia on public.membresias
  for select to authenticated
  using (user_id = (select auth.uid()));
