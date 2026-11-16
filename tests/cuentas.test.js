/* Pruebas de cuentas opcionales y sincronización (DOM simulado con jsdom).
   Ejecutar: cd tests && npm install && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, closeAll, waitFor, sleep, debt, session, addDebtViaForm } = require("./harness");
test.afterEach(closeAll);
const { FakeServer } = require("./fake-supabase");

const ES = { "deudas-lang-v1": "es" };
const keysOf = (win) => Object.keys(Object.fromEntries(Object.entries(win.localStorage)));
const cloudState = (h) => JSON.parse(h.win.localStorage.getItem("mpdd-cloud-state-v1") || "null");

/* Signed-in device already linked to the account (no first-login question). */
async function linkedDevice(server, email, uid, storage = {}) {
  const h = load({ config: "test", server, storage: Object.assign({}, ES, storage, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session(email, uid) }) });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "inicio de sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") {
    await h.win.MPDDCloud.resolveLink("merge");
    await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "vinculación" });
  }
  return h;
}

test("sin configuración: la app funciona igual, sin red y sin claves nuevas", async () => {
  const h = load({ storage: ES });
  await sleep(100);
  assert.deepEqual(h.errors, []);
  assert.equal(h.win.MPDDCloud.status().state, "disabled");
  assert.equal(h.doc.getElementById("data-status").textContent.replace(/\s+/g, " "), "● DATOS EN ESTE DISPOSITIVO");
  await addDebtViaForm(h, "Tarjeta");
  await sleep(50);
  assert.equal(h.debts().length, 1);
  assert.deepEqual(keysOf(h.win).sort(), ["deudas-lang-v1", "nando-deudas-v1"]);
  assert.deepEqual(h.net, { fetch: [], xhr: [], scripts: [], createClient: 0, beacons: [] });
  // Backup + restore still work with the account module present.
  h.doc.getElementById("export").click();
  await sleep(20);
  assert.match(h.doc.getElementById("backup-panel").textContent, /Respaldo preparado/);
  h.close();
});

test("configurada pero sin sesión: ninguna solicitud de red ni carga de supabase-js", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: ES });
  await sleep(100);
  assert.equal(h.win.MPDDCloud.status().state, "signedOut");
  await addDebtViaForm(h, "Préstamo");
  await sleep(3300); // includes one change-detection interval
  assert.equal(h.debts().length, 1);
  assert.equal(h.net.createClient, 0, "no se creó cliente");
  assert.deepEqual(h.net.scripts, []);
  assert.deepEqual(h.net.fetch, []);
  assert.equal(server.calls.length, 0);
  assert.ok(!keysOf(h.win).some((k) => k.startsWith("mpdd-cloud") || k.startsWith("sb-")));
  // Optional sign-in behind the header icon, without blocking the app.
  assert.equal(h.doc.querySelector("dialog[open]"), null);
  h.doc.querySelector(".account-header .account-enter").click();
  assert.ok(h.doc.getElementById("acc-login-email"));
  assert.equal(h.net.createClient, 0, "abrir el formulario no carga Supabase");
  h.close();
});

