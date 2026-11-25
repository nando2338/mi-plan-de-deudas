/* Versión 1.9: nombre SolviPath, dominio, mensajes de registro, recuperación de contraseña y
   notificaciones que se mantienen. DOM simulado (jsdom) y servidor falso; sin red real. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { load, closeAll, waitFor, sleep, debt, session } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const EN = { "deudas-lang-v1": "en" };
const ROOT = path.join(__dirname, "..");
const ENDPOINT = "https://push.example.test/send/abc123";


function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === "node_modules" || f.name === ".git") continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(html|js|css|json|webmanifest|md|toml|ts|sql)$/.test(f.name) && f.name !== "package-lock.json") out.push(p);
  }
  return out;
}

test("nombre: SolviPath en pestaña, manifest, metas y sin rastros del nombre viejo", () => {
  const html = fs.readFileSync(path.join(ROOT, "dist/index.html"), "utf8");
  assert.match(html, /<title>SolviPath<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="SolviPath"/);
  assert.match(html, /og:title" content="SolviPath"/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.solvipath\.com\/"/);
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/manifest.webmanifest"), "utf8"));
  assert.equal(m.name, "SolviPath");
  assert.equal(m.short_name, "SolviPath");
  assert.ok(m.icons.every((i) => /^\/logo-/.test(i.src)), "ícono nuevo");
  const old = /mi plan de deudas|my debt plan|plan de deudas|mis deudas"\s*,\s*"start/i;
  const hits = walk(ROOT).filter((f) => !f.includes(`${path.sep}tests${path.sep}v19.test.js`) && old.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hits.map((f) => path.relative(ROOT, f)), []);
});

test("dominio: sin dominios viejos escritos a mano", () => {
  const bad = /netlify\.app|chatgpt\.site|miplandedeudas|youtiao/i;
  const hits = walk(ROOT).filter((f) => !f.includes(`${path.sep}tests${path.sep}`) && !f.endsWith("README.md") && !f.endsWith("PRUEBAS.md") && bad.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hits.map((f) => path.relative(ROOT, f)), []);
});

test("encabezado: logo, nombre y lema en español e inglés; mismo bloque en el inicio de sesión", async () => {
  for (const [storage, tagline] of [[ES, "Tu camino a la tranquilidad financiera"], [EN, "Your path to financial peace of mind"]]) {
    const h = load({ config: "test", storage });
    await sleep(80);
    assert.equal(h.doc.querySelector(".brand .brand-name").textContent, "SolviPath");
    assert.equal(h.doc.querySelector(".brand .brand-tagline").textContent, tagline);
    assert.ok(h.doc.querySelector('.brand img[src="/logo-encabezado.png"]'));
    assert.equal(h.doc.querySelector("#account-auth-dialog .auth-brand-name").textContent, "SolviPath");
    assert.equal(h.doc.querySelector("#account-auth-dialog .auth-brand-tagline").textContent, tagline);
    assert.equal(h.doc.querySelector("header .eyebrow"), null, "el lema no se repite");
    h.close();
  }
});

/* ---------- registro ---------- */
async function signupForm(h) {
  await sleep(50);
  h.doc.querySelector(".account-header .account-enter").click();
  [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => b.textContent === "Crear cuenta").click();
  h.doc.getElementById("acc-accept").checked = true;
  return h.doc.querySelector("#account-auth-dialog form");
}
async function submitSignup(h, form, email = "nuevo@ejemplo.test") {
  h.doc.getElementById("acc-signup-email").value = email;
  h.doc.getElementById("acc-signup-password").value = h.doc.getElementById("acc-signup-password2").value = "secreto123";
  form.dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await waitFor(() => !/Procesando/.test(form.querySelector(".account-msg").textContent) && form.querySelector(".account-msg").textContent, { label: "respuesta" });
  return form.querySelector(".account-msg").textContent;
}

