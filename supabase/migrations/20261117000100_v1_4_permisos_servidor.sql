-- Versión 1.4 — permisos mínimos (solo GRANT/REVOKE; no borra nada).
--  * authenticated: solo lo que controla RLS. Se quitan TRUNCATE/TRIGGER/REFERENCES que
--    Supabase da por defecto en tablas nuevas (TRUNCATE no respeta RLS).
--  * service_role (solo en el servidor, nunca en la app): lo mínimo para las funciones
--    "enviar-recordatorios" y "trm". Antes de esto la función trm de la 1.3 no podía
--    leer ni guardar en exchange_rates.
revoke truncate, references, trigger on public.push_subscriptions, public.push_settings from authenticated;
grant select, update, delete on public.push_subscriptions to service_role;
grant select on public.push_settings to service_role;
grant select on public.debts, public.payments, public.debt_plans to service_role;
grant select, insert on public.exchange_rates to service_role;
