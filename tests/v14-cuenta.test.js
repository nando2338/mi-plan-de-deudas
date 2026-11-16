/* Pruebas de la versión 1.4 (Cuenta): ícono de cuenta en el encabezado, tarjeta en Inicio,
   MPDDAccount.ask(reason) y subida automática sin duplicados.
   Ejecutar: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, closeAll, waitFor, sleep, debt, session, addDebtViaForm } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const PROMPTS = "mpdd-account-prompts-v1";
const DAY = 24 * 60 * 60 * 1000;
const $ = (h, sel) => h.doc.querySelector(sel);
const buttons = (h, sel) => [...h.doc.querySelectorAll(sel + " button")];
const byText = (h, sel, text) => buttons(h, sel).find((b) => b.textContent === text);
const authOpen = (h) => h.doc.getElementById("account-auth-dialog").hasAttribute("open");
const signedInStorage = (email, uid, extra = {}) => Object.assign({}, ES, extra, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session(email, uid) });

async function linked(server, email, uid, extra = {}) {
  const h = load({ config: "test", server, storage: signedInStorage(email, uid, extra) });
  await waitFor(() => ["synced", "needsChoice"].includes(h.win.MPDDCloud.status().state), { label: "sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") {
    await h.win.MPDDCloud.resolveLink("merge");
    await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "vinculación" });
  }
  return h;
}

/* ---------------- 1. header icon ---------------- */

test("sin configuración de nube: no hay ícono, ni tarjeta, ni pregunta", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  assert.deepEqual(h.errors, []);
  assert.equal($(h, ".account-header").hidden, true);
  assert.equal($(h, "#account-home-card").hidden, true);
  assert.equal(h.win.MPDDAccount.ask("plan"), false);
  assert.equal($(h, "dialog[open]"), null);
  assert.deepEqual(Object.keys(Object.fromEntries(Object.entries(h.win.localStorage))), ["deudas-lang-v1"]);
});

test("ícono sin sesión: botón 'Entrar' en el encabezado de todas las pestañas, junto al idioma", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: ES });
  await sleep(60);
  const box = $(h, "header .top .account-header");
  assert.ok(box, "está en la barra superior");
  assert.equal(box.hidden, false);
  const top = $(h, "header .top");
  assert.ok($(h, ".top .language-control"), "el selector de idioma sigue ahí");
  assert.ok(!box.contains($(h, ".language-control")) && !$(h, ".language-control").contains(box), "no se superponen: son elementos distintos");
  assert.equal([...top.children].indexOf(box), top.children.length - 1, "va al final (a la derecha) de la barra");
  const enter = box.querySelector(".account-enter");
  assert.equal(enter.textContent, "Entrar");
  assert.equal(enter.hidden, false);
  assert.equal(box.querySelector(".account-avatar").hidden, true);
  for (const tab of ["home", "plan", "methods", "calendar", "chart", "more"]) {
    h.win.MPDDNavigate(tab);
    assert.equal(box.hidden, false, "visible en " + tab);
    assert.equal(box.closest(".app-view"), null, "fuera de las vistas, en el encabezado");
  }
  // Opens the sign-in / create-account dialog without loading Supabase.
  enter.click();
  assert.ok(authOpen(h));
  assert.ok(h.doc.getElementById("acc-login-email"));
  assert.ok(byText(h, "#account-auth-dialog", "Crear cuenta"), "pestaña para crear cuenta");
  assert.equal(h.net.createClient, 0);
  h.doc.getElementById("acc-login-password").value = "secreta123";
  byText(h, "#account-auth-dialog .modalbuttons", "Cerrar").click();
  assert.equal(authOpen(h), false, "se puede cerrar");
  assert.equal(h.doc.getElementById("acc-login-password"), null, "la contraseña escrita no queda en la página");
  // Más without a session: a short line and the "Entrar" button, no forms.
  const root = h.doc.getElementById("account-root");
  assert.equal(root.querySelector("form"), null);
  byText(h, "#account-root", "Entrar").click();
  assert.ok(authOpen(h));
  // English.
  h.doc.getElementById("language-choice").value = "en";
  h.doc.getElementById("language-choice").dispatchEvent(new h.win.Event("change"));
  await sleep(20);
  assert.equal(enter.textContent, "Sign in now");
  assert.match(h.doc.getElementById("account-auth-title").textContent, /Sign in to your account/);
});