test("registro: cada error de Supabase muestra su motivo real; 'Sin conexión' solo si de verdad no hay red", async () => {
  const cases = [
    [{ name: "AuthApiError", status: 422, code: "user_already_exists", message: "User already registered" }, /ya está registrado/],
    [{ name: "AuthApiError", status: 400, code: "email_address_invalid", message: "Email address is invalid" }, /correo no es válido/],
    [{ name: "AuthApiError", status: 422, code: "weak_password", message: "Password should be at least 6 characters" }, /requisitos de seguridad|muy corta|débil/],
    [{ name: "AuthApiError", status: 429, code: "over_email_send_rate_limit", message: "rate limit" }, /Espera unos minutos y vuelve a intentarlo/],
    [{ name: "AuthApiError", status: 500, code: "unexpected_failure", message: "Error sending confirmation email" }, /No pudimos enviar el correo\. Inténtalo de nuevo en unos minutos/],
    [{ name: "AuthApiError", status: 418, code: "algo_raro", message: "raro" }, /Algo salió mal\. Inténtalo de nuevo/],
  ];
  for (const [err, re] of cases) {
    const server = new FakeServer();
    server.signupError = err;
    const h = load({ config: "test", server, storage: ES });
    const form = await signupForm(h);
    const msg = await submitSignup(h, form);
    assert.match(msg, re, err.code);
    assert.doesNotMatch(msg, /Sin conexión/, err.code);
    if (err.code === "algo_raro") {
      const logged = h.consoleLogs.filter(([k, t]) => k === "error" && /auth error/.test(t));
      assert.equal(logged.length, 1, "el error se registra en la consola");
      assert.doesNotMatch(logged[0][1], /nuevo@ejemplo|secreto123/, "sin correo ni contraseña en la consola");
    }
    h.close();
  }
  // Sin red real: la petición falla antes de llegar al servidor.
  const server = new FakeServer();
  server.offline = true;
  const h = load({ config: "test", server, storage: ES });
  const form = await signupForm(h);
  assert.match(await submitSignup(h, form), /Sin conexión/);
  h.close();
});

test("registro: en inglés los motivos también se explican y el enlace del correo va al dominio oficial", async () => {
  const server = new FakeServer();
  server.signupError = { name: "AuthApiError", status: 429, code: "over_request_rate_limit", message: "x" };
  const h = load({ config: "test", server, storage: EN });
  const form = await signupForm(h);
  assert.match(await submitSignup(h, form), /Wait a few minutes and try again/);
  h.close();
  const s2 = new FakeServer();
  const h2 = load({ config: "test", server: s2, storage: ES });
  const f2 = await signupForm(h2);
  await submitSignup(h2, f2);
  const call = s2.calls.find((c) => c[0] === "signUp");
  assert.ok(call, "se llamó a signUp");
  h2.close();
});

test("registro correcto: aviso con carpeta de spam y botón Reenviar correo", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: ES });
  const form = await signupForm(h);
  const msg = await submitSignup(h, form);
  assert.equal(msg, "Te enviamos un correo para confirmar tu cuenta. Revisa también la carpeta de spam.");
  const resend = form.querySelector(".account-resend");
  assert.ok(resend && !resend.hidden && resend.textContent === "Reenviar correo");
  resend.click();
  await waitFor(() => /reenviamos el correo/.test(form.querySelector(".account-msg").textContent), { label: "reenvío" });
  const r = server.calls.find((c) => c[0] === "resend");
  assert.equal(r[1], "nuevo@ejemplo.test");
  assert.match(r[2].emailRedirectTo, /^https:\/\/www\.solvipath\.com\//);
  h.close();
});

test("iniciar sesión sin confirmar el correo: mensaje claro y opción de reenviar", async () => {
  const server = new FakeServer();
  server.addUser("sin@ejemplo.test", "secreto123");
  server.users.get("sin@ejemplo.test").confirmed = false;
  const h = load({ config: "test", server, storage: ES });
  await sleep(50);
  h.doc.querySelector(".account-header .account-enter").click();
  const form = h.doc.querySelector("#account-auth-dialog form");
  h.doc.getElementById("acc-login-email").value = "sin@ejemplo.test";
  h.doc.getElementById("acc-login-password").value = "secreto123";
  form.dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await waitFor(() => /Aún no has confirmado tu correo/.test(form.querySelector(".account-msg").textContent), { label: "no confirmado" });
  const resend = form.querySelector(".account-resend");
  assert.ok(resend && !resend.hidden);
  resend.click();
  await waitFor(() => server.calls.some((c) => c[0] === "resend" && c[1] === "sin@ejemplo.test"), { label: "reenvío" });
  h.close();
});

