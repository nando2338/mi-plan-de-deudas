# Mi Plan de Deudas

Aplicación web para registrar deudas, comparar estrategias de pago y administrar presupuestos y recordatorios.

El código de la aplicación está en `dist/` (sitio estático, sin paso de compilación). Por defecto, los datos financieros se guardan localmente en el navegador o dispositivo. Los respaldos pueden contener datos financieros sin cifrar.

## Cuentas opcionales con sincronización (Supabase)

Desde esta versión, quien quiera puede crear una cuenta e iniciar sesión para ver sus deudas, pagos, presupuesto y recordatorios en varios dispositivos. **Sin cuenta, la app funciona exactamente igual que antes**: no se muestra ninguna pantalla obligatoria, no se carga ninguna biblioteca externa y no se hace ninguna solicitud de red.

Mientras `dist/config.js` tenga los valores de marcador de posición, las cuentas quedan desactivadas y la sección *Más → Cuenta* solo lo informa.

### Archivos nuevos

| Archivo | Para qué sirve |
|---|---|
| `dist/config.js` | URL del proyecto y clave **pública** de Supabase (marcadores para reemplazar). |
| `dist/cloud-core.js` | Lógica pura: normalización, detección de cambios y plan de fusión. |
| `dist/cloud-sync.js` | Cliente de Supabase (cargado solo si hay sesión), autenticación, cola sin conexión y sincronización. |
| `dist/account-ui.js`, `dist/account.css` | Sección "Cuenta" en el menú Más, estado en el encabezado, avisos y diálogos. |
| `dist/privacidad.html`, `dist/terminos.html`, `dist/legal.css`, `dist/legal.js` | Borradores de Política de privacidad y Términos de uso (español e inglés). |
| `supabase/schema.sql` | Tablas, restricciones, Row Level Security y funciones RPC. |
| `supabase/functions/delete-account/index.ts` | Función de servidor para borrar la cuenta (no desplegada). |
| `tests/` | Pruebas automatizadas con DOM simulado (jsdom) y comprobación de recursos. |

### Cómo funciona la sincronización (local primero)

- `localStorage` sigue siendo la copia de trabajo. Todo cambio se guarda primero en el dispositivo con el mismo mecanismo de siempre (validación y copia anterior automática).
- Con sesión iniciada, la app detecta los cambios (cada 3 segundos y al guardar) y los envía a Supabase. Al abrir la app, al volver a la pestaña y cada 5 minutos descarga lo que haya cambiado en otros dispositivos.
- Cada deuda (con su historial de pagos) es un registro con su propio `updated_at`; los ajustes (presupuesto, recordatorios, orden, idioma y moneda) se comparan clave por clave.
- **Conflictos:** si el mismo registro cambió en dos lados, gana el más reciente y la app muestra un aviso con el nombre de la deuda. Antes de aplicar cualquier cambio de la nube, la app guarda una copia anterior en el dispositivo (las mismas copias `nando-deudas-recovery-v1:` que ya usaba).
- **Borrados:** una deuda borrada deja una "lápida" en la nube (sin datos financieros) para que los demás dispositivos la eliminen; la app avisa cuando eso pasa.
- **Sin internet:** la app sigue funcionando; los cambios quedan pendientes y se envían al volver la conexión.
- **Primer inicio de sesión con datos locales:** se pregunta si subirlos. Si la cuenta ya tiene datos, se muestran los conteos y se puede elegir *Combinar*, *Usar la nube* o *Usar lo de este dispositivo*. Antes de reemplazar algo se guarda una copia de respaldo descargable desde *Cuenta*. En *Combinar*, si la misma deuda existe en ambos lados con diferencias, se conserva la de la nube (la hora del cambio local no se conoce) y la local queda en esa copia.
- **Cerrar sesión:** pregunta si conservar o borrar la copia local (recomendado borrar en equipos compartidos). Borrar elimina deudas, ajustes, copias anteriores y la sesión; solo se conserva el idioma.
- **Candado de recuperación:** si hay una restauración interrumpida (`nando-restore-journal-v1`) o datos que requieren revisión, la sincronización queda en pausa y no se envía ni se descarga nada.
- **Respaldos manuales:** descargar y restaurar siguen igual. Con sesión, una restauración se envía a la nube como cualquier otro cambio.
- Mientras un formulario de deuda está abierto, los cambios de la nube esperan para no perder lo que se está escribiendo.
- Las deudas que no cumplen las reglas de la nube (por ejemplo, un nombre de más de 80 caracteres, que un respaldo antiguo sí permite) no se suben; se listan en *Cuenta* para corregirlas y nunca se borran del dispositivo.

### Seguridad