test("sin internet al abrir con sesión: la app sigue local y no rompe", async () => {
  const server = new FakeServer();
  server.offline = true;
  const uid = server.addUser("a@ejemplo.test", "contraseña1");
  const h = load({ config: "test", server, online: false, storage: Object.assign({}, ES, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await sleep(200);
  await addDebtViaForm(h, "Sin red");
  await sleep(50);
  assert.equal(h.debts().length, 1);
  assert.deepEqual(h.errors, []);
  h.close();
});

test("subida inicial: con la nube vacía sube automáticamente las deudas locales con sus pagos", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "contraseña1");
  const local = [debt("d1", "Tarjeta A", { history: [{ amount: 50, date: "2026-10-01" }] }), debt("d2", "Préstamo", { currency: "COP", balance: 1000000, initial: 1500000, due: "" })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(local), "deudas-budget-v1": JSON.stringify({ income: 10, essential: 1, fixed: 1, variable: 1, minimums: 1, extra: 1 }) }) });
  await sleep(50);
  // Sign in through the UI (header "Entrar" -> dialog).
  h.doc.querySelector(".account-header .account-enter").click();
  h.doc.getElementById("acc-login-email").value = "a@ejemplo.test";
  h.doc.getElementById("acc-login-password").value = "contraseña1";
  h.doc.querySelector("#account-auth-dialog form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  // 1.4: empty cloud -> no "needsChoice" question, the upload starts by itself.
  await waitFor(() => h.win.MPDDCloud.status().state === "synced" && server.rowsFor(uid).length === 2, { label: "subida" });
  assert.equal(h.doc.querySelector("dialog[open]"), null, "sin preguntas ni diálogos abiertos");
  const rows = server.rowsFor(uid);
  assert.equal(rows.find((r) => r.id === "d1").payments.length, 1);
  assert.equal(rows.find((r) => r.id === "d1").due, 15);
  assert.equal(rows.find((r) => r.id === "d2").due, null);
  assert.ok(server.settings.get(uid)["deudas-budget-v1"]);
  assert.equal(h.win.MPDDCloud.status().pending, 0);
  assert.deepEqual(h.debts(), local, "los datos locales no cambian al subir");
  assert.match(h.doc.getElementById("data-status").textContent, /SINCRONIZADO/);
  assert.ok(h.win.MPDDCloud.preBackups().length >= 1, "copia previa guardada");
  // No financial data or tokens in console output.
  assert.ok(!h.consoleLogs.some(([, m]) => /Tarjeta|fake-token|contraseña/.test(m)));
  h.close();
});

test("primer inicio con datos en ambos lados: muestra conteos y 'usar la nube' respalda antes de reemplazar", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  server.push(uid, [{ id: "c1", name: "En la nube", balance: 5, initial: 5, currency: "USD", payments: [], updated_at: new Date().toISOString() }], {});
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("l1", "Local 1"), debt("l2", "Local 2")]), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "needsChoice", { label: "elección" });
  const c = h.win.MPDDCloud.status().choice;
  assert.equal(c.kind, "both");
  assert.equal(c.localDebts, 2);
  assert.equal(c.remoteDebts, 1);
  const dlg = h.doc.getElementById("account-dialog");
  assert.match(dlg.textContent, /Combinar/);
  assert.match(dlg.textContent, /Usar la nube/);
  assert.match(dlg.textContent, /Usar lo de este dispositivo/);
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Usar la nube").click();
  await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "usar nube" });
  assert.deepEqual(h.debts().map((d) => d.id), ["c1"]);
  const pre = h.win.MPDDCloud.preBackups()[0];
  assert.match(pre.local, /Local 1/, "la copia previa conserva lo local");
  assert.ok(keysOf(h.win).some((k) => k.startsWith("nando-deudas-recovery-v1:")), "copia anterior de la app");
  h.close();
});

test("primer inicio: 'usar lo de este dispositivo' deja la nube igual al dispositivo", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  server.push(uid, [{ id: "c1", name: "Vieja nube", balance: 5, initial: 5, currency: "USD", payments: [], updated_at: new Date().toISOString() }], {});
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("l1", "Local 1")]), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "needsChoice");
  await h.win.MPDDCloud.resolveLink("local");
  await waitFor(() => h.win.MPDDCloud.status().state === "synced");
  const alive = server.pull(uid).debts.filter((d) => !d.deleted);
  assert.deepEqual(alive.map((d) => d.id), ["l1"]);
  assert.match(h.win.MPDDCloud.preBackups()[0].cloud, /Vieja nube/, "lo de la nube quedó en copia local");
  h.close();
});

test("cambios locales se envían, y un segundo dispositivo los descarga al abrir", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid);
  await addDebtViaForm(a, "Nueva en A", "75");
  await waitFor(() => server.rowsFor(uid).length === 1 && a.win.MPDDCloud.status().pending === 0, { label: "envío" });
  const b = await linkedDevice(server, "a@ejemplo.test", uid);
  await waitFor(() => b.debts().length === 1, { label: "descarga en B" });
  assert.equal(b.debts()[0].name, "Nueva en A");
  assert.equal(b.doc.querySelector("#cards h3").textContent, "Nueva en A", "la lista visible se actualiza");
  // Delete on B -> tombstone -> A removes it and tells the user.
  b.doc.querySelector("[data-delete]").click();
  b.doc.querySelector("[data-confirm-delete]").click();
  await waitFor(() => server.pull(uid).debts[0].deleted, { label: "lápida" });
  assert.equal(server.pull(uid).debts[0].name, "eliminada", "la lápida no conserva datos");
  await a.win.MPDDCloud.syncNow();
  await waitFor(() => a.debts().length === 0, { label: "borrado en A" });
  assert.match(a.doc.getElementById("sync-notices").textContent, /borraste en otro dispositivo/);
  assert.match(a.doc.getElementById("sync-notices").textContent, /Nueva en A/);
  a.close();
  b.close();
});

