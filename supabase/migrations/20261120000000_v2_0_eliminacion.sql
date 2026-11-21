-- SolviPath 2.0 — eliminación de cuenta y de datos.
-- 1) Tabla solicitudes_eliminacion: la llena la página pública /eliminar-cuenta.html.
--    RLS: solo se puede INSERTAR (correo e idioma); nadie puede leerla desde el navegador.
--    Tú la lees desde Supabase (SQL Editor / Table Editor), que usa el rol postgres.
-- 2) Sin datos huérfanos: al borrar un usuario de Auth, todo lo suyo se borra en cascada,
--    incluidas sus sugerencias (antes quedaban con user_id nulo) y las tablas heredadas
--    debt_private.* (antes con RESTRICT, lo que habría bloqueado el borrado del usuario).

create table if not exists public.solicitudes_eliminacion (
  id         uuid primary key default gen_random_uuid(),
  correo     text not null,
  idioma     text not null default 'es',
  estado     text not null default 'pendiente',
  creado     timestamptz not null default now(),
  procesado  timestamptz,
  nota       text,
  constraint solicitudes_correo_len    check (char_length(correo) between 5 and 254),
  constraint solicitudes_correo_forma  check (correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  constraint solicitudes_idioma        check (idioma in ('es', 'en')),
  constraint solicitudes_estado        check (estado in ('pendiente', 'procesada', 'rechazada')),
  constraint solicitudes_nota_len      check (nota is null or char_length(nota) <= 500)
);

alter table public.solicitudes_eliminacion enable row level security;
revoke all on public.solicitudes_eliminacion from public, anon, authenticated;
grant insert (correo, idioma) on public.solicitudes_eliminacion to anon, authenticated;

drop policy if exists solicitudes_insert on public.solicitudes_eliminacion;
create policy solicitudes_insert on public.solicitudes_eliminacion
  for insert to anon, authenticated
  with check (estado = 'pendiente' and procesado is null and nota is null);

create index if not exists solicitudes_eliminacion_estado_idx on public.solicitudes_eliminacion (estado, creado);

-- Sugerencias: se borran con la cuenta.
alter table public.sugerencias drop constraint if exists sugerencias_user_id_fkey;
alter table public.sugerencias
  add constraint sugerencias_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

-- Tablas heredadas: ya no bloquean el borrado del usuario.
do $$
begin
  if to_regclass('debt_private.documents') is not null then
    alter table debt_private.documents drop constraint if exists documents_owner_id_fkey;
    alter table debt_private.documents
      add constraint documents_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
  end if;
  if to_regclass('debt_private.applied_operations') is not null then
    alter table debt_private.applied_operations drop constraint if exists applied_operations_owner_id_fkey;
    alter table debt_private.applied_operations
      add constraint applied_operations_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
  end if;
end;
$$;