test("ícono con sesión: inicial del correo y menú accesible (Escape, clic afuera, Mi cuenta, Cerrar sesión)", async () => {
  const server = new FakeServer();
  const uid = server.addUser("ana@ejemplo.test", "x12345678");
  const h = await linked(server, "ana@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  const box = $(h, ".account-header");
  const avatar = box.querySelector(".account-avatar");
  const menu = h.doc.getElementById("account-menu");
  assert.equal(box.hidden, false);
  assert.equal(box.querySelector(".account-enter").hidden, true);
  assert.equal(avatar.hidden, false);
  assert.equal(avatar.querySelector(".account-initial").textContent, "A");
  assert.equal(avatar.querySelector(".account-initial").getAttribute("data-localized-output"), "true");
  assert.equal(avatar.getAttribute("aria-expanded"), "false");
  assert.equal(avatar.getAttribute("aria-controls"), "account-menu");
  assert.ok(avatar.textContent.includes("Menú de cuenta"), "nombre accesible");
  assert.equal(menu.hidden, true);
  assert.equal($(h, "#account-home-card").hidden, true, "sin tarjeta en Inicio con sesión");
  // Open / Escape.
  avatar.click();
  assert.equal(menu.hidden, false);
  assert.equal(avatar.getAttribute("aria-expanded"), "true");
  assert.match(menu.textContent, /ana@ejemplo\.test/);
  assert.equal(menu.querySelector(".account-menu-email span").getAttribute("data-localized-output"), "true");
  h.doc.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(menu.hidden, true);
  assert.equal(avatar.getAttribute("aria-expanded"), "false");
  assert.equal(h.doc.activeElement, avatar, "el foco vuelve al botón");
  // Outside click.
  avatar.click();
  assert.equal(menu.hidden, false);
  menu.querySelector(".account-menu-email").click();
  assert.equal(menu.hidden, false, "un clic dentro no lo cierra");
  h.doc.querySelector("main").click();
  assert.equal(menu.hidden, true);
  // "Mi cuenta" -> Más → Cuenta.
  avatar.click();
  byText(h, "#account-menu", "Mi cuenta").click();
  assert.equal(menu.hidden, true);
  assert.equal(h.doc.getElementById("view-more").hidden, false);
  // Más keeps only account settings (no sign-in form).
  const root = h.doc.getElementById("account-root");
  assert.equal(root.querySelector("#acc-login-email"), null);
  for (const t of ["Cambiar contraseña", "Cerrar sesión", "Eliminar mi cuenta y mis datos"]) assert.ok(byText(h, "#account-root", t), t);
  // Change password.
  byText(h, "#account-root", "Cambiar contraseña").click();
  h.doc.getElementById("acc-change-password").value = "nueva12345";
  h.doc.getElementById("acc-change-password2").value = "nueva12345";
  h.doc.querySelector("#account-dialog form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await waitFor(() => /Contraseña actualizada/.test(root.textContent), { label: "contraseña" });
  assert.ok(server.calls.some((c) => c[0] === "updateUser"));
  assert.equal(h.doc.getElementById("account-dialog").hasAttribute("open"), false);
  // "Cerrar sesión" from the menu uses the existing flow (keep data on this device).
  avatar.click();
  byText(h, "#account-menu", "Cerrar sesión").click();
  const dlg = h.doc.getElementById("account-dialog");
  assert.match(dlg.textContent, /Qué hacemos con la copia/);
  byText(h, "#account-dialog", "Conservar en este dispositivo").click();
  await waitFor(() => h.win.MPDDCloud.status().state === "signedOut");
  assert.equal(h.debts().length, 1, "datos conservados");
  assert.equal(avatar.hidden, true);
  assert.equal(box.querySelector(".account-enter").hidden, false);
  assert.ok(!h.consoleLogs.some(([, m]) => /ana@ejemplo|fake-token|Uno/.test(m)), "sin correos, tokens ni datos en la consola");
});

/* ---------------- 2. Inicio card ---------------- */

test("tarjeta en Inicio sin sesión: 'Crear cuenta' abre el registro y 'Ahora no' la oculta 7 días", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: ES });
  await sleep(60);
  const card = $(h, "#account-home-card");
  assert.ok(card.closest("#view-home"), "está en Inicio");
  assert.equal(card.hidden, false);
  assert.match(card.textContent, /Crea tu cuenta gratis para no perder tus deudas si cambias de teléfono/);
  byText(h, "#account-home-card", "Crear cuenta").click();
  assert.ok(authOpen(h));
  assert.ok(h.doc.getElementById("acc-signup-email"), "abre en 'Crear cuenta'");
  byText(h, "#account-auth-dialog .modalbuttons", "Cerrar").click();
  byText(h, "#account-home-card", "Ahora no").click();
  assert.equal(card.hidden, true);
  const at = JSON.parse(h.win.localStorage.getItem(PROMPTS)).homeCard;
  assert.ok(Math.abs(at - Date.now()) < 5000);
  assert.equal(h.net.createClient, 0);
  await h.close();

  // Still hidden 6 days later, back after 7.
  const h2 = load({ config: "test", server, storage: Object.assign({}, ES, { [PROMPTS]: JSON.stringify({ homeCard: Date.now() - 6 * DAY }) }) });
  await sleep(60);
  assert.equal(h2.doc.getElementById("account-home-card").hidden, true, "oculta antes de 7 días");
  await h2.close();
  const h3 = load({ config: "test", server, storage: Object.assign({}, ES, { [PROMPTS]: JSON.stringify({ homeCard: Date.now() - 7 * DAY - 1000 }) }) });
  await sleep(60);
  assert.equal(h3.doc.getElementById("account-home-card").hidden, false, "reaparece después de 7 días");
  // English.
  h3.doc.getElementById("language-choice").value = "en";
  h3.doc.getElementById("language-choice").dispatchEvent(new h3.win.Event("change"));
  await sleep(20);
  assert.match(h3.doc.getElementById("account-home-card").textContent, /Create your free account so you don't lose your debts if you change phones/);
  assert.ok(byText(h3, "#account-home-card", "Not now"));
});