test("conflicto: gana la versión más reciente y se avisa al usuario", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Compartida")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const b = await linkedDevice(server, "a@ejemplo.test", uid);
  await waitFor(() => b.debts().length === 1);
  // Both go offline and edit the same debt; B edits later.
  a.setOnline(false);
  b.setOnline(false);
  server.offline = true;
  const edit = async (h, balance) => {
    h.doc.querySelector("[data-edit]").click();
    h.doc.getElementById("balance").value = String(balance);
    h.doc.getElementById("form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
    await sleep(30);
  };
  await edit(a, 90);
  await waitFor(() => a.win.MPDDCloud.status().pending === 1, { label: "pendiente en A" });
  await sleep(20);
  await edit(b, 80);
  await waitFor(() => b.win.MPDDCloud.status().pending === 1, { label: "pendiente en B" });
  assert.equal(a.win.MPDDCloud.status().state, "offline");
  assert.match(a.doc.getElementById("data-status").textContent, /SIN CONEXIÓN/);
  server.offline = false;
  // A reconnects first and uploads its (older) edit.
  a.setOnline(true);
  await waitFor(() => a.win.MPDDCloud.status().state === "synced" && server.rowsFor(uid)[0].balance === 90, { label: "A sube" });
  // B reconnects: both changed, B's edit is newer -> B wins and notifies.
  b.setOnline(true);
  await waitFor(() => b.win.MPDDCloud.status().state === "synced" && server.rowsFor(uid)[0].balance === 80, { label: "B gana" });
  assert.match(b.doc.getElementById("sync-notices").textContent, /se conservó la versión más reciente de este dispositivo/);
  // A downloads B's version (A has no new local change, so no conflict).
  await a.win.MPDDCloud.syncNow();
  await waitFor(() => a.debts()[0].balance === 80, { label: "A recibe" });
  a.close();
  b.close();
});

test("conflicto inverso: la nube es más reciente, se reemplaza lo local con copia previa y aviso", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Compartida")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  a.setOnline(false);
  server.offline = true;
  a.doc.querySelector("[data-edit]").click();
  a.doc.getElementById("balance").value = "55";
  a.doc.getElementById("form").dispatchEvent(new a.win.Event("submit", { cancelable: true }));
  await waitFor(() => a.win.MPDDCloud.status().pending === 1);
  await sleep(20);
  // Another device writes a newer version while A is offline.
  server.offline = false;
  const row = server.pull(uid).debts[0];
  server.push(uid, [{ ...row, balance: 33, base: row.updated_at, updated_at: new Date().toISOString() }], {});
  a.setOnline(true);
  await waitFor(() => a.debts()[0].balance === 33, { label: "gana la nube" });
  assert.match(a.doc.getElementById("sync-notices").textContent, /versión más reciente de tu cuenta/);
  const copies = keysOf(a.win).filter((k) => k.startsWith("nando-deudas-recovery-v1:")).map((k) => a.win.localStorage.getItem(k));
  assert.ok(copies.some((c) => /"balance":55/.test(c)), "la versión local sobrescrita quedó en una copia anterior");
  a.close();
});

test("no se aplican cambios de la nube mientras hay un formulario abierto", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const row = server.pull(uid).debts[0];
  server.push(uid, [{ ...row, balance: 1, base: row.updated_at, updated_at: new Date().toISOString() }], {});
  a.doc.querySelector("[data-edit]").click(); // dialog open
  await a.win.MPDDCloud.syncNow();
  assert.equal(a.debts()[0].balance, 100, "no se toca mientras se edita");
  a.doc.getElementById("cancel").click();
  await waitFor(() => a.debts()[0].balance === 1, { timeout: 8000, label: "se aplica después" });
  a.close();
});

