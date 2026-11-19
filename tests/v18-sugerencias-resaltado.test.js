/* Tests for version 1.8: "Enviar sugerencia" and the highlight of upcoming payments on Inicio.
   Run: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, closeAll, waitFor, sleep, debt, session } = require("./harness");
const { FakeServer } = require("./fake-supabase");
const R = require("../dist/resaltado.js");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const EN = { "deudas-lang-v1": "en" };

/* Fixed local date for the page ("today" = device local date). h.win.__setNow(y, m, d) moves it. */
function fixedDate(y, m, d) {
  return (win) => {
    const Real = win.Date;
    let now = new Real(y, m - 1, d, 10, 0, 0).getTime();
    class FakeDate extends Real {
      constructor(...a) {
        if (a.length) super(...a);
        else super(now);
      }
      static now() {
        return now;
      }
    }
    win.Date = FakeDate;
    win.__setNow = (yy, mm, dd, hh = 10) => {
      now = new Real(yy, mm - 1, dd, hh, 0, 0).getTime();
    };
  };
}
const card = (h, id) => h.doc.querySelector('#cards [data-edit="' + id + '"]').closest("article.card");
const flag = (h, id) => {
  const f = card(h, id).querySelector(".due-flag");
  return f ? f.textContent.replace(/\s+/g, " ").trim() : null;
};
const order = (h) => [...h.doc.querySelectorAll("#cards article.card [data-edit]")].map((b) => b.dataset.edit);

/* ---------------- 1. Color rules (pure) ---------------- */

test("resaltado: reglas de color (hoy, vencido, mañana, 3 días, 8 días, pagado, sin fecha)", () => {
  const today = "2026-11-18";
  const nov = { createdAt: "2026-11-01" };
  const debts = [
    debt("hoy", "Hoy", Object.assign({ due: "18" }, nov)),
    debt("venc", "Vencida", Object.assign({ due: "10" }, nov)),
    debt("prev", "Mes anterior", { due: "25", createdAt: "2026-10-01" }),
    debt("man", "Mañana", Object.assign({ due: "19" }, nov)),
    debt("tres", "Tres", Object.assign({ due: "21", currency: "COP", balance: 500000, initial: 900000 }, nov)),
    debt("eur", "Euros", Object.assign({ due: "22", currency: "EUR" }, nov)),
    debt("ocho", "Ocho", Object.assign({ due: "26" }, nov)),
    debt("pag", "Pagada", Object.assign({ due: "18", history: [{ amount: 10, date: "2026-11-12", dueDate: "2026-11-18" }] }, nov)),
    debt("sin", "Sin fecha", Object.assign({ due: "" }, nov)),
  ];
  const m = R.levels(debts, today);
  assert.deepEqual(m.get("hoy"), { level: "red", kind: "today", days: 0, dueDate: "2026-11-18" });
  assert.deepEqual(m.get("venc"), { level: "red", kind: "overdue", days: -8, dueDate: "2026-11-10" });
  assert.equal(m.get("prev").level, "red", "cuota sin pagar del mes anterior");
  assert.equal(m.get("prev").dueDate, "2026-10-25");
  assert.equal(m.get("man").level, "yellow");
  assert.deepEqual(m.get("tres"), { level: "blue", kind: "soon", days: 3, dueDate: "2026-11-21" });
  assert.equal(m.get("eur").level, "blue", "cualquier moneda");
  assert.equal(m.has("ocho"), false, "8 días: sin resaltar");
  assert.equal(m.has("pag"), false, "pagada este mes: sin resaltar");
  assert.equal(m.has("sin"), false, "sin fecha: sin resaltar");
  assert.deepEqual(R.labelParts(m.get("venc")).map((p) => p.t || p.raw), ["Vencido hace", "8", "días"]);
  assert.deepEqual(R.labelParts({ kind: "overdue", days: -1 }).map((p) => p.t || p.raw), ["Vencido hace", "1", "día"]);
  assert.deepEqual(R.labelParts(m.get("tres")).map((p) => p.t || p.raw), ["Vence en", "3", "días"]);
  const s = R.summarize(m);
  assert.equal(s.overdue, 2);
  assert.equal(s.today, 1);
  assert.equal(s.week, 3);
  assert.equal(s.top, "red");
});

