-- Versión 1.8 — suggestions box. Only ADDS a table and its rules.
-- Anyone can SEND a suggestion (with or without an account); nobody can read,
-- change or delete them from the app. They are read in Supabase (Table Editor).
create table if not exists public.sugerencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 5 and 2000),
  contacto text check (contacto is null or char_length(contacto) <= 200),
  idioma text not null default 'es' check (idioma in ('es', 'en')),
  version text check (version is null or char_length(version) <= 20),
  creado timestamptz not null default now()
);
create index if not exists sugerencias_creado_idx on public.sugerencias (creado);

alter table public.sugerencias enable row level security;
revoke all on public.sugerencias from anon, authenticated, public;
grant insert on public.sugerencias to anon, authenticated;

-- Insert only. Without an account user_id stays empty; with an account it can only be your own.
drop policy if exists sugerencias_insert on public.sugerencias;
create policy sugerencias_insert on public.sugerencias for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

-- Anti-spam limit: 5 per hour per account, and 60 per hour in total without an account.
create or replace function public.mpdd_sugerencias_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if new.user_id is not null then
    select count(*) into n from public.sugerencias where user_id = new.user_id and creado > now() - interval '1 hour';
    if n >= 5 then raise exception 'demasiadas_sugerencias' using errcode = 'P0001'; end if;
  else
    select count(*) into n from public.sugerencias where user_id is null and creado > now() - interval '1 hour';
    if n >= 60 then raise exception 'demasiadas_sugerencias' using errcode = 'P0001'; end if;
  end if;
  new.creado := now();
  return new;
end;
$$;
revoke all on function public.mpdd_sugerencias_limite() from public, anon, authenticated;
drop trigger if exists sugerencias_limite on public.sugerencias;
create trigger sugerencias_limite before insert on public.sugerencias
  for each row execute function public.mpdd_sugerencias_limite();

-- Detalle pedido para la 1.8: tipo (Sugerencia, Error o Algo que me gustó), mensaje de hasta
-- 1000 caracteres y correo de contacto opcional con formato válido.
alter table public.sugerencias add column if not exists tipo text not null default 'sugerencia';
alter table public.sugerencias add constraint sugerencias_tipo check (tipo in ('sugerencia', 'error', 'gusto'));
alter table public.sugerencias add constraint sugerencias_texto_max check (char_length(texto) <= 1000);
alter table public.sugerencias add constraint sugerencias_contacto_formato check (contacto is null or contacto ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
