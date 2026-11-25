# SolviPath para Android (versión 3.0)

La app de Android es la **misma web** de la carpeta `dist/` empaquetada con [Capacitor](https://capacitorjs.com). Netlify sigue publicando solo `dist/` (no cambió `netlify.toml`). Los archivos de Android están en `android/`.

- appId: `com.solvipath.app` (no se puede cambiar después de publicar)
- Capacitor 8.6, `minSdk 24`, `compileSdk 36`, **`targetSdk 36`** (el nivel que Google Play exige a apps nuevas desde el 31 de agosto de 2026).
- Plugins: `@capacitor/app` (botón atrás y enlaces), `@capacitor/browser` (enlaces externos), `@capacitor/local-notifications` (avisos de pago).
- Todo el código propio de la app nativa está en `dist/native.js` y `dist/native.css`; en la web no hacen nada.

## Cómo se compila

GitHub Actions (`.github/workflows/android.yml`):

1. En GitHub: **Actions → Android → Run workflow** (también corre solo al cambiar `android/`, `assets/` o `capacitor.config.json`).
2. Al terminar, abajo en **Artifacts** descarga:
   - `solvipath-debug-apk` → `app-debug.apk` (para probar en tu celular).
   - `solvipath-release-aab` → `app-release.aab` (para Google Play). Solo aparece si ya cargaste los 4 Secrets de abajo.

En tu computadora (opcional, necesita Android Studio): `npm ci`, `npx cap sync android`, `npx cap open android`.

Después de cambiar algo de la web (`dist/`) hay que volver a compilar la app: el workflow siempre hace `npx cap sync android` antes de compilar.

## Paso a paso: crear la llave de subida (upload key) y cargarla en GitHub

Usaremos **Play App Signing**: Google guarda la llave de firma final; tú solo firmas lo que subes con una *llave de subida*. **Esta llave la creas tú, en tu computadora. Nunca la subas al repositorio ni la compartas.**

1. Instala Java (JDK 17 o 21) si no lo tienes; `keytool` viene incluido. Abre una terminal en una carpeta segura (no dentro del repositorio).
2. Crea la llave (te pedirá una contraseña y tus datos; recuerda la contraseña):

   ```
   keytool -genkeypair -v -storetype PKCS12 -keystore solvipath-upload.jks -alias solvipath-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Con PKCS12 la contraseña de la llave es la misma que la del archivo.
3. **Respalda** `solvipath-upload.jks` y la contraseña en un lugar seguro (gestor de contraseñas + copia fuera de línea). Si la pierdes, se puede reiniciar desde Play Console, pero toma días.
4. Convierte el archivo a texto base64:
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("solvipath-upload.jks")) | Set-Clipboard`
   - macOS: `base64 -i solvipath-upload.jks | pbcopy`
   - Linux: `base64 -w0 solvipath-upload.jks`
5. En GitHub, repositorio `nando2338/mi-plan-de-deudas` → **Settings → Secrets and variables → Actions → New repository secret**. Crea estos 4:

   | Secret | Valor |
   |---|---|
   | `KEYSTORE_BASE64` | el texto base64 del paso 4 |
   | `KEYSTORE_PASSWORD` | la contraseña que elegiste |
   | `KEY_ALIAS` | `solvipath-upload` |
   | `KEY_PASSWORD` | la misma contraseña (con PKCS12 es igual) |

6. Ejecuta de nuevo el workflow: ahora generará también el `.aab` firmado.
7. En **Play Console** crea la app y sube el `.aab` (primera vez: acepta **Play App Signing**).

## Pasos manuales que quedan a tu cargo

### Supabase → Authentication → URL Configuration → Redirect URLs
**Agrega** (sin quitar las que ya tienes; no cambies el Site URL):

```
com.solvipath.app://auth/callback
com.solvipath.app://auth/callback/recovery
```

Sin estas dos, los correos de confirmar cuenta y de recuperar contraseña **no volverán a la app** (la web sigue funcionando igual).

### Android App Links (opcional, https)
La app también acepta `https://www.solvipath.com/auth/callback`. Para que Android lo verifique:

1. Play Console → tu app → **Integridad de la app → Firma de la app** → copia la huella **SHA-256** del *certificado de la clave de firma de la app* (la de Google, no la de subida).
2. Pégala en `dist/.well-known/assetlinks.json` en lugar de `REEMPLAZA_CON_LA_HUELLA_SHA256_DE_LA_LLAVE_DE_FIRMA_DE_GOOGLE_PLAY`, sube el cambio a `main` y comprueba que abre `https://www.solvipath.com/.well-known/assetlinks.json`.

La app **no depende de esto**: por defecto los correos usan el enlace propio `com.solvipath.app://auth/callback`.

### Play Console
Ficha de la tienda, clasificación de contenido, seguridad de los datos, política de privacidad (`https://www.solvipath.com/privacidad.html`) y pruebas internas. La eliminación de cuenta está en la app (Más → Mi cuenta) y en `https://www.solvipath.com/eliminar-cuenta.html`.

## Instalar el `.apk` en tu celular Android para probar

1. En GitHub → **Actions → Android →** la última ejecución en verde → **Artifacts → `solvipath-debug-apk`** (se descarga un `.zip`; descomprímelo para sacar `app-debug.apk`).
2. Pasa el `.apk` al celular (descargándolo directo desde el celular con GitHub, o por cable/Drive).
3. Ábrelo desde **Archivos**. Android pedirá **permitir instalar apps de esta fuente** (Ajustes → «Instalar apps desconocidas» para el navegador o Archivos): acéptalo solo para esta instalación.
4. Abre **SolviPath**. Para probar los avisos: **Más → Avisos de pago en este teléfono → Activar avisos** (ahí aparece el permiso de notificaciones).
5. Para quitar la app de prueba: mantén pulsado el ícono → Desinstalar. El APK de depuración no sirve para Google Play.

## Decisiones técnicas

- **Sin alarmas exactas**: se quitó `SCHEDULE_EXACT_ALARM` (Google Play lo restringe). Los avisos usan alarmas normales: pueden llegar con algunos minutos de diferencia.
- **Avisos con la app cerrada**: se programan en el teléfono hasta 60 avisos de los próximos 45 días y se reprograman al abrir la app, al cambiar deudas/pagos/gastos o los ajustes. Si no abres la app en más de ~45 días, se acaban.
- **Sin service worker** dentro de la app (Capacitor ya sirve los archivos locales). Las actualizaciones llegan al publicar una versión nueva de la app.
- `android:allowBackup="false"`: los datos y la sesión no se copian a copias de seguridad de Google.
- `versionCode` = número de ejecución del workflow; `versionName` = 3.0.0.
- ADS_ENABLED sigue en `false`; no hay AdMob ni Google Play Billing.