test("candado de recuperación: con restauración pendiente no se sincroniza", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  await a.close();
  const state = JSON.stringify({ userId: uid, debts: {}, settings: {} });
  const before = server.calls.length;
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("d1", "Cambiada")]), "nando-restore-journal-v1": "{corrupto", "mpdd-cloud-state-v1": state, "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "paused", { label: "pausa" });
  await sleep(100);
  assert.ok(!server.calls.slice(before).some((c) => c[0] === "rpc"), "ninguna llamada a la base de datos");
  assert.equal(server.rowsFor(uid)[0].name, "Uno");
  assert.match(h.doc.getElementById("data-status").textContent, /PAUSA/);
  h.close();
});

test("restaurar un respaldo manual con sesión se refleja en la nube", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Antes")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const backup = JSON.stringify({ version: 1, debts: [debt("r1", "Restaurada")] });
  const file = new a.win.File([backup], "respaldo.json", { type: "application/json" });
  const input = a.doc.getElementById("file");
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new a.win.Event("change"));
  await waitFor(() => /Respaldo válido/.test(a.doc.getElementById("backup-panel").textContent), { label: "respaldo validado" });
  [...a.doc.querySelectorAll("#backup-panel button")].find((b) => b.textContent === "Sí, restaurar").click();
  await waitFor(() => {
    const d = server.pull(uid).debts;
    return d.find((x) => x.id === "r1" && !x.deleted) && d.find((x) => x.id === "d1" && x.deleted);
  }, { label: "nube refleja restauración" });
  assert.ok(!a.doc.querySelector(".account-backup-note").hidden, "aviso de respaldo ajustado");
  a.close();
});

test("cerrar sesión conservando la copia local: datos intactos y sin más red", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  [...a.doc.querySelectorAll("#account-root button")].find((b) => b.textContent === "Cerrar sesión").click();
  const dlg = a.doc.getElementById("account-dialog");
  assert.match(dlg.textContent, /Qué hacemos con la copia/);
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Conservar en este dispositivo").click();
  await waitFor(() => a.win.MPDDCloud.status().state === "signedOut");
  assert.equal(a.debts().length, 1);
  assert.equal(a.win.localStorage.getItem("mpdd-cloud-active-v1"), null);
  assert.equal(a.win.localStorage.getItem("sb-fake-auth-token"), null);
  const before = server.calls.length;
  await addDebtViaForm(a, "Después de salir");
  await sleep(3300);
  assert.equal(server.calls.length, before, "ninguna solicitud después de cerrar sesión");
  assert.equal(server.rowsFor(uid).length, 1);
  assert.match(a.doc.getElementById("data-status").textContent.replace(/\s+/g, " "), /DATOS EN ESTE DISPOSITIVO/);
  a.close();
});

test("cerrar sesión borrando la copia local: elimina deudas, ajustes y copias previas", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]), "deudas-budget-v1": JSON.stringify({ income: 1, essential: 0, fixed: 0, variable: 0, minimums: 0, extra: 0 }) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const r = await a.win.MPDDCloud.signOut({ keepLocal: false, reload: false });
  assert.equal(r.wiped, true);
  const left = keysOf(a.win);
  assert.deepEqual(left, ["deudas-lang-v1"], "solo queda el idioma: " + left.join(","));
  assert.equal(server.rowsFor(uid).length, 1, "la nube no se toca al cerrar sesión");
  a.close();
});

test("eliminar cuenta: confirmación en dos pasos, borra la nube y la cuenta", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const dlg = a.doc.getElementById("account-dialog");
  [...a.doc.querySelectorAll("#account-root button")].find((b) => b.textContent === "Eliminar mi cuenta y mis datos").click();
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Continuar").click();
  const final = [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Eliminar definitivamente");
  assert.equal(final.disabled, true, "deshabilitado hasta escribir la palabra");
  const word = a.doc.getElementById("acc-delete-word");
  word.value = "eliminar";
  word.dispatchEvent(new a.win.Event("input"));
  assert.equal(final.disabled, false);
  final.click();
  await waitFor(() => /se eliminaron/.test(dlg.textContent), { label: "resultado" });
  assert.equal(server.rowsFor(uid).length, 0);
  assert.equal(server.users.size, 0, "cuenta borrada por la función de servidor");
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Conservar en este dispositivo").click();
  await waitFor(() => a.win.MPDDCloud.status().state === "signedOut");
  assert.equal(a.debts().length, 1, "la copia local se conserva si el usuario lo elige");
  a.close();
});