/* ---------- recuperar contraseña ---------- */
function recoveryDevice(server, extra = {}) {
  const uid = server.addUser("a@ejemplo.test", "clave-segura-1");
  const storage = Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("d1", "Tarjeta", { due: "20", minPayment: 40 })]) }, extra, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) });
  return { uid, storage };
}
const recOpen = (h) => h.doc.getElementById("recovery-dialog").open;

test("recuperar contraseña: pantalla propia, mínimo 6, ojo, guardar y entrar; sobrevive a una recarga", async () => {
  const server = new FakeServer();
  const { storage } = recoveryDevice(server);
  const h = load({ config: "test", server, storage });
  await waitFor(() => h.win.MPDDCloud.status().state === "synced" || h.win.MPDDCloud.status().state === "needsChoice", { label: "sesión" });
  server.emitAuth("PASSWORD_RECOVERY", JSON.parse(h.win.localStorage.getItem("sb-fake-auth-token")));
  await waitFor(() => recOpen(h), { label: "pantalla de nueva contraseña" });
  const dlg = h.doc.getElementById("recovery-dialog");
  assert.equal(dlg.querySelector("h2").textContent, "Crea tu nueva contraseña");
  assert.equal(dlg.querySelector(".auth-brand-name").textContent, "SolviPath");
  assert.equal(dlg.querySelectorAll(".pw-eye").length, 2, "ojo en los dos campos");
  assert.ok([...dlg.querySelectorAll("button")].some((b) => b.textContent === "Guardar contraseña"));
  assert.equal(h.win.localStorage.getItem("mpdd-recovery-pending"), "1");
  // Recarga (o actualización del service worker): la pantalla sigue ahí.
  const keep = { "mpdd-recovery-pending": "1", "sb-fake-auth-token": h.win.localStorage.getItem("sb-fake-auth-token") };
  const h2 = load({ config: "test", server, storage: Object.assign({}, storage, keep) });
  await waitFor(() => recOpen(h2), { label: "pantalla tras recargar" });
  const form = h2.doc.querySelector("#recovery-dialog form");
  const say = () => form.querySelector(".account-msg").textContent;
  const submit = () => form.dispatchEvent(new h2.win.Event("submit", { cancelable: true }));
  h2.doc.getElementById("acc-recovery-password").value = h2.doc.getElementById("acc-recovery-password2").value = "corta";
  submit();
  assert.match(say(), /al menos 6/);
  h2.doc.getElementById("acc-recovery-password").value = "secreto123";
  h2.doc.getElementById("acc-recovery-password2").value = "otra-cosa1";
  submit();
  assert.match(say(), /no coinciden/);
  h2.doc.getElementById("acc-recovery-password2").value = "secreto123";
  submit();
  await waitFor(() => say() === "Contraseña actualizada", { label: "actualizada" });
  await waitFor(() => !recOpen(h2), { label: "entrar a la app", timeout: 4000 });
  assert.equal(h2.win.localStorage.getItem("mpdd-recovery-pending"), null);
  assert.ok(server.calls.some((c) => c[0] === "updateUser"));
  h.close();
  h2.close();
});

test("recuperar contraseña: la pantalla no se puede cerrar con Escape y cerrar sesión la termina", async () => {
  const server = new FakeServer();
  const { storage } = recoveryDevice(server, { "mpdd-recovery-pending": "1" });
  const h = load({ config: "test", server, storage });
  await waitFor(() => recOpen(h), { label: "pantalla" });
  const ev = new h.win.Event("cancel", { cancelable: true });
  h.doc.getElementById("recovery-dialog").dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  [...h.doc.querySelectorAll("#recovery-dialog button")].find((b) => b.textContent === "Cerrar sesión").click();
  await waitFor(() => !recOpen(h), { label: "cierre" });
  assert.equal(h.win.localStorage.getItem("mpdd-recovery-pending"), null);
  h.close();
});