- En el navegador solo están la URL y la clave pública. La app se niega a usar una clave `service_role` o `sb_secret_…` si alguien la pone por error.
- Row Level Security en todas las tablas: cada usuario solo ve y modifica sus filas. El rol anónimo no tiene permisos. Probado con usuarios ficticios (ver `PRUEBAS.md`).
- supabase-js se carga desde jsDelivr con versión fija (`2.118.0`) y verificación de integridad (SRI). El service worker no guarda en caché ninguna petición a Supabase ni a la autenticación.
- Inicio de sesión con PKCE. Los mensajes de error no revelan si un correo está registrado. No se registran en consola datos financieros ni tokens.
- Todo dato del usuario se inserta en la página con `textContent`.

### Eliminar cuenta: por qué hay una función de servidor

Borrar un usuario de `auth.users` exige la clave `service_role`, que nunca puede ir en el navegador. Por eso:

1. La app primero llama a `mpdd_delete_my_data()` (función de la base de datos con los permisos del propio usuario) y borra todas sus filas en la nube. Esto funciona aunque la función de servidor no esté desplegada.
2. Después llama a la función de servidor `delete-account`, que verifica el token del usuario y borra su cuenta. Si no está desplegada, la app lo dice y la persona debe escribir al contacto de la política para completar el borrado.

La función está en `supabase/functions/delete-account/index.ts` y **no se ha desplegado**.

## Pasos manuales en Supabase (para principiantes)

1. **Proyecto.** Entra a <https://supabase.com/dashboard>. Para pruebas ya existe el proyecto `mi-plan-de-deudas-dev`, donde el esquema ya está creado. Para producción, crea un proyecto nuevo (*New project*), elige una región cercana y guarda la contraseña de la base de datos en un lugar seguro.
2. **Esquema** (solo en un proyecto nuevo). Menú *SQL Editor* → *New query* → pega todo `supabase/schema.sql` → *Run*. Debe decir *Success*. Luego *Advisors → Security Advisor* no debe mostrar alertas sobre `debts`, `payments` ni `user_settings`.
3. **URL y clave pública.** *Project Settings → API Keys* (o *Data API*). Copia la *Project URL* y la clave **publishable** (`sb_publishable_…`) o la *anon public*. Abre `dist/config.js` y reemplaza:
   - `https://TU-PROYECTO.supabase.co` por tu Project URL.
   - `TU_CLAVE_PUBLICA` por la clave pública.
   No copies nunca la clave `service_role` ni una `secret`.
4. **URL de redirección.** *Authentication → URL Configuration*:
   - *Site URL*: la dirección pública de la app, por ejemplo `https://tu-dominio.com`.
   - *Redirect URLs*: agrega `https://tu-dominio.com/**` (y `http://localhost:8080/**` si pruebas en tu computador). Sin esto, los enlaces de confirmación, enlace mágico y cambio de contraseña no funcionan.
