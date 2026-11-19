-- Versión 1.8 — ajustes aplicados después de la migración principal (solo agregan).
-- 1) La función tasa-euro actualiza la fecha de consulta cuando el BCE repite la tasa del día.
grant update on public.exchange_rates_eur to service_role;
-- 2) Las categorías propias de gastos fijos se sincronizan como un ajuste más
--    ("mpdd-gastos-categorias-v1"): se agrega esa clave a la lista permitida de mpdd_push,
--    sin cambiar nada más de la función (mismos permisos y seguridad).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.mpdd_push'::regproc);
  if position('mpdd-gastos-categorias-v1' in d) = 0 then
    if position('''deudas-budget-v1'']' in d) = 0 then
      raise exception 'mpdd_push no tiene la lista esperada';
    end if;
    d := replace(d, '''deudas-budget-v1'']', '''deudas-budget-v1'', ''mpdd-gastos-categorias-v1'']');
    execute d;
  end if;
end;
$$;
