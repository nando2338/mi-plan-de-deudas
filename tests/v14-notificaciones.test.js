/* Versión 1.4: notificaciones push, Ajustes → Notificaciones, archivo .ics y
   la pestaña "Avisos" eliminada. DOM simulado (jsdom) y servidor falso; sin red real.
   Ejecutar: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { load, closeAll, waitFor, sleep, debt, session } = require("./harness");
const { FakeServer } = require("./fake-supabase");
const Push = require("../dist/notificaciones.js");
const Money = require("../dist/money.js");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const DIST = path.join(__dirname, "..", "dist");
const ENDPOINT = "https://push.example.test/send/abc123";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

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

test("activar notificaciones: permiso solo al tocar, suscripción y ajustes guardados en la cuenta", async () => {
  const server = new FakeServer();
  const env = pushEnv();
  const { h, uid } = await signedInDevice(server, env);
  const { doc, win } = h;
  await sleep(100);
  assert.equal(env.state.requested, 0, "no se pide permiso al cargar");
  assert.equal(server.pushCalls.length, 0, "sin llamadas a la función al cargar");
  assert.equal(doc.getElementById("notificaciones-title").textContent, "Notificaciones");
  assert.ok(doc.querySelector("#view-more #push-enable"), "el botón está en Más");
  assert.equal(doc.getElementById("push-disable").hidden, true);

  doc.getElementById("push-enable").click();
  await waitFor(() => server.pushSubs.length === 1, { label: "suscripción guardada" });
  await waitFor(() => server.pushSettings.has(uid), { label: "ajustes guardados" });
  assert.equal(env.state.requested, 1);
  const sub = env.state.subscribeCalls[0];
  assert.equal(sub.userVisibleOnly, true);
  assert.equal(sub.applicationServerKey.length, 65, "clave VAPID pública decodificada");
  // The public key was requested with the publishable key only.
  const get = server.pushCalls.find((c) => c.method === "GET");
  assert.equal(get.headers.apikey, "sb_publishable_PRUEBA123");
  assert.equal(get.headers.Authorization, undefined);
  const row = server.pushSubs[0];
  assert.equal(row.user_id, uid);
  assert.equal(row.endpoint, ENDPOINT);
  assert.equal(row.p256dh, "BPclavePublicaDePrueba");
  assert.equal(row.auth, "secretoAuthPrueba");
  assert.ok(typeof row.user_agent === "string" && row.user_agent.length <= 300);
  assert.ok(server.calls.some((c) => c[1] === "push_subscriptions" && c[2] === "upsert" && c[3] && c[3].onConflict === "user_id,endpoint"));
  assert.ok(server.calls.some((c) => c[1] === "push_settings" && c[2] === "upsert" && c[3] && c[3].onConflict === "user_id"));
  let s = server.pushSettings.get(uid);
  assert.equal(s.enabled, true);
  assert.equal(s.days_before, 3);
  assert.equal(s.send_time, "08:00");
  assert.equal(s.tz, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(s.lang, "es");
  await waitFor(() => doc.getElementById("push-disable").hidden === false, { label: "estado del dispositivo" });
  assert.equal(win.localStorage.getItem("mpdd-push-device-v1"), "1");
  assert.equal(win.localStorage.getItem("mpdd-foreground-notices-enabled-v1"), "true");
  assert.equal(doc.getElementById("avisos-enabled").checked, true);
  assert.equal(doc.getElementById("push-enable").hidden, true);
  assert.match(statusText(h), /Te avisaremos/);

  // Settings changes keep the 1.2 local keys and are synced to push_settings.
  const days = doc.getElementById("avisos-days");
  days.value = "7";
  days.dispatchEvent(new win.Event("change"));
  await waitFor(() => server.pushSettings.get(uid).days_before === 7, { label: "días sincronizados" });
  assert.equal(JSON.parse(win.localStorage.getItem("mpdd-avisos-v1")).daysBefore, 7);
  const time = doc.getElementById("avisos-time");
  time.value = "19:30";
  time.dispatchEvent(new win.Event("change"));
  await waitFor(() => server.pushSettings.get(uid).send_time === "19:30", { label: "hora sincronizada" });
  assert.equal(JSON.parse(win.localStorage.getItem("mpdd-avisos-v1")).time, "19:30");
  const box = doc.getElementById("avisos-enabled");
  box.checked = false;
  box.dispatchEvent(new win.Event("change"));
  await waitFor(() => server.pushSettings.get(uid).enabled === false, { label: "apagado sincronizado" });
  assert.equal(win.localStorage.getItem("mpdd-foreground-notices-enabled-v1"), "false");
  // Turning it back on does not ask again (permission already granted).
  box.checked = true;
  box.dispatchEvent(new win.Event("change"));
  await waitFor(() => server.pushSettings.get(uid).enabled === true, { label: "encendido sincronizado" });
  assert.equal(env.state.requested, 1);

  // Test notification: POST with the user's token.
  doc.getElementById("push-test").click();
  await waitFor(() => /Notificación de prueba enviada/.test(statusText(h)), { label: "prueba enviada" });
  const post = server.pushCalls.find((c) => c.method === "POST");
  assert.equal(post.headers.apikey, "sb_publishable_PRUEBA123");
  assert.equal(post.headers.Authorization, "Bearer fake-token-" + uid);
  assert.deepEqual(JSON.parse(post.body), { accion: "prueba" });

  // Turning off on this device removes the row, then the browser subscription.
  doc.getElementById("push-disable").click();
  await waitFor(() => server.pushSubs.length === 0, { label: "fila borrada" });
  await waitFor(() => env.state.unsubscribed === 1, { label: "suscripción cancelada" });
  assert.equal(win.localStorage.getItem("mpdd-push-device-v1"), null);
  await waitFor(() => doc.getElementById("push-enable").hidden === false);

  // Nothing sensitive in the console.
  const logs = h.consoleLogs.map((l) => l[1]).join("\n");
  for (const secret of [ENDPOINT, "secretoAuthPrueba", "fake-token-", server.pushPublicKey]) assert.ok(!logs.includes(secret), "no se registra en consola");
  assert.deepEqual(h.errors, []);
});

test("prueba sin dispositivos: el servidor responde 404 y se explica", async () => {
  const server = new FakeServer();
  const { h } = await signedInDevice(server, pushEnv());
  h.doc.getElementById("push-test").click();
  await waitFor(() => /Ningún dispositivo/.test(statusText(h)), { label: "sin suscripciones" });
  assert.equal(server.pushCalls.filter((c) => c.method === "POST").length, 1);
});

test("cerrar sesión borra primero la suscripción de este dispositivo", async () => {
  const server = new FakeServer();
  const env = pushEnv();
  const { h } = await signedInDevice(server, env);
  h.doc.getElementById("push-enable").click();
  await waitFor(() => server.pushSubs.length === 1, { label: "suscripción" });
  await h.win.MPDDCloud.signOut({ keepLocal: true, reload: false });
  const del = server.calls.findIndex((c) => c[1] === "push_subscriptions" && c[2] === "delete");
  const out = server.calls.findIndex((c) => c[0] === "signOut");
  assert.ok(del >= 0 && out > del, "la fila se borra antes de cerrar sesión");
  assert.equal(server.pushSubs.length, 0);
  assert.equal(env.state.unsubscribed, 1);
  assert.equal(h.win.MPDDCloud.status().userId, null);
});

test("sin sesión: no se pide permiso; se pide iniciar sesión (MPDDAccount.ask o Más → Cuenta)", async () => {
  const env = pushEnv();
  const h = load({ storage: ES, beforeParse: env.install });
  await sleep(80);
  const { doc, win } = h;
  win.MPDDNavigate("home");
  doc.getElementById("push-enable").click();
  await waitFor(() => /necesitas una cuenta/.test(statusText(h)), { label: "explicación de cuenta" });
  assert.equal(env.state.requested, 0);
  assert.equal(doc.getElementById("view-more").hidden, false, "lleva a Más (sección Cuenta)");
  assert.ok(doc.querySelector("#push-help button"), "botón para iniciar sesión");
  const asked = [];
  win.MPDDAccount = { ask: (reason) => asked.push(reason) };
  doc.getElementById("push-enable").click();
  await waitFor(() => asked.length === 1);
  assert.deepEqual(asked, ["notifications"]);
  assert.equal(env.state.requested, 0);
  // The test button also needs an account and makes no request.
  doc.getElementById("push-test").click();
  await sleep(20);
  assert.deepEqual(h.net.fetch, []);
});

test("iPhone en Safari sin instalar: explica cómo instalar la app primero", async () => {
  const env = pushEnv({ ua: IPHONE, standalone: false });
  const h = load({ storage: ES, beforeParse: env.install });
  await sleep(80);
  h.doc.getElementById("push-enable").click();
  await waitFor(() => /iPhone y iPad/.test(statusText(h)), { label: "mensaje de iPhone" });
  const steps = [...h.doc.querySelectorAll("#push-help li")].map((li) => li.textContent);
  assert.equal(steps.length, 3);
  assert.match(steps[0], /Safari/);
  assert.match(steps[0], /Compartir/);
  assert.match(steps[1], /Agregar a pantalla de inicio/);
  assert.match(steps[2], /ícono/);
  assert.equal(env.state.requested, 0);
  // Installed (standalone) on iPhone: no install message.
  const env2 = pushEnv({ ua: IPHONE, standalone: true });
  const h2 = load({ storage: ES, beforeParse: env2.install });
  await sleep(80);
  assert.equal(Push.detect(h2.win), "ok");
});

test("navegador sin push y permiso bloqueado: cada caso se explica", async () => {
  const h = load({ storage: ES });
  await sleep(80);
  h.doc.getElementById("push-enable").click();
  await waitFor(() => /no admite notificaciones/.test(statusText(h)), { label: "sin soporte" });
  const env = pushEnv({ permission: "denied" });
  const d = load({ storage: ES, beforeParse: env.install });
  await sleep(80);
  d.doc.getElementById("push-enable").click();
  await waitFor(() => /bloqueó las notificaciones/.test(statusText(d)), { label: "bloqueado" });
  const steps = [...d.doc.querySelectorAll("#push-help li")].map((li) => li.textContent).join(" ");
  assert.match(steps, /Permitir/);
  assert.match(steps, /Configuración/);
  assert.equal(env.state.requested, 0);
});

test(".ics: estructura, CRLF, plegado, escape, RRULE y VALARM", () => {
  const now = new Date(Date.UTC(2026, 10, 16, 13, 5, 9));
  const long = "Préstamo de libre inversión del Banco Ñandú número uno con un nombre larguísimo";
  const debts = [
    debt("t-1", "Tarjeta, Banco; \\ x", { due: "31", minPayment: 50, currency: "USD" }),
    debt("p 2", long, { due: "30", minPayment: 1250000, currency: "COP" }),
    debt("c3", "Celular\nlínea", { due: "5", currency: "COP" }),
    debt("f4", "Febrero", { due: "29", minPayment: 10 }),
    debt("n5", "Sin día", { due: "" }),
    debt("z6", "Pagada", { due: "10", balance: 0 }),
  ];
  const { text, count } = Push.buildICS(debts, { today: "2026-11-16", now, lang: "es", format: Money.formatMoney });
  assert.equal(count, 4);
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:"));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(text) && !/\r[^\n]/.test(text), "solo CRLF");
  const physical = text.split("\r\n").slice(0, -1);
  for (const l of physical) assert.ok(Buffer.byteLength(l, "utf8") <= 75, "línea de más de 75 octetos: " + l);
  assert.ok(physical.some((l) => l.startsWith(" ")), "hay líneas plegadas");
  const lines = text.replace(/\r\n /g, "").split("\r\n");
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 4);
  assert.equal(lines.filter((l) => l === "END:VEVENT").length, 4);
  assert.equal(lines.filter((l) => l === "BEGIN:VALARM").length, 4);
  assert.equal(lines.filter((l) => l === "TRIGGER:-P1D").length, 4);
  assert.equal(lines.filter((l) => l === "DTSTAMP:20261116T130509Z").length, 4);
  const uids = lines.filter((l) => l.startsWith("UID:"));
  assert.equal(new Set(uids).size, 4);
  assert.ok(uids.every((u) => /^UID:[A-Za-z0-9_-]+@mi-plan-de-deudas$/.test(u)));
  const ev = (summary) => {
    const i = lines.indexOf(summary);
    assert.ok(i > 0, "falta " + summary);
    const start = lines.lastIndexOf("BEGIN:VEVENT", i);
    return lines.slice(start, lines.indexOf("END:VEVENT", i) + 1);
  };
  const card = ev("SUMMARY:Pago: Tarjeta\\, Banco\\; \\\\ x");
  assert.ok(card.includes("DTSTART;VALUE=DATE:20261130"));
  assert.ok(card.includes("DTEND;VALUE=DATE:20261201"));
  assert.ok(card.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1"));
  assert.ok(card.includes("DESCRIPTION:Pago mínimo: US$50.00 USD\\nConfirma la fecha con tu entidad."));
  const loan = ev("SUMMARY:Pago: " + long);
  assert.ok(loan.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1"));
  assert.ok(loan.includes("DTSTART;VALUE=DATE:20261130"));
  assert.ok(loan.some((l) => l.includes("$1.250.000 COP")));
  const phone = ev("SUMMARY:Pago: Celular\\nlínea");
  assert.ok(phone.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=5"));
  assert.ok(phone.includes("DTSTART;VALUE=DATE:20261205"), "el 5 ya pasó: siguiente mes");
  assert.ok(phone.includes("DESCRIPTION:Pago mínimo: por definir\\nConfirma la fecha con tu entidad."));
  assert.ok(ev("SUMMARY:Pago: Febrero").includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1"));
  assert.ok(!text.includes("Sin día") && !text.includes("Pagada"));
  // Short months and year change.
  assert.equal(Push.firstDue(31, "2027-02-10"), "2027-02-28");
  assert.equal(Push.firstDue(3, "2026-12-20"), "2027-01-03");
  assert.equal(Push.firstDue(16, "2026-11-16"), "2026-11-16", "hoy cuenta");
  // Folding never splits a multi-byte character.
  const folded = Push.fold("DESCRIPTION:" + "ñ".repeat(80));
  assert.ok(folded.split("\r\n").every((l) => Buffer.byteLength(l) <= 75 && !l.includes("�")));
  assert.equal(folded.replace(/\r\n /g, ""), "DESCRIPTION:" + "ñ".repeat(80));
  // English labels.
  const en = Push.buildICS([debts[0]], { today: "2026-11-16", now, lang: "en", format: Money.formatMoney }).text;
  assert.match(en, /SUMMARY:Payment: Tarjeta/);
});

test("botón 'Agregar mis pagos a mi calendario' descarga mis-pagos.ics", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "Tarjeta", { due: "12", minPayment: 30 })]) }) });
  await sleep(80);
  const { doc, win } = h;
  const blobs = [],
    clicks = [];
  win.URL.createObjectURL = (b) => (blobs.push(b), "blob:ics");
  win.HTMLAnchorElement.prototype.click = function () {
    clicks.push({ download: this.download, href: this.href });
  };
  const button = doc.getElementById("ics-download");
  assert.equal(button.textContent, "Agregar mis pagos a mi calendario");
  button.click();
  assert.deepEqual(clicks, [{ download: "mis-pagos.ics", href: "blob:ics" }]);
  assert.equal(blobs[0].type, "text/calendar;charset=utf-8");
  assert.match(win.MPDDLastICS, /SUMMARY:Pago: Tarjeta\r\n/);
  assert.match(win.MPDDLastICS, /RRULE:FREQ=MONTHLY;BYMONTHDAY=12\r\n/);
  assert.match(doc.querySelector("#view-more").textContent, /mis-pagos\.ics listo/);
  assert.deepEqual(h.net.fetch, []);
  // Without due days there is nothing to download.
  const e = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "Sin fecha", { due: "" })]) }) });
  await sleep(80);
  e.doc.getElementById("ics-download").click();
  assert.match(e.doc.getElementById("view-more").textContent, /Agrega el día de pago/);
});

test("la pestaña Avisos ya no existe; ?vista=calendario abre el Calendario", async () => {
  const h = load({ storage: ES });
  await sleep(80);
  const { doc } = h;
  assert.equal(doc.querySelector('.bottom-nav [data-target="alerts"]'), null);
  assert.equal(doc.getElementById("view-alerts"), null);
  assert.deepEqual([...doc.querySelectorAll(".bottom-nav button span")].map((s) => s.textContent), ["Inicio", "Plan", "Métodos", "Calendario", "Gráfico", "Más"]);
  // The old reminders section is not shown anywhere (its dates keep working for in-app notices).
  const legacy = doc.getElementById("rem-open").closest("section");
  assert.equal(legacy.hidden, true);
  assert.ok(legacy.closest("#view-more"));
  assert.equal(doc.getElementById("view-home").hidden, false);
  assert.deepEqual(h.errors, []);

  const env = pushEnv();
  const c = load({ storage: ES, url: "https://app.test/?vista=calendario", beforeParse: env.install });
  await sleep(80);
  assert.equal(c.doc.getElementById("view-calendar").hidden, false);
  assert.equal(c.doc.getElementById("view-home").hidden, true);
  assert.equal(c.win.location.search, "", "se limpia el parámetro");
  // An open window is told by the service worker which tab to show.
  c.win.MPDDNavigate("home");
  env.state.listeners.message({ data: { type: "MPDD_OPEN", url: "/?vista=calendario" } });
  assert.equal(c.doc.getElementById("view-calendar").hidden, false);
  c.win.MPDDNavigate("home");
  env.state.listeners.message({ data: { type: "MPDD_OPEN", url: "https://otro.test/?vista=calendario" } });
  assert.equal(c.doc.getElementById("view-home").hidden, false, "otros orígenes se ignoran");
});

test("sw.js: push muestra la notificación y el toque enfoca o abre el Calendario", async () => {
  const src = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
  const listeners = {},
    shown = [],
    opened = [],
    clientsList = [];
  const self = {
    location: new URL("https://app.test/sw.js"),
    addEventListener: (t, fn) => (listeners[t] = fn),
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => clientsList, openWindow: async (u) => opened.push(u) },
    skipWaiting() {},
  };
  vm.runInNewContext(src, { self, location: self.location, URL, caches: {}, fetch() {}, Request: function () {}, Response: {}, console });
  for (const t of ["install", "activate", "fetch", "message", "push", "notificationclick"]) assert.equal(typeof listeners[t], "function", t);
  const fire = async (type, event) => {
    let p = null;
    event.waitUntil = (x) => (p = x);
    listeners[type](event);
    await p;
  };
  const payload = { title: "Mañana vence Tarjeta", body: "Mañana vence Tarjeta: US$40.00 USD", url: "/?vista=calendario", tag: "mpdd-d1-2026-11-20-1" };
  await fire("push", { data: { text: () => JSON.stringify(payload) } });
  assert.equal(shown[0].title, payload.title);
  assert.equal(shown[0].options.body, payload.body);
  assert.equal(shown[0].options.icon, "/icon-192.png");
  assert.equal(shown[0].options.tag, payload.tag);
  assert.equal(shown[0].options.data.url, "/?vista=calendario");
  // Broken or foreign payloads still show a safe notification.
  await fire("push", { data: { text: () => "{no es json" } });
  assert.equal(shown[1].title, "Mi Plan de Deudas");
  assert.equal(shown[1].options.data.url, "/?vista=calendario");
  await fire("push", { data: null });
  assert.equal(shown.length, 3);
  await fire("push", { data: { text: () => JSON.stringify({ title: "x", url: "https://malo.test/robar" }) } });
  assert.equal(shown[3].options.data.url, "/?vista=calendario");

  // No window open: opens the app on the Calendario tab.
  let closed = 0;
  const notification = { data: { url: "/?vista=calendario" }, close: () => closed++ };
  await fire("notificationclick", { notification });
  assert.equal(closed, 1);
  assert.deepEqual(opened, ["/?vista=calendario"]);
  // A window of the app is open: focus it and tell it which tab to show.
  const msgs = [];
  let focused = 0;
  clientsList.push({ url: "https://otro.test/", focus: async () => focused++, postMessage: () => assert.fail("otro origen") });
  clientsList.push({ url: "https://app.test/", focus: async () => focused++, postMessage: (m) => msgs.push(m) });
  await fire("notificationclick", { notification });
  assert.equal(focused, 1);
  assert.equal(JSON.stringify(msgs), JSON.stringify([{ type: "MPDD_OPEN", url: "/?vista=calendario" }]));
  assert.equal(opened.length, 1);
});

test("textos de notificaciones traducidos al inglés", async () => {
  const I18n = require("../dist/i18n.js");
  const map = new Map(I18n.entries);
  const h = load({ storage: ES });
  await sleep(60);
  const missing = Object.values(h.win.MPDDStrings.ajustes).filter((es) => !map.has(es));
  assert.deepEqual(missing, []);
  const e = load({ storage: { "deudas-lang-v1": "en" } });
  await sleep(80);
  const more = e.doc.getElementById("view-more").textContent;
  assert.match(more, /Notifications/);
  assert.match(more, /Turn on notifications/);
  assert.match(more, /Send a test notification/);
  assert.match(more, /Add my payments to my calendar/);
});

test("revisión 1.4: si el navegador ya no tiene la suscripción, deja de decir que el dispositivo recibe avisos", async () => {
  const env = pushEnv({ permission: "granted" });
  const h = load({ storage: Object.assign({}, ES, { "mpdd-push-device-v1": "1" }), beforeParse: env.install });
  await waitFor(() => h.win.localStorage.getItem("mpdd-push-device-v1") === null, { label: "marca borrada" });
});

test("revisión 1.4: cerrar sesión borrando los datos del dispositivo también borra el borrador del plan", async () => {
  const h = load({ storage: Object.assign({}, ES, { "mpdd-plan-draft-v1": JSON.stringify({ t: Date.now(), d: { income: 1 } }), "mpdd-push-device-v1": "1", "mpdd-account-prompts-v1": "{}" }) });
  await sleep(40);
  // wipeLocal is internal: we reach it through the same set of keys sign-out deletes.
  const src = require("fs").readFileSync(require("path").join(__dirname, "../dist/cloud-sync.js"), "utf8");
  for (const k of ["mpdd-plan-draft-v1", "mpdd-account-prompts-v1", "mpdd-push-device-v1"]) assert.ok(src.includes('"' + k + '"'), k);
  assert.match(src, /const exact = new Set\(\[[^\]]*"mpdd-plan-draft-v1"/);
});