5. **Correo de confirmación.** *Authentication → Sign In / Providers → Email*: deja activo *Confirm email*. En *Authentication → Emails* puedes traducir las plantillas al español (deja `{{ .ConfirmationURL }}` intacto). Para producción configura un SMTP propio (*Authentication → Emails → SMTP Settings*): el correo incluido de Supabase tiene un límite muy bajo de envíos por hora.
6. **Contraseñas.** *Authentication → Sign In / Providers → Email*: longitud mínima 8. Activa *Leaked password protection* si tu plan lo permite (es la única alerta de seguridad que queda en el proyecto de desarrollo).
7. **Google (opcional, después).** *Authentication → Sign In / Providers → Google*, con las credenciales de Google Cloud. Luego cambia `googleEnabled: false` a `true` en `dist/config.js`.
8. **Función para eliminar cuenta (cuando quieras activarla).** Con la [CLI de Supabase](https://supabase.com/docs/guides/cli): `supabase login`, `supabase link --project-ref TU_REF` y `supabase functions deploy delete-account`. O en el panel: *Edge Functions → Deploy a new function → Via Editor*, nombre `delete-account`, pega el contenido de `index.ts` y deja activo *Verify JWT*. Opcional: secreto `ALLOWED_ORIGINS` con tu dominio.
9. **Publicar.** Sube `dist/` como siempre. Si cambias `config.js` después, no hace falta cambiar la versión del service worker: ese archivo se pide primero a la red.
10. **Legal.** Completa los marcadores resaltados de `privacidad.html` y `terminos.html` (responsable, identificación, correo, región, retención) y haz que un abogado revise ambos textos antes de abrir las cuentas al público.

## Versión 1.2

Novedades (sin anuncios, con el mismo diseño para celular y computador):

- **Moneda por deuda.** Cada deuda guarda su moneda (USD o COP) y se elige al crearla o editarla. El selector de moneda de *Más → Moneda* solo define la moneda por defecto de las deudas nuevas. Se pueden tener deudas en ambas monedas a la vez y **nunca se suman ni se convierten** montos de monedas distintas.
- **Un solo formato de montos:** `formatMoney(monto, moneda)` en `dist/money.js` (Intl.NumberFormat `en-US` para USD y `es-CO` para COP): `US$1,250.00 USD` y `$1.250.000 COP`.
- **Inicio:** "Total que debes" con una línea por moneda (solo las que existan). La lista muestra todas las deudas, agrupadas por moneda; el orden elegido se aplica dentro de cada moneda.
- **Calendario** (pestaña nueva): cuadrícula del mes con flechas; verde = pagado a tiempo, rojo = vencido sin pagar o pagado tarde, naranja = hoy, blanco = sin pagos (borde punteado = cuota pendiente). Al tocar un día se ven sus pagos y se pueden marcar como pagados. Arriba, "Por pagar este mes" y "Pagado este mes" por moneda.
- **Estado de cada pago:** cada pago guarda la fecha de vencimiento (opcional) y la fecha real de pago, con la etiqueta "Pagado a tiempo", "Pagado tarde" o "Pendiente". Los pagos antiguos sin fecha de vencimiento aparecen como "Pagado".
- **Gráfico** (pestaña nueva): dona de lo pagado entre dos fechas (por defecto el mes actual), por deuda o por categoría, una moneda a la vez (botón USD / COP) con el total en el centro, y debajo la lista de pagos con estado, monto y moneda.
- **Recordatorios en Más:** activar o desactivar, hora del aviso y días de anticipación (1, 3 o 7). Contador rojo en la pestaña Inicio con las cuotas vencidas sin pagar (últimos dos meses) y las que vencen dentro de esos días. Los avisos del dispositivo siguen funcionando solo con la app abierta (no hay notificaciones en segundo plano).
- **Exportar a CSV** en Más: pagos entre dos fechas, con el monto como número limpio y una columna "Moneda".
- **Campos nuevos opcionales en cada deuda:** cuota mensual (para calcular "Por pagar este mes") y categoría (para la dona). Se guarda también la fecha de creación de las deudas nuevas, para no marcar como vencidas cuotas anteriores.
- **Actualización automática:** el service worker usa el caché `mpd-cache-v1.2`, revisa si hay versión nueva cada vez que se abre la app y, si la hay, muestra "Nueva versión disponible – Actualizar". Al tocarlo la app se recarga con la versión nueva. Los cachés viejos se borran. `netlify.toml` evita que el navegador guarde en caché `index.html`, `sw.js` y `config.js`.
- **Supabase:** migración `supabase/migrations/20261115000000_v1_2_fecha_vencimiento_pagos.sql` (solo agrega: columna `payments.due_on`, un trigger que la llena y un índice; `debts.currency` y `payments.paid_on` ya existían). Respaldo de la estructura anterior en `supabase/respaldo-v1.1.sql`. Los campos nuevos de la app viajan en las columnas `extra` que ya existían, así que la sincronización no cambió.
- Se quitó el selector pequeño de moneda junto al total (`currency-ghost.js`), porque el inicio ya muestra todas las monedas. Los archivos siguen en el repositorio, pero la app ya no los carga.

### Publicación en Netlify

Netlify publica la carpeta `dist` (también indicado en `netlify.toml`). Para que la 1.2 salga desde `main`: Netlify → el sitio → *Site configuration* → *Build & deploy* → *Continuous deployment* → *Branches and deploy contexts* → *Configure* → *Production branch* = `main` → *Save*. Luego *Deploys* → *Trigger deploy* → *Deploy site*.

### Volver a una versión anterior

- **Respaldo 1.1:** rama `respaldo-v1.1` (y etiqueta `v1.1`, si se creó). Es el código de `main` antes de esta versión, **sin** cuentas.
- **Versión con cuentas que estaba publicada antes de la 1.2:** rama `cuentas-usuario`.
- **La más rápida:** Netlify → *Deploys* → elegir el despliegue anterior → *Publish deploy*. No toca GitHub.
- **Desde GitHub:** en Netlify cambiar *Production branch* a `respaldo-v1.1` (o a `cuentas-usuario`) y desplegar.
- **Base de datos:** la 1.1 no usa la columna nueva; no hace falta deshacer la migración. Si se quiere, los comandos están al final del archivo de la migración.

## Pruebas

Requisitos: Node.js 20 o superior.

```bash
cd tests
npm install        # instala jsdom (solo para pruebas)
npm test           # 43 pruebas automatizadas con DOM simulado
npm run check      # node --check en todos los JS + recursos de HTML, service worker y manifiesto
```

Ver `PRUEBAS.md` para el detalle de lo probado y lo que falta por probar.

Esta copia parte de la versión publicada 12 del sitio, con el selector de moneda y las ayudas educativas. No incluye deudas personales ni credenciales.
