/* Tests for version 1.6: eye button to show the password and rates with up to 3 decimals.
   Run: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, closeAll, sleep, debt } = require("./harness");
const { FakeServer } = require("./fake-supabase");
const Money = require("../dist/money.js");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const byText = (h, sel, text) => [...h.doc.querySelectorAll(sel + " button")].find((b) => b.textContent === text);

function openAuth(h) {
  h.doc.querySelector("header .account-enter").click();
  return h.doc.getElementById("account-auth-dialog");
}

/* ---------------- 1. Eye for the password ---------------- */

test("ojo: Iniciar sesión, Crear cuenta y 'Repite la contraseña' tienen el botón, oculto por defecto", async () => {
  const h = load({ config: "test", server: new FakeServer(), storage: ES });
  await sleep(60);
  openAuth(h);
  const check = (id) => {
    const input = h.doc.getElementById(id);
    assert.ok(input, id);
    assert.equal(input.type, "password", id + " oculta por defecto");
    const eye = input.parentElement.querySelector("button.pw-eye");
    assert.ok(eye, id + " tiene el ojo");
    assert.equal(eye.type, "button", "no envía el formulario");
    assert.equal(eye.getAttribute("aria-label"), "Mostrar contraseña");
    assert.equal(eye.getAttribute("aria-pressed"), "false");
    assert.equal(eye.getAttribute("aria-controls"), id);
    assert.ok(eye.querySelector("svg"), "ícono dibujado");
    assert.equal(eye.querySelectorAll("path").length, 2, "ojo abierto (sin la raya)");
    return { input, eye };
  };
  const login = check("acc-login-password");
  login.input.value = "secreta123";
  login.eye.click();
  assert.equal(login.input.type, "text", "se muestra");
  assert.equal(login.input.value, "secreta123", "no se pierde lo escrito");
  assert.equal(login.eye.getAttribute("aria-label"), "Ocultar contraseña");
  assert.equal(login.eye.getAttribute("aria-pressed"), "true");
  assert.equal(login.eye.querySelectorAll("path").length, 3, "ojo tachado");
  login.eye.click();
  assert.equal(login.input.type, "password", "se vuelve a ocultar");
  assert.equal(login.eye.getAttribute("aria-label"), "Mostrar contraseña");

  byText(h, "#account-auth-dialog", "Crear cuenta").click();
  const a = check("acc-signup-password");
  const b = check("acc-signup-password2");
  a.eye.click();
  assert.equal(a.input.type, "text");
  assert.equal(b.input.type, "password", "cada campo tiene su propio botón");
});

test("ojo: en inglés dice 'Show password' / 'Hide password'", async () => {
  const h = load({ config: "test", server: new FakeServer(), storage: { "deudas-lang-v1": "en" } });
  await sleep(60);
  openAuth(h);
  const eye = h.doc.getElementById("acc-login-password").parentElement.querySelector(".pw-eye");
  assert.equal(eye.getAttribute("aria-label"), "Show password");
  eye.click();
  assert.equal(eye.getAttribute("aria-label"), "Hide password");
});

/* ---------------- 2. Rates with 3 decimals ---------------- */

test("tasa: parsePercent acepta punto o coma y hasta 3 decimales, sin redondear", () => {
  assert.equal(Money.parsePercent("4.875"), 4.875);
  assert.equal(Money.parsePercent("4,875"), 4.875);
  assert.equal(Money.parsePercent(" 28,74 % "), 28.74);
  assert.equal(Money.parsePercent("12"), 12);
  assert.equal(Money.parsePercent(""), null);
  for (const bad of ["4.8755", "abc", "101", "4.", "-1", "4,8,7"]) assert.ok(Number.isNaN(Money.parsePercent(bad)), bad);
  assert.equal(Money.formatPercent(4.875, "es"), "4,875%");
  assert.equal(Money.formatPercent(4.875, "en"), "4.875%");
  assert.equal(Money.formatPercent(28.7, "es"), "28,7%");
});