test("tarjeta en Inicio: con una recuperación pendiente 'Ahora no' oculta sin escribir en el almacenamiento", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-restore-journal-v1": "{}" }) });
  await sleep(60);
  const card = $(h, "#account-home-card");
  if (!card.hidden) byText(h, "#account-home-card", "Ahora no").click();
  assert.equal(card.hidden, true);
  assert.equal(h.win.localStorage.getItem(PROMPTS), null, "respeta el diario de restauración");
});

/* ---------------- 3. MPDDAccount.ask ---------------- */

test("MPDDAccount.ask: mensaje según el motivo, se puede cerrar, y nunca con sesión", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: ES });
  await sleep(60);
  const msgs = {
    plan: "Crea tu cuenta para guardar tu plan",
    notifications: "Crea tu cuenta para recibir avisos en todos tus dispositivos",
    thirdDebt: "Ya tienes 3 deudas. Crea tu cuenta gratis para no perderlas",
  };
  for (const [reason, text] of Object.entries(msgs)) {
    assert.equal(h.win.MPDDAccount.ask(reason), true, reason);
    assert.ok(authOpen(h));
    assert.equal(h.doc.getElementById("account-auth-title").textContent, text);
    assert.ok(h.doc.getElementById("acc-signup-email"), "abre en crear cuenta");
    assert.ok(byText(h, "#account-auth-dialog", "Iniciar sesión"), "y permite iniciar sesión");
    byText(h, "#account-auth-dialog .modalbuttons", "Cerrar").click();
    assert.equal(authOpen(h), false);
  }
  assert.equal(h.win.MPDDAccount.ask("otra cosa"), false);
  assert.equal(authOpen(h), false);
  await h.close();

  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const s = await linked(server, "a@ejemplo.test", uid);
  for (const reason of Object.keys(msgs)) assert.equal(s.win.MPDDAccount.ask(reason), false);
  assert.equal(s.doc.getElementById("account-auth-dialog").hasAttribute("open"), false);
});

