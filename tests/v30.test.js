/* Versión 3.0: app de Android con Capacitor. Se comprueba la configuración del proyecto (archivos) y el
   comportamiento dentro de la app con un puente de Capacitor SIMULADO en jsdom. No se compiló Android aquí
   (sin SDK); la compilación real corre en GitHub Actions y la prueba en un celular queda a cargo de la persona. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { load, closeAll, waitFor, sleep, debt, session } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const lsFiles = () => execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

/* ---------- proyecto ---------- */
test("Capacitor: appId, nombre, webDir y plataforma Android", () => {
  const c = JSON.parse(read("capacitor.config.json"));
  assert.equal(c.appId, "com.solvipath.app");
  assert.equal(c.appName, "SolviPath");
  assert.equal(c.webDir, "dist");
  const pkg = JSON.parse(read("package.json"));
  for (const d of ["@capacitor/core", "@capacitor/cli", "@capacitor/android", "@capacitor/app", "@capacitor/local-notifications", "@capacitor/browser"]) assert.ok(pkg.dependencies[d], d);
  assert.ok(pkg.devDependencies["@capacitor/assets"]);
  assert.match(read("android/app/build.gradle"), /applicationId "com\.solvipath\.app"/);
  assert.match(read("android/variables.gradle"), /targetSdkVersion = 36/);
  assert.match(read("android/variables.gradle"), /compileSdkVersion = 36/);
});