async function saveRate(h, value, name = "Tarjeta") {
  const { doc, win } = h;
  doc.getElementById("add").click();
  const rate = doc.getElementById("rate");
  assert.equal(rate.type, "text", "campo de texto (no recorta decimales)");
  assert.equal(rate.getAttribute("inputmode"), "decimal", "teclado numérico en el celular");
  doc.getElementById("name").value = name;
  doc.getElementById("balance").value = "1000";
  rate.value = value;
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(30);
}

test("tasa: 4.875 y 4,875 se guardan completas y se ven en la tarjeta", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  await saveRate(h, "4.875", "Con punto");
  await saveRate(h, "4,875", "Con coma");
  const d = h.debts();
  assert.deepEqual(d.map((x) => x.rate), [4.875, 4.875]);
  const cards = h.doc.getElementById("cards").textContent;
  assert.match(cards, /4\.875% APR/);
  assert.doesNotMatch(cards, /4\.87% APR|4\.88% APR/);
});

test("tasa: más de 3 decimales muestra un error y no guarda", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  await saveRate(h, "4.8755");
  assert.equal(h.debts().length, 0);
  assert.match(h.doc.getElementById("error").textContent, /máximo 3 decimales/);
});

test("tasa: al editar, el campo trae 4.875 y al guardar no se recorta", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "Tarjeta", { rate: 4.875 })]) }) });
  await sleep(60);
  h.doc.querySelector('[data-edit="a"]').click();
  assert.equal(h.doc.getElementById("rate").value, "4.875");
  h.doc.getElementById("form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await sleep(30);
  assert.equal(h.debts()[0].rate, 4.875);
});

test("tasa: las deudas guardadas con 1 o 2 decimales siguen igual (también al editar)", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "Uno", { rate: 28.7 }), debt("b", "Dos", { rate: 19.99 }), debt("c", "Viejo", { rate: 4.87654 })]) }) });
  await sleep(60);
  const cards = h.doc.getElementById("cards").textContent;
  assert.match(cards, /28\.7% APR/);
  assert.match(cards, /19\.99% APR/);
  for (const id of ["a", "b", "c"]) {
    h.doc.querySelector(`[data-edit="${id}"]`).click();
    h.doc.getElementById("form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
    await sleep(30);
  }
  assert.deepEqual(h.debts().map((x) => x.rate), [28.7, 19.99, 4.87654], "editar sin tocar la tasa no la cambia");
});

test("tasa: el asistente del plan acepta 4,875 y el interés usa la tasa completa", async () => {
  const h = load({ storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify([debt("a", "Sin tasa", { balance: 800, rate: null, minPayment: 40 })]) }) });
  await sleep(60);
  const click = (t) => [...h.doc.querySelectorAll(".plan-wizard button, #plan-root button")].find((b) => b.textContent.trim() === t).click();
  const set = (sel, v) => {
    const i = h.doc.querySelector(sel);
    i.value = v;
    i.dispatchEvent(new h.win.Event("input"));
  };
  click("Empezar");
  set("#plan-income", "1500");
  click("Siguiente");
  click("Siguiente");
  const rate = h.doc.getElementById("plan-rate-a");
  assert.equal(rate.type, "text");
  set("#plan-rate-a", "4,875");
  click("Siguiente");
  assert.equal(h.doc.querySelector(".pw-step").textContent, "Paso 4 de 5");
  assert.equal(h.debts()[0].rate, 4.875);
  // Monthly interest on 800 at 4.875% = 3.25 (with 4.87% it would be 3.2467).
  const Core = h.win.MPDDPlanCore;
  assert.equal(Math.round(800 * Core.monthlyRate(4.875) * 10000) / 10000, 3.25);
});

test("tasa: el gráfico 'Lo que debo' muestra 4,875%", async () => {
  const h = load({ storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify([debt("a", "Tarjeta", { rate: 4.875 }), debt("b", "Otra", { rate: 20 })]) }) });
  await sleep(60);
  h.win.MPDDNavigate("chart");
  await sleep(60);
  [...h.doc.querySelectorAll("button")].find((x) => x.textContent === "Deuda total").click();
  await sleep(30);
  const txt = h.doc.querySelector("main").textContent;
  assert.match(txt, /4,875%/);
});