test("resaltado: día 31 en un mes de 30 días", () => {
  const d = [debt("d31", "Día 31", { due: "31", createdAt: "2026-11-01" })];
  assert.deepEqual(R.levels(d, "2026-11-30").get("d31"), { level: "red", kind: "today", days: 0, dueDate: "2026-11-30" });
  assert.equal(R.levels(d, "2026-11-29").get("d31").level, "yellow");
  assert.equal(R.levels(d, "2026-11-23").get("d31").level, "blue");
  assert.equal(R.levels(d, "2026-11-22").has("d31"), false);
});

/* ---------------- 2. Cards on Inicio ---------------- */

function sample() {
  const nov = { createdAt: "2026-11-01" };
  return [
    debt("ocho", "Ocho días", Object.assign({ due: "26", balance: 50 }, nov)),
    debt("tres", "Tres días", Object.assign({ due: "21", balance: 100 }, nov)),
    debt("hoy", "Hoy", Object.assign({ due: "18", balance: 200 }, nov)),
    debt("sin", "Sin fecha", Object.assign({ due: "", balance: 30 }, nov)),
    debt("venc", "Vencida", Object.assign({ due: "10", balance: 300 }, nov)),
    debt("man", "Mañana", Object.assign({ due: "19", balance: 400 }, nov)),
    debt("pag", "Pagada", Object.assign({ due: "18", balance: 20, history: [{ amount: 10, date: "2026-11-12", dueDate: "2026-11-18" }] }, nov)),
  ];
}

test("tarjetas: borde de color + texto, en español", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(sample()) }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  assert.deepEqual(h.errors, []);
  assert.equal(flag(h, "hoy"), "Vence hoy");
  assert.ok(card(h, "hoy").classList.contains("due-red"));
  assert.equal(card(h, "hoy").dataset.dueLevel, "red");
  assert.equal(flag(h, "venc"), "Vencido hace 8 días");
  assert.ok(card(h, "venc").classList.contains("due-red"));
  assert.equal(flag(h, "man"), "Vence mañana");
  assert.ok(card(h, "man").classList.contains("due-yellow"));
  assert.equal(flag(h, "tres"), "Vence en 3 días");
  assert.ok(card(h, "tres").classList.contains("due-blue"));
  for (const id of ["ocho", "pag", "sin"]) {
    assert.equal(flag(h, id), null, id);
    assert.equal(card(h, id).dataset.dueLevel, undefined, id);
    assert.ok(!/due-/.test(card(h, id).className), id);
  }
});

test("tarjetas: COP también, y día 31 en noviembre vence el 30", async () => {
  const d = [debt("c31", "Pesos", { currency: "COP", balance: 900000, initial: 1000000, due: "31", createdAt: "2026-11-01" }), debt("u1", "Dólares", { due: "2", createdAt: "2026-11-01", history: [{ amount: 5, date: "2026-11-01", dueDate: "2026-11-02" }] })];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(d) }), beforeParse: fixedDate(2026, 11, 30) });
  await sleep(30);
  assert.equal(flag(h, "c31"), "Vence hoy");
  // Next month's installment (Dec 2) is within 7 days and unpaid.
  assert.equal(flag(h, "u1"), "Vence en 2 días");
});

