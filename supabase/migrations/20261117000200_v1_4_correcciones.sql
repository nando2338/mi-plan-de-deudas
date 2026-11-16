-- Versión 1.4 — fixes from the independent review (adds rules; deletes no data).
--  1) A device (endpoint) belongs to only one user: when someone else activates
--     notifications in the same browser, the previous user's subscription is removed
--     (otherwise that device would keep receiving the other person's debts).
--  2) Subscription keys must have the real format (base64url: p256dh = 65 bytes, auth = 16).
--  3) New "manana" reminder kind ("Mañana vence"), separate from the 3/7-day one.

create or replace function public.mpdd_push_claim_endpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions
  where endpoint = new.endpoint and user_id <> new.user_id;
  return new;
end;
$$;
revoke all on function public.mpdd_push_claim_endpoint() from public, anon, authenticated;

drop trigger if exists push_subscriptions_claim on public.push_subscriptions;
create trigger push_subscriptions_claim before insert or update of endpoint on public.push_subscriptions
  for each row execute function public.mpdd_push_claim_endpoint();

alter table public.push_subscriptions drop constraint if exists push_subscriptions_keys_format;
alter table public.push_subscriptions add constraint push_subscriptions_keys_format check (
  p256dh ~ '^[A-Za-z0-9_-]{86,87}={0,1}$' and auth ~ '^[A-Za-z0-9_-]{22}={0,2}$');

alter table debt_private.push_sent drop constraint if exists push_sent_kind_check;
alter table debt_private.push_sent add constraint push_sent_kind_check check (kind in ('antes', 'manana', 'hoy', 'vencida'));
