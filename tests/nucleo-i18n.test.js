/* Pruebas de la lógica pura de sincronización, de i18n y del modo sin cuenta. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../dist/cloud-core.js");
const I18n = require("../dist/i18n.js");
const { load, closeAll, sleep, debt, addDebtViaForm } = require("./harness");
test.afterEach(closeAll);

test("normalización ida y vuelta estable (no genera cambios fantasma)", () => {
  const samples = [
    debt("a", "Uno"),
    debt("b", "Dos", { due: "", limit: "", rate: null, source: undefined, history: [{ amount: 10, date: "" }, { amount: 5.5, date: "2026-02-30" }] }),
    debt("c", "Tres", { due: 7, extraField: { x: 1 }, history: [{ amount: 1, date: "2026-01-01", note: "n" }] }),
  ];
  for (const d of samples) {
    const v = Core.toRemote(d);
    const back = Core.fromRemote(d.id, v);
    assert.equal(Core.hash(Core.toRemote(back)), Core.hash(v), d.id);
  }
  assert.equal(Core.toRemote(samples[1]).payments[1].paid_on, null, "fecha inválida no se envía");
  assert.deepEqual(Core.toRemote(samples[2]).extra, { extraField: { x: 1 } });
});

test("validación equivalente a las restricciones de la base de datos", () => {
  assert.deepEqual(Core.problems(Core.toRemote(debt("a", "Bien"))), []);
  assert.ok(Core.problems(Core.toRemote(debt("a", "x".repeat(81)))).includes("name"));
  assert.ok(Core.problems(Core.toRemote(debt("a", "   "))).includes("name"));
  assert.ok(Core.problems(Core.toRemote(debt("a", "A", { balance: -1 }))).includes("balance"));
  assert.ok(Core.problems(Core.toRemote(debt("a", "A", { currency: "ARS" }))).includes("currency"));
  assert.deepEqual(Core.problems(Core.toRemote(debt("a", "A", { currency: "EUR" }))), [], "1.8: el euro es válido");
  assert.ok(Core.problems(Core.toRemote(debt("a", "A", { due: "32" }))).includes("due"));
  assert.ok(Core.problems(Core.toRemote(debt("a", "A", { due: "0" }))).includes("due"));
  assert.deepEqual(Core.problems(Core.toRemote(debt("a", "A", { due: "31" }))), []);
});

test("plan de fusión: casos básicos y conflictos por fecha", () => {
  const v1 = { n: 1 }, v2 = { n: 2 };
  const h1 = Core.hash(v1), h2 = Core.hash(v2);
  const L = (o) => new Map(Object.entries(o));
  const R = (o) => new Map(Object.entries(o));
  const ops = (p) => Object.fromEntries(p.map((x) => [x.id, x.op + (x.conflict ? ":" + x.conflict : "")]));
  // Nuevo local -> subir; nuevo remoto -> aplicar; igual -> sync
  assert.deepEqual(ops(Core.plan(L({ a: v1, c: v1 }), R({ b: { value: v1, updatedAt: "t" }, c: { value: v1, updatedAt: "t" } }), {})), { a: "push", b: "apply", c: "sync" });
  // Solo cambió lo local
  assert.deepEqual(ops(Core.plan(L({ a: v2 }), R({ a: { value: v1, updatedAt: "r1" } }), { a: { s: h1, r: "r1", l: h2 } })), { a: "push" });
  // Solo cambió la nube
  assert.deepEqual(ops(Core.plan(L({ a: v1 }), R({ a: { value: v2, updatedAt: "r2" } }), { a: { s: h1, r: "r1", l: h1 } })), { a: "apply" });
  // Borrado local -> lápida; borrado remoto -> borrar local
  assert.deepEqual(ops(Core.plan(L({}), R({ a: { value: v1, updatedAt: "r1" } }), { a: { s: h1, r: "r1", l: null } })), { a: "pushDelete" });
  assert.deepEqual(ops(Core.plan(L({ a: v1 }), R({ a: { value: null, deleted: true, updatedAt: "r2" } }), { a: { s: h1, r: "r1", l: h1 } })), { a: "applyDelete" });
  // Conflicto: ambos cambiaron -> gana el más reciente
  const st = (t) => ({ a: { s: h1, r: "2026-01-01T00:00:00.000Z", l: h2, t } });
  const remote = R({ a: { value: { n: 3 }, updatedAt: "2026-01-02T00:00:00.000Z" } });
  assert.deepEqual(ops(Core.plan(L({ a: v2 }), remote, st("2026-01-03T00:00:00.000Z"))), { a: "push:local" });
  assert.deepEqual(ops(Core.plan(L({ a: v2 }), remote, st("2026-01-01T12:00:00.000Z"))), { a: "apply:remote" });
  // Lápida antigua en la nube no borra datos locales nuevos en la primera vinculación
  assert.deepEqual(ops(Core.plan(L({ a: v1 }), R({ a: { value: null, deleted: true, updatedAt: "r" } }), {})), { a: "push" });
});

test("cada texto nuevo de la cuenta tiene traducción en i18n.js", async () => {
  const h = load({ storage: { "deudas-lang-v1": "es" } });
  await sleep(50);
  const T = h.win.MPDDAccountStrings;
  const map = new Map(I18n.entries);
  const missing = Object.values(T).filter((es) => !map.has(es));
  assert.deepEqual(missing, []);
  for (const es of ["Política de privacidad", "Términos de uso", "Cuenta"]) assert.ok(map.has(es), es);
});

test("el panel Cuenta y el encabezado se muestran en inglés", async () => {
  const h = load({ storage: { "deudas-lang-v1": "en" } });
  await sleep(80);
  const text = h.doc.getElementById("view-more").textContent;
  assert.match(text, /Account/);
  assert.match(text, /Optional: create an account/);
  assert.doesNotMatch(text, /Opcional: crea una cuenta/);
  assert.match(h.doc.getElementById("data-status").textContent, /DATA ON THIS DEVICE/);
  assert.match(h.doc.querySelector(".legal-links").textContent, /Privacy Policy/);
});

test("modo sin cuenta: flujos existentes intactos (agregar, pagar, ordenar, plan, recordatorios)", async () => {
  const h = load({ storage: { "deudas-lang-v1": "es" } });
  await sleep(50);
  const { doc, win } = h;
  await addDebtViaForm(h, "Tarjeta", "300");
  await addDebtViaForm(h, "Crédito", "100");
  await sleep(20);
  assert.equal(h.debts().length, 2);
  assert.equal(doc.getElementById("total").textContent, "US$400.00 USD");
  // Pago
  doc.querySelector("[data-pay]").click();
  doc.getElementById("payment").value = "50";
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.equal(h.debts().find((d) => d.name === "Crédito").balance, 50);
  assert.equal(h.debts().find((d) => d.name === "Crédito").history.length, 1);
  // Orden
  doc.getElementById("sort").value = "balance-desc";
  doc.getElementById("sort").dispatchEvent(new win.Event("change"));
  assert.equal(win.localStorage.getItem("nando-deudas-sort-v1"), "balance-desc");
  assert.equal(doc.querySelector("#cards h3").textContent, "Tarjeta");
  // 1.3: "Capacidad mensual" was replaced by the Plan assistant (tested in plan-1-3.test.js).
  assert.ok(doc.getElementById("plan-root"));
  // Recordatorios
  doc.getElementById("rem-open").click();
  const remForm = doc.querySelector("#rem-content form");
  remForm.dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.ok(win.localStorage.getItem("nando-recordatorios-v1"));
  // Nada nuevo en el almacenamiento ni en la red
  const keys = Object.keys(Object.fromEntries(Object.entries(win.localStorage)));
  assert.ok(!keys.some((k) => k.startsWith("mpdd-cloud") || k.startsWith("sb-")), keys.join(","));
  assert.deepEqual(h.net.fetch, []);
  assert.deepEqual(h.errors, []);
  // Navegación: Más -> Cuenta existe
  assert.ok(doc.querySelector("#view-more #account-root"));
  assert.ok(doc.querySelector('.bottom-nav [data-target="more"]'));
});

test("modo sin cuenta: restauración interrumpida sigue bloqueando la edición", async () => {
  const h = load({ storage: { "deudas-lang-v1": "es", "nando-deudas-v1": JSON.stringify([debt("a", "Uno")]), "nando-restore-journal-v1": "{dañado" } });
  await sleep(50);
  assert.equal(h.doc.getElementById("recovery-panel").hidden, false);
  assert.equal(h.doc.getElementById("add").disabled, true);
  assert.equal(h.doc.getElementById("export").disabled, false);
  assert.equal(h.win.MPDDApp.isLocked(), true);
  assert.equal(h.win.MPDDApp.replaceDebts([]), false, "la nube tampoco puede escribir");
  assert.equal(h.debts().length, 1);
});