test("Android: deep links, permiso de notificaciones y sin alarmas exactas", () => {
  const m = read("android/app/src/main/AndroidManifest.xml");
  assert.match(m, /android:scheme="com\.solvipath\.app" android:host="auth" android:pathPrefix="\/callback"/);
  assert.match(m, /android:autoVerify="true"[\s\S]*android:scheme="https" android:host="www\.solvipath\.com" android:pathPrefix="\/auth\/callback"/);
  assert.match(m, /POST_NOTIFICATIONS/);
  assert.match(m, /SCHEDULE_EXACT_ALARM" tools:node="remove"/);
  assert.match(m, /android:launchMode="singleTask"/);
});

test("Íconos y pantalla de inicio generados para Android", () => {
  for (const f of ["mipmap-anydpi-v26/ic_launcher.xml", "mipmap-xxxhdpi/ic_launcher_foreground.png", "mipmap-xxxhdpi/ic_launcher_background.png", "drawable/splash.png", "drawable/ic_stat_solvipath.xml"])
    assert.ok(fs.existsSync(path.join(ROOT, "android/app/src/main/res", f)), f);
  assert.match(read("android/app/src/main/res/values/styles.xml"), /windowSplashScreenBackground">#0b1f1d/);
});

test("Seguridad: ninguna llave ni contraseña en el repositorio y .gitignore completo", () => {
  const ig = read(".gitignore");
  for (const p of ["build/", ".gradle/", "local.properties", "*.keystore", "*.jks", "keystore.properties"]) assert.ok(ig.split("\n").includes(p), p);
  const bad = lsFiles().filter((f) => /\.(jks|keystore)$|(^|\/)keystore\.properties$|\.pem$|\.p12$/.test(f));
  assert.deepEqual(bad, []);
  const gradle = read("android/app/build.gradle");
  assert.doesNotMatch(gradle, /storePassword\s+["'][^"']+["']/);
  assert.match(gradle, /System\.getenv\("KEYSTORE_PASSWORD"\)/);
});

test("Netlify no cambia: sigue publicando solo dist, sin comando de compilación", () => {
  const t = read("netlify.toml");
  assert.match(t, /publish = "dist"/);
  assert.match(t, /command = ""/);
  assert.doesNotMatch(t, /capacitor|android/i);
});

test("Workflow de GitHub Actions: APK de depuración y AAB firmado desde Secrets", () => {
  const w = read(".github/workflows/android.yml");
  for (const s of ["KEYSTORE_BASE64", "KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"]) assert.match(w, new RegExp("secrets\\." + s));
  assert.match(w, /assembleDebug/);
  assert.match(w, /bundleRelease/);
  assert.match(w, /upload-artifact@v4[\s\S]*app-debug\.apk/);
  assert.match(w, /app-release\.aab/);
  assert.match(w, /platforms;android-36/);
  assert.doesNotMatch(w, /(KEYSTORE_PASSWORD|KEY_PASSWORD|KEY_ALIAS|KEYSTORE_BASE64):\s*(?!\$\{\{ secrets\.)\S/);
});

test("assetlinks.json listo para llenar con la huella SHA-256", () => {
  const a = JSON.parse(read("dist/.well-known/assetlinks.json"));
  assert.equal(a[0].target.package_name, "com.solvipath.app");
  assert.equal(a[0].target.namespace, "android_app");
  assert.ok(Array.isArray(a[0].target.sha256_cert_fingerprints));
});

test("versión 3.0 y caché del service worker v3.0; la web incluye native.js/native.css", () => {
  assert.match(read("dist/app-version.js"), /VERSION='3\.0'/);
  assert.match(read("dist/sw.js"), /CACHE='mpd-cache-v3\.0'/);
  assert.match(read("dist/sw.js"), /'\/native\.js','\/native\.css'/);
  assert.match(read("dist/index.html"), /href="\/native\.css"/);
  assert.match(read("dist/index.html"), /src="\/native\.js" defer/);
  assert.match(read("dist/existing-install.js"), /Capacitor[\s\S]*isNativePlatform[\s\S]*serviceWorker\.register/);
  assert.match(read("dist/config.js"), /googleEnabled: false/);
  assert.match(read("dist/ads.js"), /ADS_ENABLED\s*=\s*false/);
});

/* ---------- la web sigue igual ---------- */
test("en la web (sin Capacitor) native.js no hace nada", () => {
  const h = load({});
  assert.equal(h.win.MPDDNative.isNative, false);
  assert.equal(h.doc.documentElement.classList.contains("native-app"), false);
  assert.equal(h.doc.getElementById("native-reminders"), null);
  assert.match(h.doc.querySelector('meta[name="viewport"]').content, /^width=device-width,initial-scale=1$/);
});

/* ---------- dentro de la app (puente simulado) ---------- */
function bridge() {
  const b = { listeners: {}, exited: 0, opened: [], notifs: [], channels: [], cancelled: 0, perm: "prompt", permRequests: 0, swRegister: 0, swUnregister: 0, bars: [] };
  b.install = (win) => {
    win.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        App: { addListener: (n, cb) => ((b.listeners[n] = cb), Promise.resolve({ remove() {} })), exitApp: () => b.exited++, getLaunchUrl: async () => (b.launch ? { url: b.launch } : undefined) },
        Browser: { open: async (o) => b.opened.push(o.url), close: async () => {} },
        SystemBars: { setStyle: async (o) => b.bars.push(o) },
        LocalNotifications: {
          checkPermissions: async () => ({ display: b.perm }),
          requestPermissions: async () => {
            b.permRequests++;
            b.perm = b.grant === false ? "denied" : "granted";
            return { display: b.perm };
          },
          createChannel: async (c) => b.channels.push(c),
          getPending: async () => ({ notifications: b.notifs.map((n) => ({ id: n.id })) }),
          cancel: async () => ((b.cancelled += b.notifs.length), (b.notifs = [])),
          schedule: async ({ notifications }) => b.notifs.push(...notifications),
        },
      },
    };
    Object.defineProperty(win.navigator, "serviceWorker", { configurable: true, value: { register: () => (b.swRegister++, Promise.resolve({})), getRegistrations: async () => (b.swUnregister++, []), addEventListener() {}, ready: new Promise(() => {}) } });
  };
  return b;
}
const nativeApp = (b, o = {}) => load(Object.assign({ beforeParse: b.install }, o));
const settle = (ms = 80) => sleep(ms);

test("app nativa: clase native-app, áreas seguras, barras del sistema y sin service worker", async () => {
  const b = bridge();
  const h = nativeApp(b);
  await settle();
  assert.equal(h.win.MPDDNative.isNative, true);
  assert.ok(h.doc.documentElement.classList.contains("native-app"));
  assert.match(h.doc.querySelector('meta[name="viewport"]').content, /viewport-fit=cover/);
  assert.deepEqual(b.bars.map((x) => [x.bar, x.style]), [["StatusBar", "DARK"], ["NavigationBar", "LIGHT"]]);
  h.win.dispatchEvent(new h.win.Event("load"));
  await settle();
  assert.equal(b.swRegister, 0, "no se registra el service worker en la app");
  const css = read("dist/native.css");
  assert.match(css, /html\.native-app header\{padding-top:calc\(23px \+ var\(--sat\)\)\}/);
  assert.match(css, /html\.native-app \.bottom-nav\{padding-bottom:calc\(5px \+ var\(--sab\)\)/);
});

test("app nativa: enlaces externos y legales abren en el navegador", async () => {
  const b = bridge();
  const h = nativeApp(b);
  await settle();
  const click = (href) => {
    const a = h.doc.createElement("a");
    a.setAttribute("href", href);
    h.doc.body.append(a);
    const ev = new h.win.MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  assert.equal(click("https://ejemplo.com/pagina"), true);
  assert.equal(click("/privacidad.html"), true);
  assert.equal(click("/terminos.html"), true);
  assert.equal(click("/eliminar-cuenta.html"), true);
  assert.equal(click("#seccion"), false, "los enlaces internos no se interceptan");
  assert.deepEqual(b.opened, ["https://ejemplo.com/pagina", "https://www.solvipath.com/privacidad.html", "https://www.solvipath.com/terminos.html", "https://www.solvipath.com/eliminar-cuenta.html"]);
});

test("app nativa: botón atrás cierra diálogos y menús y, en la pantalla principal, sale de la app", async () => {
  const b = bridge();
  const server = new FakeServer();
  const uid = server.addUser("persona@ejemplo.test", "x12345678");
  const h = nativeApp(b, { config: "test", server, storage: { "deudas-lang-v1": "es", "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("persona@ejemplo.test", uid) } });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "sesión" });
  await waitFor(() => !h.doc.querySelector(".account-avatar").hidden, { label: "avatar" });
  const back = () => b.listeners.backButton({ canGoBack: false });
  // 1) diálogo abierto
  const d = h.doc.createElement("dialog");
  d.setAttribute("open", "");
  h.doc.body.append(d);
  back();
  assert.equal(d.hasAttribute("open"), false, "cierra el diálogo");
  assert.equal(b.exited, 0);
  // 2) menú del perfil abierto
  h.doc.querySelector(".account-avatar").click();
  const menu = h.doc.getElementById("account-menu");
  assert.equal(menu.hidden, false);
  back();
  assert.equal(menu.hidden, true, "cierra el menú");
  assert.equal(b.exited, 0);
  // 3) pantalla principal: sale de la app
  back();
  assert.equal(b.exited, 1, "sale de la app");
});

test("app nativa: enlaces de correo (appUrlOpen) completan el inicio de sesión y el flujo de recuperación", async () => {
  const b = bridge();
  const server = new FakeServer();
  server.addUser("persona@ejemplo.test", "x12345678");
  const h = nativeApp(b, { config: "test", server });
  await waitFor(() => h.win.MPDDCloud.status().state === "signedOut", { label: "sin sesión" });
  // los correos llevan al enlace de la app
  await h.win.MPDDCloud.signUp("nueva@ejemplo.test", "clave-larga-1", true);
  assert.equal(server.lastSignUpRedirect, "com.solvipath.app://auth/callback");
  await h.win.MPDDCloud.resetPassword("persona@ejemplo.test");
  const reset = server.calls.find((c) => c[0] === "reset");
  assert.equal(reset[2].redirectTo, "com.solvipath.app://auth/callback/recovery");
  // confirmación de cuenta
  b.listeners.appUrlOpen({ url: "com.solvipath.app://auth/callback?code=abc123" });
  await waitFor(() => h.win.MPDDCloud.status().userId, { label: "sesión iniciada" });
  assert.deepEqual(server.calls.filter((c) => c[0] === "exchange"), [["exchange", "abc123"]]);
  assert.equal(h.win.MPDDCloud.status().recovery, false);
});

test("app nativa: el enlace de recuperar contraseña activa la pantalla de nueva contraseña; un enlace vencido avisa", async () => {
  const b = bridge();
  const server = new FakeServer();
  server.addUser("persona@ejemplo.test", "x12345678");
  server.exchangeEvent = "PASSWORD_RECOVERY";
  const h = nativeApp(b, { config: "test", server });
  await waitFor(() => h.win.MPDDCloud.status().state === "signedOut", { label: "sin sesión" });
  b.listeners.appUrlOpen({ url: "com.solvipath.app://auth/callback/recovery?code=zzz" });
  await waitFor(() => h.win.MPDDCloud.status().recovery === true, { label: "recuperación" });
  // enlace vencido o inválido
  const r = await h.win.MPDDCloud.handleAuthUrl("com.solvipath.app://auth/callback?code=mala");
  assert.equal(r.ok, false);
  assert.equal(r.error, "linkInvalid");
  const r2 = await h.win.MPDDCloud.handleAuthUrl("com.solvipath.app://auth/callback?error=access_denied&error_description=expired");
  assert.equal(r2.error, "linkInvalid");
  // otros enlaces no se procesan
  const calls = server.calls.length;
  b.listeners.appUrlOpen({ url: "com.solvipath.app://otra/cosa?code=1" });
  await sleep(30);
  assert.equal(server.calls.length, calls);
});

test("app nativa: si la app se abre desde el enlace del correo, lo procesa al iniciar", async () => {
  const b = bridge();
  b.launch = "com.solvipath.app://auth/callback?code=inicio1";
  const server = new FakeServer();
  server.addUser("persona@ejemplo.test", "x12345678");
  nativeApp(b, { config: "test", server });
  await waitFor(() => server.calls.some((c) => c[0] === "exchange" && c[1] === "inicio1"), { label: "enlace de inicio" });
});

test("app nativa: avisos de pago — el permiso se pide al tocar el botón y se programan con el canal «Recordatorios de pago»", async () => {
  const b = bridge();
  const h = nativeApp(b, { storage: { "deudas-lang-v1": "es", "nando-deudas-v1": JSON.stringify([debt("d1", "Tarjeta Uno", { due: "15" }), debt("d2", "Préstamo", { due: "28" })]) } });
  await waitFor(() => h.doc.getElementById("native-reminders"), { label: "bloque de avisos" });
  assert.equal(b.permRequests, 0, "no se pide permiso al abrir la app");
  const box = h.doc.getElementById("native-reminders");
  assert.equal(h.doc.getElementById("notificaciones-title").textContent, "Avisos de pago en este teléfono");
  box.querySelector("button").click(); // «Activar avisos»
  await waitFor(() => b.notifs.length > 0, { label: "avisos programados" });
  assert.equal(b.permRequests, 1);
  assert.equal(h.win.localStorage.getItem("mpdd-foreground-notices-enabled-v1"), "true");
  assert.equal(b.channels.length >= 1 && b.channels[0].id, "recordatorios-pago");
  assert.equal(b.channels[0].name, "Recordatorios de pago");
  const ids = new Set(b.notifs.map((n) => n.id));
  assert.equal(ids.size, b.notifs.length, "ids únicos");
  for (const n of b.notifs) {
    assert.equal(n.channelId, "recordatorios-pago");
    assert.ok(n.schedule.at.getTime() > Date.now(), "solo en el futuro");
    assert.equal(n.schedule.at.getHours(), 8);
    assert.match(n.body, /Tarjeta Uno|Préstamo/);
  }
  assert.ok(b.notifs.length <= 60);
  // desactivar cancela todo
  [...box.querySelectorAll("button")][1].click();
  await waitFor(() => b.notifs.length === 0, { label: "avisos cancelados" });
});

test("app nativa: si el permiso de notificaciones se niega, no se programa nada y se explica", async () => {
  const b = bridge();
  b.grant = false;
  const h = nativeApp(b, { storage: { "deudas-lang-v1": "es", "nando-deudas-v1": JSON.stringify([debt("d1", "Tarjeta Uno")]) } });
  await waitFor(() => h.doc.getElementById("native-reminders"), { label: "bloque" });
  h.doc.getElementById("native-reminders").querySelector("button").click();
  await waitFor(() => /permiso de notificaciones/.test(h.doc.querySelector("#native-reminders .status").textContent), { label: "mensaje" });
  assert.equal(b.notifs.length, 0);
  assert.notEqual(h.win.localStorage.getItem("mpdd-foreground-notices-enabled-v1"), "true");
});