test("tarjetas: en inglés", async () => {
  const h = load({ storage: Object.assign({}, EN, { "nando-deudas-v1": JSON.stringify(sample()) }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  assert.equal(flag(h, "hoy"), "Due today");
  assert.equal(flag(h, "venc"), "Overdue by 8 days");
  assert.equal(flag(h, "man"), "Due tomorrow");
  assert.equal(flag(h, "tres"), "Due in 3 days");
  assert.match(h.doc.getElementById("due-summary").textContent, /1 overdue payment · 1 payment due today · 2 payments due this week/);
  // Language change re-renders in Spanish.
  const sel = h.doc.getElementById("language-choice");
  sel.value = "es";
  sel.dispatchEvent(new h.win.Event("change"));
  await sleep(20);
  assert.equal(flag(h, "tres"), "Vence en 3 días");
});

test("orden: sin orden elegido, urgentes primero (rojo, amarillo, azul, por fecha); con orden elegido se respeta", async () => {
  let h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(sample()) }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  // Default order is balance-asc: pag(20) sin(30) ocho(50) tres(100) hoy(200) venc(300) man(400).
  assert.deepEqual(order(h), ["venc", "hoy", "man", "tres", "pag", "sin", "ocho"]);
  assert.equal(h.doc.getElementById("due-order-note").hidden, false);
  await h.close();

  h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(sample()), "nando-deudas-sort-v1": "balance-asc" }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  assert.deepEqual(order(h), ["pag", "sin", "ocho", "tres", "hoy", "venc", "man"]);
  assert.equal(flag(h, "hoy"), "Vence hoy", "se resalta igual");
  assert.equal(h.doc.getElementById("due-order-note").hidden, true);
  // Choosing an order in the select after starting without one.
  await h.close();
  h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(sample()) }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  const sel = h.doc.getElementById("sort");
  sel.value = "rate-asc";
  sel.dispatchEvent(new h.win.Event("change"));
  await sleep(10);
  sel.value = "balance-desc";
  sel.dispatchEvent(new h.win.Event("change"));
  await sleep(10);
  assert.deepEqual(order(h), ["man", "venc", "hoy", "tres", "ocho", "sin", "pag"]);
});

test("resumen: sobre «Mis deudas», y al tocarlo enfoca la primera tarjeta resaltada", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(sample()), "nando-deudas-sort-v1": "balance-asc" }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  const s = h.doc.getElementById("due-summary");
  assert.equal(s.hidden, false);
  assert.equal(s.tagName, "BUTTON");
  assert.equal(s.textContent.replace(/\s+/g, " ").replace("›", "").trim(), "1 pago vencido · 1 pago vence hoy · 2 pagos vencen esta semana");
  assert.ok(s.classList.contains("due-red"));
  const head = h.doc.querySelector("#cards").closest("section").querySelector(".section-head");
  assert.equal(s.nextElementSibling, head, "va justo antes de «Mis deudas»");
  let scrolled = null;
  h.win.HTMLElement.prototype.scrollIntoView = function () {
    scrolled = this;
  };
  s.click();
  // With a user sort, the first highlighted card in the list is "tres" (100).
  assert.equal(h.doc.activeElement, card(h, "tres"));
  assert.equal(scrolled, card(h, "tres"));
});

test("resumen: sin pagos urgentes no se muestra", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "A", { due: "28", createdAt: "2026-11-01" })]) }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  assert.equal(h.doc.getElementById("due-summary").hidden, true);
  assert.equal(h.doc.querySelectorAll("#cards .due-flag").length, 0);
});

test("se actualiza al registrar un pago y al cambiar la fecha (visibilitychange)", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(sample()) }), beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  assert.ok(h.win.MPDDApp.openPayment("hoy"));
  assert.equal(h.doc.getElementById("dueDate").value, "2026-11-18");
  h.doc.getElementById("payment").value = "25";
  h.doc.getElementById("form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.equal(flag(h, "hoy"), null, "pagada: sin resaltar");
  assert.equal(flag(h, "man"), "Vence mañana");
  // Next day.
  h.win.__setNow(2026, 11, 19);
  Object.defineProperty(h.doc, "visibilityState", { configurable: true, get: () => "visible" });
  h.doc.dispatchEvent(new h.win.Event("visibilitychange"));
  await sleep(20);
  assert.equal(flag(h, "man"), "Vence hoy");
  assert.equal(flag(h, "tres"), "Vence en 2 días");
  assert.equal(flag(h, "ocho"), "Vence en 7 días");
});