test("al iniciar sesión desde el diálogo, este se cierra solo", async () => {
  const server = new FakeServer();
  server.addUser("a@ejemplo.test", "x12345678");
  const h = load({ config: "test", server, storage: ES });
  await sleep(60);
  h.win.MPDDAccount.ask("notifications");
  byText(h, "#account-auth-dialog", "Iniciar sesión").click();
  h.doc.getElementById("acc-login-email").value = "a@ejemplo.test";
  h.doc.getElementById("acc-login-password").value = "x12345678";
  h.doc.querySelector("#account-auth-dialog form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "sesión" });
  assert.equal(authOpen(h), false);
  assert.equal($(h, ".account-avatar").hidden, false);
});

test("tercera deuda sin sesión: pide la cuenta una vez y no vuelve a pedirla durante 7 días", async () => {
  const server = new FakeServer();
  const two = JSON.stringify([debt("a", "Uno"), debt("b", "Dos")]);
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": two }) });
  await sleep(60);
  await addDebtViaForm(h, "Tres");
  await waitFor(() => authOpen(h), { label: "pregunta" });
  assert.equal(h.debts().length, 3, "la deuda se guardó");
  assert.equal(h.doc.getElementById("dialog").hasAttribute("open"), false, "después de cerrar el formulario de la deuda");
  assert.equal(h.doc.getElementById("account-auth-title").textContent, "Ya tienes 3 deudas. Crea tu cuenta gratis para no perderlas");
  byText(h, "#account-auth-dialog .modalbuttons", "Cerrar").click();
  assert.ok(JSON.parse(h.win.localStorage.getItem(PROMPTS)).thirdDebt > 0);
  await addDebtViaForm(h, "Cuatro");
  await sleep(80);
  assert.equal(h.debts().length, 4);
  assert.equal(authOpen(h), false, "no vuelve a preguntar");
  assert.equal(h.net.createClient, 0, "sin red");
  await h.close();

  // 8 days later the next new debt asks again; within 7 days it does not.
  const recent = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": two, [PROMPTS]: JSON.stringify({ thirdDebt: Date.now() - 5 * DAY }) }) });
  await sleep(60);
  await addDebtViaForm(recent, "Tres");
  await sleep(80);
  assert.equal(recent.doc.getElementById("account-auth-dialog").hasAttribute("open"), false);
  await recent.close();
  const later = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": two, [PROMPTS]: JSON.stringify({ thirdDebt: Date.now() - 8 * DAY }) }) });
  await sleep(60);
  await addDebtViaForm(later, "Tres");
  await waitFor(() => later.doc.getElementById("account-auth-dialog").hasAttribute("open"), { label: "pregunta otra vez" });
});

test("tercera deuda: no pregunta con la 1.ª o 2.ª deuda, ni con sesión", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: ES });
  await sleep(60);
  await addDebtViaForm(h, "Uno");
  await sleep(40);
  await addDebtViaForm(h, "Dos");
  await sleep(60);
  assert.equal(authOpen(h), false);
  await h.close();

  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const s = await linked(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("a", "Uno"), debt("b", "Dos")]) });
  await addDebtViaForm(s, "Tres");
  await sleep(100);
  assert.equal(s.debts().length, 3);
  assert.equal(s.doc.getElementById("account-auth-dialog").hasAttribute("open"), false);
  assert.equal(s.win.localStorage.getItem(PROMPTS), null);
});

/* ---------------- 4. automatic upload, no duplicates ---------------- */

