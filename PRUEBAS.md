# Comprobaciones

## Versión con cuentas opcionales (rama `cuentas-usuario`, 14 de noviembre de 2026)

Todas las pruebas usan datos ficticios.

### Cómo ejecutarlas

```bash
cd tests
npm install     # instala jsdom 27.4.0, solo para pruebas
npm test        # 29 pruebas automatizadas con DOM simulado (≈1 minuto)
npm run check   # sintaxis y recursos
```

`tests/harness.js` carga el `dist/index.html` real con todos sus scripts en jsdom y reemplaza `fetch`, `XMLHttpRequest`, `sendBeacon` y la carga de scripts externos por espías, para comprobar que no ocurre ninguna solicitud de red. `tests/fake-supabase.js` simula supabase-js y reproduce en memoria las reglas de `supabase/schema.sql` (versiones, lápidas, ajustes por clave y restricciones).

### Resultados

- `npm run check`: `node --check` en los 27 archivos JavaScript de `dist/` y `tests/`; referencias locales de `index.html`, `privacidad.html` y `terminos.html`; los 34 recursos del service worker (`deudas-pwa-v7`) y los íconos del manifiesto existen; misma versión fija y SRI de supabase-js en la página y el service worker; sin claves secretas en el repositorio. **Aprobado.**
- `tests/cuentas.test.js` (22 pruebas). **Aprobado:**
  - Sin configuración: la app funciona igual, sin red y sin claves nuevas en `localStorage`; respaldo sigue funcionando.
  - Configurada pero sin sesión: ninguna solicitud de red, no se carga supabase-js, no se crea cliente, ninguna pantalla obligatoria.
  - Sin internet al abrir con sesión: la app sigue funcionando localmente.
  - Subida inicial desde el formulario de inicio de sesión: pregunta antes de subir, sube deudas, pagos y presupuesto, no modifica lo local, guarda copia previa, no escribe datos financieros ni tokens en consola.
  - Datos en ambos lados: muestra conteos; "Usar la nube" guarda copia previa y copia anterior; "Usar lo de este dispositivo" deja la nube igual y conserva lo de la nube en copia local.
  - Cambios enviados y descargados en un segundo dispositivo; borrado con lápida sin datos financieros y aviso en el otro dispositivo.
  - Conflicto (dos dispositivos sin conexión): gana la edición más reciente, con aviso; el otro dispositivo recibe la versión ganadora.
  - Conflicto inverso: gana la nube, la versión local queda en una copia anterior y se avisa.
  - Con un formulario abierto no se aplican cambios de la nube; se aplican al cerrarlo.
  - Restauración interrumpida pendiente: la sincronización queda en pausa y no se hace ninguna llamada a la base de datos.
  - Restaurar un respaldo manual con sesión se refleja en la nube; aparece el aviso ajustado del respaldo.
  - Cerrar sesión conservando la copia: datos intactos y ninguna solicitud posterior.
  - Cerrar sesión borrando la copia: solo queda el idioma; la nube no se toca.
  - Eliminar cuenta: dos pasos (palabra de confirmación), borra la nube y la cuenta, pregunta por la copia local.
  - Registro: casilla de aceptación sin marcar y obligatoria, contraseña mínima de 8, mismo mensaje exista o no el correo, enlace mágico sin crear cuentas y con mensaje neutro, Google deshabilitado.
  - Nombres con HTML que vienen de la nube se muestran como texto (sin inyección).
  - Deudas que no cumplen las reglas de la nube no se suben, se listan y no se borran.
  - Ajustes sincronizados por clave; valores inválidos de la nube se rechazan con el validador existente.
  - Detector de clave secreta (`service_role` / `sb_secret_`).
  - Si los datos de la nube se borran desde otro dispositivo, este conserva su copia, cierra sesión y avisa; no vuelve a subir lo borrado.
  - Un registro que no se puede subir (nombre largo, id `__proto__`) no genera solicitudes repetidas ni contamina prototipos.
- `tests/nucleo-i18n.test.js` (7 pruebas). **Aprobado:** normalización ida y vuelta sin cambios fantasma; validación equivalente a las restricciones SQL; plan de fusión (casos básicos, borrados y conflictos por fecha); cada texto nuevo tiene traducción en `i18n.js`; panel Cuenta y encabezado en inglés; flujos existentes sin cuenta (agregar, pagar, ordenar, presupuesto, recordatorios, navegación) sin claves nuevas ni red; la restauración interrumpida sigue bloqueando la edición y también las escrituras desde la nube.
- Comparación con la versión anterior (`HEAD` de `main`), sin cuenta, con las mismas acciones: el contenido de `localStorage` y las vistas Plan, Métodos y Avisos (español e inglés) son idénticos. En Inicio la única diferencia son los nuevos enlaces a Privacidad y Términos del pie.