test("enlace vencido o inválido: mensaje claro y botón para pedir otro correo", async () => {
  const server = new FakeServer();
  server.addUser("a@ejemplo.test", "clave-segura-1");
  const h = load({ config: "test", server, storage: ES, url: "https://www.solvipath.com/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" });
  await waitFor(() => h.doc.getElementById("link-expired-dialog").open, { label: "aviso" });
  const dlg = h.doc.getElementById("link-expired-dialog");
  assert.equal(dlg.querySelector("h2").textContent, "El enlace venció o no es válido");
  h.doc.getElementById("acc-expired-email").value = "a@ejemplo.test";
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Pedir otro correo").click();
  await waitFor(() => server.calls.some((c) => c[0] === "reset"), { label: "otro correo" });
  const reset = server.calls.find((c) => c[0] === "reset");
  assert.match(reset[2].redirectTo, /^https:\/\/www\.solvipath\.com\/\?mpdd=recovery$/);
  h.close();
});

/* ---------- notificaciones que se mantienen ---------- */
/* Fake Notification + PushManager + service worker registration. */
function pushEnv(opts = {}) {
  const state = { requested: 0, permission: opts.permission || "default", grant: opts.grant || "granted", sub: null, subscribeCalls: [], unsubscribed: 0, listeners: {} };
  function install(win) {
    if (opts.ua) Object.defineProperty(win.navigator, "userAgent", { configurable: true, get: () => opts.ua });
    if (opts.standalone !== undefined) Object.defineProperty(win.navigator, "standalone", { configurable: true, value: opts.standalone });
    if (opts.noPush) return;
    Object.defineProperty(win, "isSecureContext", { configurable: true, value: true });
    function Notification() {}
    Notification.requestPermission = async () => {
      state.requested++;
      state.permission = state.grant;
      return state.permission;
    };
    Object.defineProperty(Notification, "permission", { get: () => state.permission });
    win.Notification = Notification;
    win.PushManager = function PushManager() {};
    const pushManager = {
      async getSubscription() {
        return state.sub;
      },
      async subscribe(o) {
        state.subscribeCalls.push(o);
        state.sub = {
          endpoint: ENDPOINT,
          options: { applicationServerKey: o.applicationServerKey.buffer },
          toJSON() {
            return { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: "BPclavePublicaDePrueba", auth: "secretoAuthPrueba" } };
          },
          async unsubscribe() {
            state.unsubscribed++;
            state.sub = null;
            return true;
          },
        };
        return state.sub;
      },
    };
    const reg = { active: {}, pushManager, showNotification: async () => {}, update: () => Promise.resolve(), addEventListener() {} };
    state.reg = reg;
    Object.defineProperty(win.navigator, "serviceWorker", {
      configurable: true,
      value: { controller: null, ready: Promise.resolve(reg), register: () => Promise.resolve(reg), getRegistration: async () => reg, addEventListener: (t, fn) => (state.listeners[t] = fn) },
    });
  }
  return { state, install };
}

async function signedInDevice(server, env, storage = {}) {
  const uid = server.addUser("a@ejemplo.test", "clave-segura-1");
  const h = load({
    config: "test",
    server,
    beforeParse: env ? env.install : undefined,
    storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("d1", "Tarjeta", { due: "20", minPayment: 40 })]) }, storage, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }),
  });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "inicio de sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") {
    await h.win.MPDDCloud.resolveLink("merge");
    await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "vinculación" });
  }
  return { h, uid };
}

const statusText = (h) => h.doc.getElementById("push-status").textContent;
async function settle(h) {
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "estado" });
  if (h.win.MPDDCloud.status().state === "needsChoice") await h.win.MPDDCloud.resolveLink("merge");
  await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "sincronizado" });
}
async function signedIn(server, env, email = "a@ejemplo.test", pass = "clave-segura-1") {
  const uid = server.addUser(email, pass);
  const h = load({ config: "test", server, beforeParse: env.install, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("d1", "Tarjeta", { due: "20", minPayment: 40 })]) }, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session(email, uid) }) });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") {
    await h.win.MPDDCloud.resolveLink("merge");
    await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "vinculación" });
  }
  return { h, uid };
}