/* ---------------- 3. "Enviar sugerencia" ---------------- */

const $ = (h, id) => h.doc.getElementById(id);
function type(h, id, value) {
  const n = $(h, id);
  n.value = value;
  n.dispatchEvent(new h.win.Event("input", { bubbles: true }));
}
async function openSug(h, from = "sug-open-more") {
  $(h, from).click();
  await sleep(5);
  assert.ok($(h, "sug-dialog").hasAttribute("open"));
}
async function send(h) {
  $(h, "sug-send").click();
  await sleep(30);
}
const msg = (h) => h.doc.querySelector("#sug-dialog .sug-msg").textContent;

test("sugerencias: entrada en «Más» y enlace discreto en Inicio; diálogo accesible", async () => {
  const h = load({ storage: ES, config: "test", server: new FakeServer() });
  await sleep(30);
  assert.deepEqual(h.errors, []);
  assert.ok($(h, "view-more").contains($(h, "sug-open-more")));
  assert.ok($(h, "view-home").contains($(h, "sug-open-home")));
  assert.equal($(h, "sug-open-home").closest(".footer").classList.contains("legal-links"), true);
  await openSug(h, "sug-open-home");
  const d = $(h, "sug-dialog");
  assert.equal(d.getAttribute("aria-labelledby"), "sug-title");
  assert.equal($(h, "sug-title").textContent, "Enviar sugerencia");
  const radios = [...d.querySelectorAll('input[name="sug-tipo"]')];
  assert.deepEqual(radios.map((r) => r.value), ["sugerencia", "error", "gusto"]);
  assert.ok(radios[0].checked);
  assert.deepEqual(radios.map((r) => d.querySelector('label[for="' + r.id + '"]').textContent), ["Sugerencia", "Error", "Algo que me gustó"]);
  assert.ok(d.querySelector("fieldset legend"));
  assert.equal($(h, "sug-texto").getAttribute("maxlength"), "1000");
  assert.ok($(h, "sug-texto").hasAttribute("required"));
  assert.equal($(h, "sug-contacto").type, "email");
  const trap = $(h, "sug-web");
  assert.equal(trap.getAttribute("tabindex"), "-1");
  assert.equal(trap.getAttribute("autocomplete"), "off");
  assert.equal(trap.getAttribute("aria-hidden"), "true");
  assert.equal(trap.closest(".sug-trap").getAttribute("aria-hidden"), "true");
  assert.equal(h.doc.activeElement, $(h, "sug-texto"));
});

test("sugerencias: contador en vivo y máximo de 1000 caracteres", async () => {
  const h = load({ storage: ES, config: "test", server: new FakeServer() });
  await sleep(30);
  await openSug(h);
  assert.equal($(h, "sug-count").textContent, "0/1000");
  type(h, "sug-texto", "Hola");
  assert.equal($(h, "sug-count").textContent, "4/1000");
  type(h, "sug-texto", "x".repeat(1005));
  assert.equal($(h, "sug-texto").value.length, 1000);
  assert.equal($(h, "sug-count").textContent, "1000/1000");
});

test("sugerencias: el mensaje es obligatorio y el correo se valida", async () => {
  const server = new FakeServer();
  const h = load({ storage: ES, config: "test", server });
  await sleep(30);
  await openSug(h);
  type(h, "sug-texto", "   ");
  await send(h);
  assert.equal(msg(h), "Escribe tu mensaje.");
  assert.equal($(h, "sug-texto").getAttribute("aria-invalid"), "true");
  type(h, "sug-texto", "Una idea");
  for (const bad of ["malo@", "sin-arroba.com", "a@b", "a b@c.co"]) {
    type(h, "sug-contacto", bad);
    await send(h);
    assert.equal(msg(h), "Revisa el correo de contacto.", bad);
  }
  assert.equal(server.suggestionCalls.length, 0, "nada se envió");
  type(h, "sug-contacto", "yo@ejemplo.com");
  await send(h);
  assert.equal(server.suggestionCalls.length, 1);
  assert.equal(JSON.parse(server.suggestionCalls[0].body).contacto, "yo@ejemplo.com");
});