### Base de datos (proyecto de desarrollo `mi-plan-de-deudas-dev`)

Se aplicó `supabase/schema.sql` como migración `mpdd_cuentas_usuario_v1`. Prueba de RLS con dos usuarios ficticios dentro de una transacción que se revirtió por completo (no quedaron datos):

- El usuario A sube una deuda con 2 pagos y presupuesto; la descarga devuelve 1 deuda y 2 pagos.
- Una versión vieja sin base es rechazada (control de versiones).
- Restricciones: rechaza saldo negativo, moneda `EUR`, nombre de 81 caracteres, día 32 y claves de ajustes no permitidas.
- A no puede insertar filas con el `user_id` de B.
- B no ve (`select` = 0), no actualiza (0 filas) ni borra (0 filas) las filas de A; B puede crear su propia deuda con el mismo id sin afectar a A; los datos de A quedan intactos.
- La lápida de A queda con nombre genérico, saldo 0 y sin pagos; `mpdd_delete_my_data` deja todo vacío.
- El rol `anon` no puede leer las tablas ni ejecutar las funciones.

`get_advisors` (seguridad): sin alertas sobre las tablas o funciones nuevas. Quedan dos avisos ajenos a este cambio: *Leaked password protection* desactivada (configuración de Auth, ver README paso 6) y, nivel INFO, el esquema previo `debt_private` (tablas `documents` y `applied_operations`, creadas antes de esta rama) con RLS sin políticas, lo que equivale a acceso denegado. `get_advisors` (rendimiento): sin avisos.

### Revisión independiente

Un agente que no participó en el código revisó seguridad (acceso entre usuarios, secretos, inyección en el HTML) y regresiones del modo sin cuenta. No encontró acceso entre usuarios, secretos expuestos ni inyección. Encontró y se corrigieron, con nuevas pruebas cuando fue posible:

- (Alta) Un dispositivo borraba sus datos locales si las filas desaparecían de la nube (por ejemplo, tras "Eliminar mi cuenta" en otro dispositivo). Ahora una fila ausente nunca borra datos locales y un borrado total de la nube cierra la sesión conservando la copia local.
- (Alta) Un cambio pendiente imposible de subir provocaba una descarga cada ~4 s. Ahora solo un cambio nuevo dispara la sincronización y los reintentos respetan la espera progresiva.
- (Alta) La actualización del service worker podía borrar la copia sin conexión de la página principal. Ahora se traslada a la caché nueva antes de borrar las viejas.
- (Media) Abrir la app sin internet con la sesión vencida la cerraba. Ahora se conserva y se reintenta.
- (Media/baja) Ids `__proto__`, borrado de cuenta en paralelo con una sincronización, inserción simultánea del mismo id en el servidor, "Usar la nube" que subía ajustes solo locales, permisos de tabla sobrantes para `authenticated` y un espacio del encabezado.

La segunda verificación del revisor confirmó las correcciones; el caso parcial que señaló (sesión vencida con conexión aparente) también se corrigió.

### Lo que NO se probó

- Supabase real desde el navegador: registro, correos de confirmación, enlace mágico, recuperación de contraseña con PKCE, renovación de sesión y Google. La interfaz se probó contra un simulador; falta probar contra el proyecto con la URL y la clave reales.
- La función `delete-account` no se desplegó ni se ejecutó (se probó su contrato con el simulador).
- Que el archivo de jsDelivr coincida byte a byte con el paquete de npm usado para calcular el SRI: se calculó desde el paquete oficial `@supabase/supabase-js@2.118.0`; si jsDelivr sirviera otro contenido, el navegador bloquearía la carga (la app seguiría funcionando sin cuenta).
- Navegadores y dispositivos físicos (iPhone, Android, escritorio), modo instalado (PWA), service worker real y caché sin conexión.
- Concurrencia real entre pestañas (se usa `navigator.locks` cuando existe; sigue recomendándose una sola pestaña).
- Volumen alto de datos y límites de cuota de `localStorage` con copias previas.
- `get_advisors` y la prueba de RLS se repitieron después de las correcciones del servidor (mismos resultados).

## Revisión anterior (transferencia, versión 12)

Fuente revisada: versión 12 publicada del sitio, commit de origen `b881ea8fd30a58779f9eadeeee690ba1ef595f29`. Con datos ficticios: sintaxis, integridad de recursos, cálculos financieros, comparación de estrategias, selector de moneda, ayudas, recordatorios, validación, respaldo, restauración, cuota, recuperación y conflicto simulado: aprobados. Esas pruebas se ejecutaron en el entorno de desarrollo original y sus archivos no formaban parte de la transferencia.