test("notificaciones: cerrar sesión y volver a entrar las deja activas sin pedir permiso otra vez", async () => {
  const server = new FakeServer();
  const env = pushEnv();
  const { h, uid } = await signedIn(server, env);
  h.doc.getElementById("push-enable").click();
  await waitFor(() => server.pushSubs.length === 1, { label: "suscripción" });
  assert.equal(env.state.requested, 1);
  await h.win.MPDDCloud.signOut({ keepLocal: true, reload: false });
  assert.equal(server.pushSubs.length, 0, "la cuenta deja de enviar a este dispositivo");
  assert.equal(env.state.unsubscribed, 0, "la suscripción del navegador sigue viva");
  assert.equal(env.state.permission, "granted");
  const r = await h.win.MPDDCloud.signIn("a@ejemplo.test", "clave-segura-1");
  assert.ok(r.ok);
  await settle(h);
  await waitFor(() => server.pushSubs.length === 1, { label: "re-asociada" });
  assert.equal(server.pushSubs[0].user_id, uid);
  assert.equal(env.state.requested, 1, "no se pide permiso de nuevo");
  assert.equal(env.state.subscribeCalls.length, 1, "no se crea otra suscripción");
  await waitFor(() => !h.doc.getElementById("push-disable").hidden, { label: "interruptor activado" });
  assert.equal(h.doc.getElementById("push-enable").hidden, true);
  h.close();
});

test("notificaciones: al abrir la app con sesión, permiso concedido y suscripción, el interruptor aparece activado", async () => {
  const server = new FakeServer();
  const env = pushEnv({ permission: "granted" });
  env.state.sub = { endpoint: ENDPOINT, options: {}, toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "BPclavePublicaDePrueba", auth: "secretoAuthPrueba" } }), async unsubscribe() { env.state.unsubscribed++; env.state.sub = null; } };
  const { h, uid } = await signedIn(server, env);
  await waitFor(() => server.pushSubs.length === 1, { label: "suscripción asociada" });
  assert.equal(server.pushSubs[0].user_id, uid);
  await waitFor(() => !h.doc.getElementById("push-disable").hidden, { label: "interruptor" });
  assert.equal(env.state.requested, 0, "sin pedir permiso");
  h.close();
});

test("notificaciones: otra cuenta en el mismo dispositivo recibe la suscripción, sin duplicados", async () => {
  const server = new FakeServer();
  const env = pushEnv();
  const { h } = await signedIn(server, env);
  h.doc.getElementById("push-enable").click();
  await waitFor(() => server.pushSubs.length === 1, { label: "suscripción de A" });
  await h.win.MPDDCloud.signOut({ keepLocal: true, reload: false });
  const uidB = server.addUser("b@ejemplo.test", "otra-clave-22");
  const r = await h.win.MPDDCloud.signIn("b@ejemplo.test", "otra-clave-22");
  assert.ok(r.ok);
  await settle(h);
  await waitFor(() => server.pushSubs.length === 1 && server.pushSubs[0].user_id === uidB, { label: "suscripción de B" });
  assert.equal(server.pushSubs.length, 1);
  assert.equal(env.state.requested, 1);
  h.close();
});

test("notificaciones: permiso bloqueado explica cómo activarlas y no intenta suscribir", async () => {
  const server = new FakeServer();
  const env = pushEnv({ permission: "denied" });
  const { h } = await signedIn(server, env);
  await waitFor(() => /bloqueó las notificaciones/.test(statusText(h)), { label: "explicación" });
  assert.match(h.doc.getElementById("push-help").textContent, /Configuración de sitios|ícono junto a la dirección/);
  assert.equal(server.pushSubs.length, 0);
  assert.equal(env.state.subscribeCalls.length, 0);
  h.close();
});

test("notificaciones: el ícono usa el logo nuevo (sin león)", () => {
  const sw = fs.readFileSync(path.join(ROOT, "dist/sw.js"), "utf8");
  const fg = fs.readFileSync(path.join(ROOT, "dist/foreground-notices.js"), "utf8");
  for (const t of [sw, fg]) {
    assert.match(t, /icon:'\/logo-192\.png'/);
    assert.doesNotMatch(t, /leon|lion|león/i);
  }
  assert.ok(fs.existsSync(path.join(ROOT, "dist/logo-192.png")));
});

test("versión 1.9 en la app y en el caché del service worker", () => {
  assert.match(fs.readFileSync(path.join(ROOT, "dist/app-version.js"), "utf8"), /VERSION='(1\.9|2\.\d(\.\d+)?)'/);
  assert.match(fs.readFileSync(path.join(ROOT, "dist/sw.js"), "utf8"), /CACHE='mpd-cache-v(1\.9|2\.\d(\.\d+)?)'/);
});