test("cuenta nueva con deudas en el dispositivo: sube sola, sin pregunta y sin duplicados", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const local = [debt("d1", "Tarjeta", { history: [{ amount: 10, date: "2026-11-01" }] }), debt("d2", "Préstamo"), debt("d3", "Moto")];
  // Same as opening the confirmation link after "Crear cuenta": a fresh session on this device.
  const a = load({ config: "test", server, storage: signedInStorage("a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify(local) }) });
  const seen = [];
  a.win.MPDDCloud.onChange((s) => seen.push(s.state));
  await waitFor(() => a.win.MPDDCloud.status().state === "synced" && server.rowsFor(uid).length === 3, { label: "subida automática" });
  assert.ok(!seen.includes("needsChoice"), "no pregunta");
  assert.equal(a.doc.querySelector("dialog[open]"), null);
  assert.equal(a.win.MPDDCloud.status().pending, 0);
  assert.deepEqual(a.debts(), local, "los datos locales no cambian");
  assert.ok(a.win.MPDDCloud.preBackups().length >= 1, "igual se guarda una copia previa");
  assert.equal(server.rowsFor(uid).find((r) => r.id === "d1").payments.length, 1);

  // Running the sync again does not send or create anything new.
  const pushesBefore = server.calls.filter((c) => c[0] === "rpc" && c[1] === "mpdd_push").length;
  await a.win.MPDDCloud.syncNow();
  await a.win.MPDDCloud.syncNow();
  assert.equal(server.rowsFor(uid).length, 3);
  assert.equal(server.calls.filter((c) => c[0] === "rpc" && c[1] === "mpdd_push").length, pushesBefore, "sin envíos repetidos");

  // Sign out keeping the data, then sign in again: still 3.
  await a.win.MPDDCloud.signOut({ keepLocal: true });
  const kept = Object.fromEntries(Object.entries(a.win.localStorage));
  assert.ok(kept["mpdd-cloud-state-v1"], "el estado de sincronización se conserva");
  await a.close();
  const again = load({ config: "test", server, storage: Object.assign({}, kept, signedInStorage("a@ejemplo.test", uid)) });
  await waitFor(() => ["synced", "needsChoice"].includes(again.win.MPDDCloud.status().state), { label: "otra vez" });
  if (again.win.MPDDCloud.status().state === "needsChoice") await again.win.MPDDCloud.resolveLink("merge");
  await waitFor(() => again.win.MPDDCloud.status().state === "synced");
  assert.equal(server.rowsFor(uid).length, 3);
  assert.equal(again.debts().length, 3);
  await again.close();

  // Second device with the same debts (same ids, e.g. from a backup): the existing choice stays, merge keeps 3.
  const b = load({ config: "test", server, storage: signedInStorage("a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify(local) }) });
  await waitFor(() => b.win.MPDDCloud.status().state === "needsChoice", { label: "elección en B" });
  assert.equal(b.win.MPDDCloud.status().choice.kind, "both");
  await b.win.MPDDCloud.resolveLink("merge");
  await waitFor(() => b.win.MPDDCloud.status().state === "synced");
  assert.equal(server.rowsFor(uid).length, 3, "sin duplicados en la nube");
  assert.deepEqual(b.debts().map((d) => d.id).sort(), ["d1", "d2", "d3"], "sin duplicados en el dispositivo");
});

test("subida automática: datos usados antes con OTRA cuenta siguen preguntando", async () => {
  const server = new FakeServer();
  const uid = server.addUser("b@ejemplo.test", "x12345678");
  const state = JSON.stringify({ userId: "otra-cuenta", linkedAt: new Date().toISOString(), debts: {}, settings: {} });
  const h = load({ config: "test", server, storage: signedInStorage("b@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("x1", "Ajena")]), "mpdd-cloud-state-v1": state }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "needsChoice", { label: "pregunta" });
  const c = h.win.MPDDCloud.status().choice;
  assert.equal(c.kind, "upload");
  assert.equal(c.otherUser, true);
  assert.equal(server.rowsFor(uid).length, 0, "no sube nada sin permiso");
  assert.match(h.doc.getElementById("account-dialog").textContent, /otra cuenta/);
});