test("sugerencias: el campo trampa (honeypot) finge éxito y no envía nada", async () => {
  const server = new FakeServer();
  const h = load({ storage: ES, config: "test", server });
  await sleep(30);
  await openSug(h);
  type(h, "sug-texto", "spam");
  $(h, "sug-web").value = "http://spam.example";
  await send(h);
  assert.equal(msg(h), "¡Gracias! Recibimos tu mensaje.");
  assert.equal(server.suggestionCalls.length, 0);
  assert.equal(h.net.fetch.filter((u) => /sugerencias/.test(u)).length, 0);
  assert.equal($(h, "sug-texto").value, "");
});

test("sugerencias: petición sin sesión (cabeceras y cuerpo; nunca user_id)", async () => {
  const server = new FakeServer();
  const h = load({ storage: ES, config: "test", server });
  await sleep(30);
  await openSug(h);
  $(h, "sug-tipo-gusto").click();
  type(h, "sug-texto", "  Me gusta el calendario  ");
  await send(h);
  assert.equal(server.suggestionCalls.length, 1);
  const c = server.suggestionCalls[0];
  assert.equal(c.url, "https://proyecto-prueba.supabase.co/rest/v1/sugerencias");
  assert.equal(c.method, "POST");
  assert.equal(c.headers.apikey, "sb_publishable_PRUEBA123");
  assert.equal(c.headers["Content-Type"], "application/json");
  assert.equal(c.headers.Prefer, "return=minimal");
  assert.equal(c.headers.Authorization, "Bearer sb_publishable_PRUEBA123");
  const body = JSON.parse(c.body);
  assert.deepEqual(Object.keys(body).sort(), ["contacto", "idioma", "texto", "tipo", "version"]);
  assert.deepEqual(body, { tipo: "gusto", texto: "Me gusta el calendario", contacto: null, idioma: "es", version: h.win.MPDD_VERSION });
  assert.ok(body.version);
  assert.equal(server.suggestions[0].user_id, null);
  assert.equal(msg(h), "¡Gracias! Recibimos tu mensaje.");
  assert.equal($(h, "sug-texto").value, "", "formulario limpio");
  assert.equal($(h, "sug-count").textContent, "0/1000");
  assert.ok($(h, "sug-tipo-sugerencia").checked);
  // Nothing financial or personal in the console.
  assert.ok(!h.consoleLogs.some(([, t]) => /calendario|PRUEBA123|token/i.test(t)));
});

test("sugerencias: con sesión usa el token del usuario y no envía user_id", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "sesión" });
  await openSug(h);
  type(h, "sug-texto", "Un error en el gráfico");
  $(h, "sug-tipo-error").click();
  await send(h);
  assert.equal(server.suggestionCalls.length, 1);
  const c = server.suggestionCalls[0];
  assert.equal(c.headers.Authorization, "Bearer fake-token-" + uid);
  assert.equal(c.headers.apikey, "sb_publishable_PRUEBA123");
  const body = JSON.parse(c.body);
  assert.equal("user_id" in body, false);
  assert.equal(body.tipo, "error");
  assert.equal(server.suggestions[0].user_id, uid, "la base de datos toma el usuario del token");
});

test("sugerencias: mensaje de gracias en inglés", async () => {
  const server = new FakeServer();
  const h = load({ storage: EN, config: "test", server });
  await sleep(30);
  await openSug(h);
  assert.equal($(h, "sug-title").textContent, "Send a suggestion");
  type(h, "sug-texto", "Great app");
  await send(h);
  assert.equal(msg(h), "Thank you! We received your message.");
  assert.equal(JSON.parse(server.suggestionCalls[0].body).idioma, "en");
});