test("registro: casilla obligatoria sin marcar, contraseña de 8+ y mensajes que no revelan si el correo existe", async () => {
  const server = new FakeServer();
  server.addUser("existe@ejemplo.test", "x12345678");
  const h = load({ config: "test", server, storage: ES });
  await sleep(50);
  h.doc.querySelector(".account-header .account-enter").click();
  [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => b.textContent === "Crear cuenta").click();
  const box = h.doc.getElementById("acc-accept");
  assert.equal(box.checked, false, "casilla sin marcar por defecto");
  assert.ok(h.doc.querySelector('.account-accept a[href="/privacidad.html"]'));
  assert.ok(h.doc.querySelector('.account-accept a[href="/terminos.html"]'));
  const form = h.doc.querySelector("#account-auth-dialog form");
  const submit = async () => {
    form.dispatchEvent(new h.win.Event("submit", { cancelable: true }));
    await sleep(30);
    return form.querySelector(".account-msg").textContent;
  };
  h.doc.getElementById("acc-signup-email").value = "nuevo@ejemplo.test";
  h.doc.getElementById("acc-signup-password").value = "corta";
  h.doc.getElementById("acc-signup-password2").value = "corta";
  assert.match(await submit(), /al menos 8/);
  h.doc.getElementById("acc-signup-password").value = h.doc.getElementById("acc-signup-password2").value = "suficiente123";
  assert.match(await submit(), /debes aceptar/);
  assert.equal(server.calls.length, 0, "nada se envía sin aceptar");
  box.checked = true;
  const signUpAs = async (email) => {
    h.doc.getElementById("acc-signup-email").value = email;
    h.doc.getElementById("acc-signup-password").value = h.doc.getElementById("acc-signup-password2").value = "suficiente123";
    await submit();
    return waitFor(() => /Si el correo es válido/.test(form.querySelector(".account-msg").textContent) && form.querySelector(".account-msg").textContent);
  };
  const msgNew = await signUpAs("nuevo@ejemplo.test");
  assert.equal(h.doc.getElementById("acc-signup-password").value, "", "la contraseña no se queda en el formulario");
  const msgExisting = await signUpAs("existe@ejemplo.test");
  assert.equal(msgNew, msgExisting, "mismo mensaje exista o no el correo");
  const signUp = server.calls.find((c) => c[0] === "signUp");
  assert.ok(signUp[2].terms_accepted_at, "se registra la aceptación");
  // Magic link: same neutral message for unknown emails.
  [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => b.textContent === "Iniciar sesión").click();
  h.doc.getElementById("acc-login-email").value = "noexiste@ejemplo.test";
  [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => b.textContent === "Enviarme un enlace mágico").click();
  await waitFor(() => /Si hay una cuenta con ese correo/.test(h.doc.querySelector("#account-auth-dialog form .account-msg").textContent));
  assert.equal(server.calls.find((c) => c[0] === "otp")[2].shouldCreateUser, false);
  // Google prepared but disabled.
  const g = [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => /Google/.test(b.textContent));
  assert.equal(g.disabled, true);
  h.close();
});

test("datos de la nube con HTML no se interpretan (sin inyección)", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const evil = '<img src=x onerror="window.__pwned=1">';
  // A newer remote version + a local edit -> conflict notice shows the name.
  const row = server.pull(uid).debts[0];
  server.push(uid, [{ ...row, name: evil, base: row.updated_at, updated_at: new Date(Date.now() + 1000).toISOString() }], {});
  await a.win.MPDDCloud.syncNow();
  await waitFor(() => a.debts()[0].name === evil);
  // Delete it remotely so the notice includes the name.
  const row2 = server.pull(uid).debts[0];
  server.push(uid, [{ id: "d1", deleted: true, base: row2.updated_at }], {});
  await a.win.MPDDCloud.syncNow();
  await waitFor(() => a.debts().length === 0);
  assert.equal(a.doc.querySelectorAll("img").length, 0);
  assert.equal(a.win.__pwned, undefined);
  assert.ok(a.doc.getElementById("sync-notices").textContent.includes(evil), "se muestra como texto");
  a.close();
});

