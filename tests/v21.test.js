/* Versión 2.1: espacio publicitario (AdSlot, apagado por defecto), membresía Premium (base y lógica)
   y sección "Publicidad y membresía" en las políticas. DOM simulado y servidor falso; sin red real. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { load, closeAll, waitFor, sleep, debt, session } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const EN = { "deudas-lang-v1": "en" };
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const FUTURE = new Date(Date.now() + 40 * 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();
const debts3 = () => JSON.stringify([debt("d1", "Uno"), debt("d2", "Dos"), debt("d3", "Tres")]);

async function app({ ads = false, storage = ES, debts = debts3(), server } = {}) {
  const h = load({ config: "test", server: server || new FakeServer(), storage: Object.assign({}, storage, debts ? { "nando-deudas-v1": debts } : {}), url: "https://app.test/" + (ads ? "?ads=1" : "") });
  await sleep(120);
  return h;
}
const slots = (h) => [...h.doc.querySelectorAll(".ad-slot")];

test("esPremium: activa y sin vencimiento o con vencimiento futuro", () => {
  const h = load({ storage: ES });
  const { esPremium } = h.win.MPDDMembership;
  assert.equal(esPremium({ plan: "premium", activa: true, vence_en: null }), true);
  assert.equal(esPremium({ plan: "premium", activa: true, vence_en: FUTURE }), true);
  assert.equal(esPremium({ plan: "premium", activa: true, vence_en: PAST }), false);
  assert.equal(esPremium({ plan: "premium", activa: false, vence_en: FUTURE }), false);
  assert.equal(esPremium({ plan: "gratis", activa: false, vence_en: null }), false);
  assert.equal(esPremium(null), false);
  assert.equal(esPremium(undefined), false);
  assert.equal(esPremium({ activa: "true", vence_en: null }), false, "solo true booleano");
  assert.equal(esPremium({ activa: true, vence_en: "no es fecha" }), false, "fecha inválida: no es premium");
  assert.equal(esPremium({ activa: true, vence_en: "2030-01-01T00:00:00Z" }, Date.parse("2031-01-01")), false);
});

test("por defecto (ADS_ENABLED=false, sin ?ads=1): no se dibuja nada ni ocupa espacio", async () => {
  const h = await app();
  assert.equal(h.win.MPDDAds.ADS_ENABLED, false);
  assert.equal(h.win.MPDDAds.enabled(), false);
  assert.equal(h.win.MPDDAds.createSlot("bar"), null);
  assert.equal(h.win.MPDDAds.createSlot("card"), null);
  assert.equal(slots(h).length, 0);
  assert.equal(h.doc.body.classList.contains("has-ad-bar"), false);
  assert.equal(h.doc.body.style.getPropertyValue("--ad-bar-space"), "");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.net.scripts, [], "sin scripts de terceros");
});

test("sin SDK ni scripts de terceros: todo el código es del propio sitio", () => {
  const html = read("dist/index.html");
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.match(m[1], /^\/[a-z0-9.-]+\.js$/, m[1]);
  const all = read("dist/ads.js") + read("dist/membresia.js");
  assert.doesNotMatch(all, /admob|googlesyndication|doubleclick|adsbygoogle|googletag|<script|createElement\(["']script/i);
  assert.match(read("dist/ads.js"), /const ADS_ENABLED = false;/);
});

test("con ?ads=1: barra fija de 56 px y tarjeta entre las deudas, con 'Espacio publicitario'", async () => {
  const h = await app({ ads: true });
  assert.equal(h.win.MPDDAds.preview, true);
  const bar = h.doc.querySelector(".ad-slot--bar");
  const card = h.doc.querySelector("#cards > .ad-slot--card");
  assert.ok(bar && card);
  assert.equal(bar.textContent, "Espacio publicitario");
  assert.equal(card.textContent, "Espacio publicitario");
  assert.ok(bar.classList.contains("ad-slot--preview"));
  assert.equal(card.previousElementSibling.matches("article.card"), true);
  assert.equal(card.nextElementSibling.matches("article.card"), true, "entre dos tarjetas de deuda");
  assert.equal(h.doc.querySelectorAll("#cards > article.card").length, 3);
  assert.equal(h.doc.body.classList.contains("has-ad-bar"), true);
  const css = read("dist/ads.css");
  assert.match(css, /\.ad-slot\{[^}]*height:56px/);
  assert.match(css, /\.ad-slot--preview\{border:2px dashed/);
  assert.match(css, /\.ad-slot--card\{margin:16px 0/);
  assert.match(css, /body:has\(dialog\[open\]\) \.ad-slot--bar\{visibility:hidden/);
});

test("la tarjeta vuelve a aparecer cuando la lista se redibuja y desaparece con menos de dos deudas", async () => {
  const h = await app({ ads: true });
  h.doc.getElementById("sort").dispatchEvent(new h.win.Event("change"));
  await sleep(80);
  assert.equal(h.doc.querySelectorAll("#cards > .ad-slot--card").length, 1, "una sola tarjeta publicitaria");
  const one = await app({ ads: true, debts: JSON.stringify([debt("d1", "Uno")]) });
  assert.equal(one.doc.querySelectorAll("#cards > .ad-slot--card").length, 0);
  const none = await app({ ads: true, debts: null });
  assert.equal(none.doc.querySelectorAll("#cards > .ad-slot--card").length, 0);
});

test("no se muestra con un cuadro de diálogo abierto (inicio de sesión, registro) ni cerca de los botones", async () => {
  const h = await app({ ads: true });
  const bar = h.doc.querySelector(".ad-slot--bar");
  h.win.MPDDAds.refresh();
  assert.notEqual(bar.style.visibility, "hidden");
  h.doc.querySelector(".account-header .account-enter, .account-header button").click();
  await sleep(80);
  assert.ok(h.doc.querySelector("dialog[open]"));
  assert.equal(bar.style.visibility, "hidden", "oculto con el inicio de sesión abierto");
  // cerca de un botón de acción: 16 px de margen
  h.doc.querySelector("dialog[open]").close();
  await sleep(60);
  const pay = h.doc.querySelector("[data-pay]");
  const realRect = h.win.HTMLElement.prototype.getBoundingClientRect;
  const rectOf = (el, r) => (el === bar ? { top: 500, bottom: 556, left: 0, right: 360, width: 360, height: 56 } : el === pay ? r : realRect.call(el));
  const old = bar.getBoundingClientRect;
  bar.getBoundingClientRect = () => rectOf(bar);
  pay.getBoundingClientRect = () => ({ top: 450, bottom: 490, left: 10, right: 120, width: 110, height: 40 }); // 10 px por encima: demasiado cerca
  h.win.MPDDAds.refresh();
  assert.equal(bar.style.visibility, "hidden", "a menos de 16 px de «Registrar pago»");
  pay.getBoundingClientRect = () => ({ top: 400, bottom: 480, left: 10, right: 120, width: 110, height: 80 }); // 20 px: suficiente
  h.win.MPDDAds.refresh();
  assert.equal(bar.style.visibility, "visible");
  bar.getBoundingClientRect = old;
});

test("las páginas legales y de eliminar cuenta no cargan el espacio publicitario", () => {
  for (const f of ["privacidad.html", "terminos.html", "eliminar-cuenta.html"]) {
    const html = read("dist/" + f);
    assert.doesNotMatch(html, /ads\.js|ads\.css|membresia\.js|ad-slot/, f);
  }
});

test("Premium: no se muestran anuncios ni con ?ads=1 (premium vigente, sin vencimiento); vencida sí", async () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  for (const [row, expectAds] of [
    [{ plan: "premium", activa: true, vence_en: FUTURE }, false],
    [{ plan: "premium", activa: true, vence_en: null }, false],
    [{ plan: "premium", activa: true, vence_en: PAST }, true],
    [{ plan: "gratis", activa: false, vence_en: null }, true],
  ]) {
    const h = await app({ ads: true, storage: Object.assign({}, ES, { "mpdd-membership-v1": JSON.stringify({ uid, row }) }) });
    assert.equal(slots(h).length > 0, expectAds, JSON.stringify(row));
    assert.equal(h.win.MPDDMembership.isPremium(), !expectAds);
  }
});

test("Premium desde la cuenta: lee su fila, apaga los anuncios y la quita al cerrar sesión", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  server.memberships.set(uid, { user_id: uid, plan: "premium", activa: true, vence_en: FUTURE });
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": debts3(), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }), url: "https://app.test/?ads=1" });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "inicio de sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") await h.win.MPDDCloud.resolveLink("merge");
  await waitFor(() => h.win.MPDDMembership.isPremium(), { label: "membresía leída" });
  await sleep(80);
  assert.equal(slots(h).length, 0, "Premium: sin anuncios");
  const until = h.win.MPDDMembership.formatDate(FUTURE);
  assert.match(h.doc.getElementById("membership-plan").textContent, new RegExp("^Premium hasta " + until.replace(/\//g, "\\/") + "$"));
  assert.match(until, /^\d{2}\/\d{2}\/\d{4}$/);
  // el cliente no puede escribir su membresía
  const c = h.win.MPDDCloud;
  assert.equal(typeof c.setMembership, "undefined");
  const writes = server.calls.filter((x) => x[0] === "table" && x[1] === "membresias" && x[2] !== "select");
  assert.equal(writes.length, 0, "el navegador nunca escribe en membresias");
  // cerrar sesión: vuelve el plan gratuito y la copia local desaparece
  await c.signOut({ keepLocal: true, reload: false });
  await waitFor(() => !h.win.MPDDMembership.isPremium(), { label: "sin premium" });
  assert.equal(h.win.localStorage.getItem("mpdd-membership-v1"), null);
  assert.equal(h.doc.getElementById("membership-plan").textContent, "Plan gratuito");
  await sleep(80);
  assert.ok(slots(h).length > 0, "sin Premium vuelven los espacios (modo prueba)");
});

test("Más → Membresía: «Plan gratuito», botón «Quitar anuncios» deshabilitado y «Próximamente» (ES y EN)", async () => {
  for (const [storage, t] of [
    [ES, { h: "Membresía", plan: "Plan gratuito", btn: "Quitar anuncios", soon: "Próximamente", note: "Con Premium podrás usar SolviPath sin anuncios." }],
    [EN, { h: "Membership", plan: "Free plan", btn: "Remove ads", soon: "Coming soon", note: "With Premium you can use SolviPath without ads." }],
  ]) {
    const h = await app({ storage, debts: null });
    const box = h.doc.getElementById("membership-section");
    assert.ok(box, "sección");
    assert.ok(h.doc.querySelector("#view-more .more-settings").contains(box), "dentro de Más");
    assert.equal(box.querySelector("h3").textContent, t.h);
    assert.equal(h.doc.getElementById("membership-plan").textContent, t.plan);
    const btn = h.doc.getElementById("membership-remove-ads");
    assert.equal(btn.textContent, t.btn);
    assert.equal(btn.disabled, true);
    assert.equal(box.querySelector(".membership-soon").textContent, t.soon);
    assert.equal(box.querySelector(".label").textContent, t.note);
  }
  const prem = await app({ storage: Object.assign({}, EN, { "mpdd-membership-v1": JSON.stringify({ uid: "u", row: { plan: "premium", activa: true, vence_en: "2031-03-05T12:00:00Z" } }) }), debts: null });
  assert.match(prem.doc.getElementById("membership-plan").textContent, /^Premium until \d{2}\/\d{2}\/2031$/);
});

test("políticas: sección 'Publicidad y membresía' en ES y EN, sin 'sin anuncios' y con fecha nueva", () => {
  const checks = [
    ["dist/privacidad.html", "en", "13. Advertising and membership", 15],
    ["dist/privacidad.html", "es", "13. Publicidad y membresía", 15],
    ["dist/terminos.html", "en", "8. Advertising and membership", 13],
    ["dist/terminos.html", "es", "8. Publicidad y membresía", 13],
  ];
  for (const [file, lang, title, n] of checks) {
    const doc = new JSDOM(read(file)).window.document;
    const sec = doc.querySelector(`section[lang="${lang}"]`);
    const heads = [...sec.querySelectorAll("h2")].map((h) => h.textContent);
    assert.ok(heads.includes(title), file + " " + title);
    assert.equal(heads.length, n);
    heads.forEach((h, i) => assert.ok(h.startsWith(i + 1 + ". "), "numeración consecutiva: " + h));
    const txt = sec.textContent;
    if (lang === "en") {
      for (const f of ["free to use, with optional paid features", "Google AdMob", "advertising identifiers", "where the law requires it", "optional paid membership that removes ads", "processed by Google Play", "does not store card data", "shown before you buy", "cancel the membership from Google Play"]) assert.ok(txt.includes(f), f);
      assert.ok(txt.includes("Last updated: November 22, 2026."));
    } else {
      for (const f of ["gratuita, con funciones opcionales de pago", "Google AdMob", "identificadores de publicidad", "donde la ley lo exija", "membresía opcional de pago que quita los anuncios", "procesa Google Play", "no guarda datos de tarjetas", "se muestran antes de comprar", "cancelar la membresía desde Google Play"]) assert.ok(txt.includes(f), f);
      assert.ok(txt.includes("Última actualización: 22 de noviembre de 2026."));
    }
    assert.doesNotMatch(txt, /sin anuncios|do not show ads|no mostramos anuncios|ad-free/i);
  }
  assert.ok(read("dist/terminos.html").includes("see Privacy Policy, section 8"), "la referencia a la sección 8 de privacidad sigue siendo correcta");
});

test("versión 2.1, caché v2.1 y archivos nuevos en el service worker; migración de membresías", () => {
  assert.match(read("dist/app-version.js"), /VERSION='2\.1(\.\d+)?'/);
  const sw = read("dist/sw.js");
  assert.match(sw, /CACHE='mpd-cache-v2\.1(\.\d+)?'/);
  for (const f of ["/ads.js", "/ads.css", "/membresia.js"]) assert.ok(sw.includes("'" + f + "'"), f);
  const mig = read("supabase/migrations/20261122000000_v2_1_membresias.sql");
  assert.match(mig, /user_id\s+uuid primary key references auth\.users \(id\) on delete cascade/);
  assert.match(mig, /plan\s+text not null default 'gratis'/);
  assert.match(mig, /activa\s+boolean not null default false/);
  assert.match(mig, /vence_en\s+timestamptz/);
  assert.match(mig, /enable row level security/);
  assert.match(mig, /grant select on public\.membresias to authenticated/);
  assert.doesNotMatch(mig, /grant (insert|update|delete)[^;]*to (anon|authenticated)/i);
  assert.match(mig, /for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\)/);
});