test("sugerencias: si falla se conserva lo escrito (también al cerrar) y el mismo botón reintenta", async () => {
  const server = new FakeServer();
  const h = load({ storage: ES, config: "test", server });
  await sleep(30);
  await openSug(h);
  $(h, "sug-tipo-error").click();
  type(h, "sug-texto", "No carga el plan");
  type(h, "sug-contacto", "yo@ejemplo.com");
  server.suggestionReply = 500;
  await send(h);
  assert.equal(msg(h), "No se pudo enviar. Inténtalo de nuevo en unos minutos.");
  assert.equal($(h, "sug-texto").value, "No carga el plan");
  server.suggestionReply = 0;
  await send(h);
  assert.equal(msg(h), "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
  server.suggestionReply = "rate";
  await send(h);
  assert.equal(msg(h), "Ya enviaste varias sugerencias. Espera unos minutos e inténtalo de nuevo.");
  // Close and reopen: the draft is still there.
  h.doc.querySelector("#sug-dialog .cancel").click();
  assert.equal($(h, "sug-dialog").hasAttribute("open"), false);
  $(h, "sug-texto").value = "";
  await openSug(h);
  assert.equal($(h, "sug-texto").value, "No carga el plan");
  assert.equal($(h, "sug-contacto").value, "yo@ejemplo.com");
  assert.ok($(h, "sug-tipo-error").checked);
  assert.equal($(h, "sug-count").textContent, "16/1000");
  server.suggestionReply = null;
  assert.equal($(h, "sug-send").disabled, false);
  await send(h);
  assert.equal(msg(h), "¡Gracias! Recibimos tu mensaje.");
  assert.equal(server.suggestions.length, 1);
  assert.equal(server.suggestions[0].texto, "No carga el plan");
  assert.equal(h.win.sessionStorage.getItem("mpdd-sugerencia-borrador-v1"), null, "borrador eliminado");
});

test("sugerencias: límite del dispositivo, 3 envíos cada 10 minutos (solo marcas de tiempo)", async () => {
  const server = new FakeServer();
  const h = load({ storage: ES, config: "test", server, beforeParse: fixedDate(2026, 11, 18) });
  await sleep(30);
  await openSug(h);
  for (let i = 1; i <= 3; i++) {
    type(h, "sug-texto", "Idea " + i);
    await send(h);
    assert.equal(msg(h), "¡Gracias! Recibimos tu mensaje.");
  }
  type(h, "sug-texto", "Idea 4");
  await send(h);
  assert.equal(msg(h), "Ya enviaste varias sugerencias. Espera unos minutos e inténtalo de nuevo.");
  assert.equal(server.suggestionCalls.length, 3);
  assert.equal($(h, "sug-texto").value, "Idea 4", "se conserva");
  const stored = JSON.parse(h.win.localStorage.getItem("mpdd-sugerencias-v1"));
  assert.equal(stored.length, 3);
  assert.ok(stored.every((t) => typeof t === "number"));
  // 10 minutes later it works again.
  h.win.__setNow(2026, 11, 18, 11);
  await send(h);
  assert.equal(msg(h), "¡Gracias! Recibimos tu mensaje.");
  assert.equal(server.suggestionCalls.length, 4);
});

test("sugerencias: sin cuentas configuradas avisa y no hace ninguna petición", async () => {
  const h = load({ storage: ES });
  await sleep(30);
  await openSug(h);
  assert.equal(msg(h), "Por ahora no es posible enviar sugerencias desde esta app.");
  type(h, "sug-texto", "Hola");
  await send(h);
  assert.equal(msg(h), "Por ahora no es posible enviar sugerencias desde esta app.");
  assert.equal(h.net.fetch.length, 0);
  assert.equal($(h, "sug-texto").value, "Hola");
  assert.deepEqual(h.errors, []);
});