test("deudas que no cumplen las reglas de la nube no se suben y se listan", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const long = "N".repeat(120); // allowed by local backups (200) but not by the cloud (80)
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("ok", "Bien"), debt("bad", long)]) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  assert.equal(server.rowsFor(uid)[0].id, "ok");
  assert.equal(a.win.MPDDCloud.status().unsyncable.length, 1);
  assert.ok(a.doc.getElementById("account-root").textContent.includes(long));
  assert.equal(a.debts().length, 2, "nunca se borra lo local");
  a.close();
});

test("ajustes (presupuesto) se sincronizan por clave y piden recargar", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const budget = JSON.stringify({ income: 9, essential: 1, fixed: 1, variable: 1, minimums: 1, extra: 1 });
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "deudas-budget-v1": budget });
  await waitFor(() => server.settings.get(uid) && server.settings.get(uid)["deudas-budget-v1"]);
  const b = await linkedDevice(server, "a@ejemplo.test", uid);
  await waitFor(() => b.win.localStorage.getItem("deudas-budget-v1") === budget, { label: "presupuesto en B" });
  assert.equal(b.win.MPDDCloud.status().settingsChanged, true);
  assert.match(b.doc.getElementById("sync-notices").textContent, /Recarga la página/);
  // Invalid setting values from the cloud are rejected by the existing validator.
  server.settings.get(uid)["deudas-budget-v1"] = { value: '{"income":-5}', updatedAt: new Date(Date.now() + 1000).toISOString() };
  await b.win.MPDDCloud.syncNow();
  assert.equal(b.win.localStorage.getItem("deudas-budget-v1"), budget, "valor inválido no se aplica");
  a.close();
  b.close();
});

test("clave secreta en la configuración: la app se niega a usarla", async () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "dist", "cloud-sync.js"), "utf8");
  assert.ok(src.includes("sb_secret_"));
  const h = load({ config: "test", storage: ES });
  // Simulate a service_role JWT by checking the detector directly.
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const fakeJwt = header + "." + payload + ".firma";
  const cfg = { supabaseUrl: "https://x.supabase.co", supabaseKey: fakeJwt };
  const status = new h.win.Function("cfg", "const CFG=cfg;" + src.match(/function configStatus\(\) \{[\s\S]*?\n  \}/)[0] + ";return configStatus()")(cfg);
  assert.equal(status, "secret");
  h.close();
});

test("si los datos de la nube se borran desde otro dispositivo, este conserva su copia y cierra sesión", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]), "deudas-budget-v1": JSON.stringify({ income: 1, essential: 0, fixed: 0, variable: 0, minimums: 0, extra: 0 }) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const b = await linkedDevice(server, "a@ejemplo.test", uid);
  await waitFor(() => b.debts().length === 1);
  // Device A deletes all cloud data (account deletion without the server function).
  server.functionDeployed = false;
  const r = await a.win.MPDDCloud.deleteAccount();
  assert.equal(r.accountDeleted, false);
  assert.equal(server.rowsFor(uid).length, 0);
  await b.win.MPDDCloud.syncNow();
  await waitFor(() => b.win.MPDDCloud.status().state === "signedOut", { label: "B cierra sesión" });
  assert.equal(b.debts().length, 1, "B no borra sus datos locales");
  assert.ok(b.win.localStorage.getItem("deudas-budget-v1"), "B conserva sus ajustes");
  assert.equal(b.win.MPDDCloud.status().error, "remoteReset");
  assert.match(b.doc.getElementById("account-root").textContent, /se borraron desde otro dispositivo/);
  assert.equal(server.rowsFor(uid).length, 0, "B no vuelve a subir lo que se borró");
});

test("un registro pendiente que no se puede subir no genera solicitudes repetidas", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const a = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("bad", "N".repeat(100)), debt("__proto__", "Prototipo")]) });
  await sleep(300);
  const pulls = () => server.calls.filter((c) => c[0] === "rpc" && c[1] === "mpdd_pull").length;
  const before = pulls();
  await sleep(7000);
  assert.ok(pulls() - before <= 1, "solicitudes extra: " + (pulls() - before));
  assert.equal(Object.prototype.l, undefined, "sin contaminación de prototipos");
  assert.equal(a.win.Object.prototype.l, undefined);
  assert.equal(a.win.MPDDCloud.status().unsyncable.length, 2);
});
