/* Versión 2.0: encabezado más grande, políticas legales finales, eliminar cuenta y casilla de 18 años.
   DOM simulado (jsdom) y servidor falso; sin red real. */
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

/* ---------- páginas públicas ---------- */
function page(file, { lang = "es", fetchImpl } = {}) {
  const html = read("dist/" + file).replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { url: "https://www.solvipath.com/" + file, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.localStorage.setItem("deudas-lang-v1", lang);
  w.MPDD_CONFIG = { supabaseUrl: "https://abcdefghijkl.supabase.co", supabaseKey: "sb_publishable_testtesttesttesttest" };
  w.fetch = fetchImpl || (() => Promise.resolve({ ok: true }));
  w.eval(read("dist/legal.js"));
  if (file === "eliminar-cuenta.html") w.eval(read("dist/eliminar-cuenta.js"));
  return dom;
}
const visible = (dom) => [...dom.window.document.querySelectorAll("main > section[lang]")].filter((s) => !s.hidden);

test("privacidad y términos: textos finales en inglés y español, sin borradores ni marcadores", () => {
  for (const [file, h2, en, es, key] of [
    ["privacidad.html", 15, "Privacy Policy — SolviPath", "Política de privacidad — SolviPath", "Last updated: November 22, 2026."],
    ["terminos.html", 13, "Terms of Use — SolviPath", "Términos de uso — SolviPath", "Last updated: November 22, 2026."],
  ]) {
    const html = read("dist/" + file);
    assert.doesNotMatch(html, /BORRADOR|DRAFT|<mark|\[NOMBRE|\[CORREO|\[REGI|\[CONFIRMAR|abogado/i, file);
    const dom = new JSDOM(html);
    const en1 = dom.window.document.querySelector('section[lang="en"]');
    const es1 = dom.window.document.querySelector('section[lang="es"]');
    assert.equal(en1.querySelector("h1").textContent, en);
    assert.equal(es1.querySelector("h1").textContent, es);
    assert.equal(en1.querySelectorAll("h2").length, h2, file + " EN");
    assert.equal(es1.querySelectorAll("h2").length, h2, file + " ES");
    assert.ok(en1.textContent.includes(key));
    assert.ok(es1.textContent.includes("Última actualización: 22 de noviembre de 2026."));
    assert.ok(en1.textContent.includes("privacy@solvipath.com") && es1.textContent.includes("privacy@solvipath.com"));
    assert.ok(en1.textContent.includes("FixRight Home Renovations LLC") && es1.textContent.includes("FixRight Home Renovations LLC"));
  }
  const p = new JSDOM(read("dist/privacidad.html")).window.document;
  assert.ok(p.querySelector('section[lang="en"]').textContent.includes("and we do not sell your data."));
  assert.ok(p.querySelector('section[lang="es"]').textContent.includes("Ley 1581 de 2012"));
  assert.ok(p.querySelector('section[lang="en"]').textContent.includes("Global Privacy Control"));
  const t = new JSDOM(read("dist/terminos.html")).window.document;
  assert.ok(t.querySelector('section[lang="en"]').textContent.includes("US$100, whichever is greater"));
  assert.ok(t.querySelector('section[lang="es"]').textContent.includes("lo que sea mayor"));
});

test("páginas legales: idioma de la app por defecto, selector con inglés primero y cambio de idioma", () => {
  for (const file of ["privacidad.html", "terminos.html", "eliminar-cuenta.html"]) {
    const es = page(file, { lang: "es" });
    assert.equal(es.window.document.documentElement.lang, "es");
    assert.equal(visible(es).length, 1);
    assert.equal(visible(es)[0].lang, "es", file);
    const buttons = [...es.window.document.querySelectorAll(".langs button")];
    assert.deepEqual(buttons.map((b) => b.textContent), ["English", "Español"], "inglés primero en el selector");
    buttons[0].click();
    assert.equal(visible(es)[0].lang, "en");
    assert.equal(es.window.document.documentElement.lang, "en");
    assert.equal(es.window.localStorage.getItem("deudas-lang-v1"), "es", "no cambia el idioma guardado de la app");
    const en = page(file, { lang: "en" });
    assert.equal(visible(en)[0].lang, "en");
    assert.match(en.window.document.title, /SolviPath|Delete|Privacy|Terms/);
    assert.ok(en.window.document.querySelector(".legal-brand img"), "logo");
    assert.match(en.window.document.querySelector(".legal-brand").textContent, /SolviPath/);
  }
});

test("eliminar-cuenta.html: guarda la solicitud y muestra siempre el mismo mensaje", async () => {
  const calls = [];
  const dom = page("eliminar-cuenta.html", {
    lang: "es",
    fetchImpl: (url, opts) => {
      calls.push({ url, opts });
      return Promise.resolve({ ok: true, status: 201 });
    },
  });
  const w = dom.window;
  const form = w.document.getElementById("delete-form-es");
  const msg = w.document.getElementById("delete-msg-es");
  // correo inválido: no se envía
  w.document.getElementById("delete-email-es").value = "no-es-correo";
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(calls.length, 0);
  assert.match(msg.textContent, /correo electrónico válido/);
  // trampa para robots: mensaje de éxito idéntico pero no se guarda nada
  w.document.getElementById("delete-email-es").value = "bot@ejemplo.test";
  w.document.getElementById("delete-site-es").value = "http://spam";
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(calls.length, 0);
  assert.equal(msg.textContent, "Recibimos tu solicitud; la procesaremos en máximo 30 días.");
  w.document.getElementById("delete-site-es").value = "";
  // correo válido
  w.document.getElementById("delete-email-es").value = "  Persona@Ejemplo.TEST ";
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://abcdefghijkl.supabase.co/rest/v1/solicitudes_eliminacion");
  assert.equal(calls[0].opts.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].opts.body), { correo: "persona@ejemplo.test", idioma: "es" });
  assert.equal(calls[0].opts.headers.apikey, "sb_publishable_testtesttesttesttest");
  assert.equal(calls[0].opts.headers.Prefer, "return=minimal");
  assert.equal(msg.textContent, "Recibimos tu solicitud; la procesaremos en máximo 30 días.");
  assert.doesNotMatch(msg.textContent, /existe|no existe|exist/i, "no confirma si el correo tiene cuenta");
  assert.ok(w.document.body.textContent.includes("privacy@solvipath.com"));
  // inglés
  const f2 = w.document.getElementById("delete-form");
  w.document.getElementById("delete-email").value = "otra@ejemplo.test";
  f2.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.equal(w.document.getElementById("delete-msg").textContent, "We received your request; we will process it within 30 days at most.");
  assert.deepEqual(JSON.parse(calls[1].opts.body), { correo: "otra@ejemplo.test", idioma: "en" });
});

test("eliminar-cuenta.html: si el servidor falla, avisa del error sin guardar nada más", async () => {
  const dom = page("eliminar-cuenta.html", { lang: "es", fetchImpl: () => Promise.resolve({ ok: false, status: 500 }) });
  const w = dom.window;
  w.document.getElementById("delete-email-es").value = "persona@ejemplo.test";
  w.document.getElementById("delete-form-es").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.match(w.document.getElementById("delete-msg-es").textContent, /No pudimos enviar la solicitud/);
  assert.equal(w.document.getElementById("delete-send-es").disabled, false);
});

/* ---------- en la app ---------- */
test("registro: casilla de 18 años con enlaces, en español y en inglés; sin marcarla no se crea la cuenta", async () => {
  for (const [storage, text, err] of [
    [ES, "Acepto los Términos de uso y la Política de privacidad y confirmo que tengo 18 años o más.", /Términos de uso y la Política de privacidad, y confirmar que tienes 18 años o más/],
    [EN, "I accept the Terms of Use and Privacy Policy and confirm I am 18 or older.", /accept the Terms of Use and Privacy Policy, and confirm you are 18 or older/],
  ]) {
    const server = new FakeServer();
    const h = load({ config: "test", server, storage });
    await sleep(50);
    h.doc.querySelector(".account-header .account-enter, .account-header button").click();
    await sleep(60);
    [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => /^(Crear cuenta|Create account)$/.test(b.textContent)).click();
    await sleep(60);
    const label = h.doc.querySelector(".account-accept");
    assert.equal(label.textContent.replace(/\s+/g, " ").trim(), text);
    assert.ok(label.querySelector('a[href="/terminos.html"]') && label.querySelector('a[href="/privacidad.html"]'));
    assert.equal(h.doc.getElementById("acc-accept").checked, false);
    h.doc.getElementById("acc-signup-email").value = "nuevo@ejemplo.test";
    h.doc.getElementById("acc-signup-password").value = h.doc.getElementById("acc-signup-password2").value = "suficiente123";
    const form = h.doc.querySelector("#account-auth-dialog form");
    form.dispatchEvent(new h.win.Event("submit", { cancelable: true }));
    await sleep(30);
    assert.match(form.querySelector(".account-msg").textContent, err);
    assert.equal(server.users.size, 0, "sin casilla no se crea la cuenta");
    h.doc.getElementById("acc-accept").checked = true;
    form.dispatchEvent(new h.win.Event("submit", { cancelable: true }));
    await waitFor(() => server.users.size === 1, { label: "cuenta creada con la casilla" });
  }
});

test("enlaces legales: pie del inicio de sesión y panel Más, en los dos idiomas", async () => {
  for (const [storage, names, foot] of [
    [ES, ["Política de privacidad", "Términos de uso", "Eliminar cuenta y datos"], "© FixRight Home Renovations LLC · SolviPath"],
    [EN, ["Privacy Policy", "Terms of Use", "Delete account and data"], "© FixRight Home Renovations LLC · SolviPath"],
  ]) {
    const h = load({ config: "test", server: new FakeServer(), storage });
    await sleep(50);
    const panel = h.doc.querySelector("#account-root .legal-links");
    assert.ok(panel, "panel Más");
    assert.deepEqual([...panel.querySelectorAll("a")].map((a) => a.getAttribute("href")), ["/privacidad.html", "/terminos.html", "/eliminar-cuenta.html"]);
    assert.deepEqual([...panel.querySelectorAll("a")].map((a) => a.textContent), names);
    h.doc.querySelector(".account-header .account-enter").click();
    const dlg = h.doc.getElementById("account-auth-dialog");
    assert.equal(dlg.querySelector(".auth-copyright").textContent, foot);
    assert.deepEqual([...dlg.querySelectorAll(".legal-links a")].map((a) => a.getAttribute("href")), ["/privacidad.html", "/terminos.html", "/eliminar-cuenta.html"]);
  }
});

async function linkedDevice(server, email, uid, storage = {}) {
  const h = load({ config: "test", server, storage: Object.assign({}, ES, storage, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session(email, uid) }) });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "inicio de sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") {
    await h.win.MPDDCloud.resolveLink("merge");
    await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "vinculación" });
  }
  return h;
}

test("eliminar cuenta: función de servidor, sesión cerrada, copia local borrada y confirmación", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const h = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]), "deudas-budget-v1": JSON.stringify({ income: 1, essential: 0, fixed: 0, variable: 0, minimums: 0, extra: 0 }) });
  await waitFor(() => server.rowsFor(uid).length === 1);
  const dlg = h.doc.getElementById("account-dialog");
  const del = [...h.doc.querySelectorAll("#account-root button")].find((b) => b.textContent === "Eliminar cuenta y datos");
  assert.ok(del, "botón Eliminar cuenta y datos");
  del.click();
  assert.match(dlg.textContent, /gastos fijos, preferencias, sugerencias asociadas, notificaciones y tu cuenta/);
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Continuar").click();
  const final = [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Eliminar definitivamente");
  assert.equal(final.disabled, true);
  const word = h.doc.getElementById("acc-delete-word");
  word.value = "equivocado";
  word.dispatchEvent(new h.win.Event("input"));
  assert.equal(final.disabled, true, "otra palabra no habilita el botón");
  word.value = "ELIMINAR";
  word.dispatchEvent(new h.win.Event("input"));
  assert.equal(final.disabled, false);
  final.click();
  await waitFor(() => /Tu cuenta y tus datos se eliminaron/.test(dlg.textContent), { label: "confirmación" });
  assert.match(dlg.textContent, /Se cerró tu sesión y se borró la copia de este dispositivo/);
  assert.equal(server.users.size, 0, "usuario de Auth borrado por la función de servidor");
  assert.equal(server.rowsFor(uid).length, 0, "sin deudas en la nube");
  await waitFor(() => h.win.MPDDCloud.status().state === "signedOut", { label: "sesión cerrada" });
  assert.equal(h.debts().length, 0, "copia local borrada");
  assert.equal(h.win.localStorage.getItem("deudas-budget-v1"), null);
  assert.equal(h.win.localStorage.getItem("mpdd-push-device-v1"), null);
  assert.ok([...dlg.querySelectorAll("button")].find((b) => b.textContent === "Entendido"), "botón para terminar");
  assert.equal(dlg.querySelectorAll("button").length, 1, "no pregunta qué hacer con la copia local");
});

test("eliminar cuenta: sin función de servidor desplegada avisa y pide escribir a privacy@solvipath.com", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  server.functionDeployed = false;
  const h = await linkedDevice(server, "a@ejemplo.test", uid, { "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) });
  const dlg = h.doc.getElementById("account-dialog");
  [...h.doc.querySelectorAll("#account-root button")].find((b) => b.textContent === "Eliminar cuenta y datos").click();
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Continuar").click();
  const word = h.doc.getElementById("acc-delete-word");
  word.value = "ELIMINAR";
  word.dispatchEvent(new h.win.Event("input"));
  [...dlg.querySelectorAll("button")].find((b) => b.textContent === "Eliminar definitivamente").click();
  await waitFor(() => /privacy@solvipath\.com/.test(dlg.textContent), { label: "aviso parcial" });
  assert.match(dlg.textContent, /la cuenta no se pudo eliminar automáticamente/);
});

/* ---------- encabezado, versión, caché y base de datos ---------- */
test("encabezado: tamaños nuevos en celular y escritorio, lema que pasa a dos líneas y estado legible", () => {
  const css = read("dist/account.css");
  const block = css.slice(css.indexOf("2.0: encabezado"));
  assert.match(block, /header \.brand i\{width:44px;height:44px/);
  assert.match(block, /header \.brand-name\{font-size:22px;font-weight:800;color:#fff/);
  assert.match(block, /header \.brand-tagline\{font-size:13px[^}]*color:#d6edb2[^}]*white-space:normal/);
  assert.match(block, /header \.top \.private\{font-size:12px/);
  assert.match(block, /min-width:721px\)\{header \.brand i\{width:52px;height:52px[^}]*\}header \.brand-name\{font-size:26px\}header \.brand-tagline\{font-size:14px\}/);
  // contraste mínimo 4.5:1 del lema (#d6edb2) y del estado (#dbe9df) sobre #0b1f1d
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  assert.ok(ratio("#d6edb2", "#0b1f1d") >= 4.5);
  assert.ok(ratio("#dbe9df", "#0b1f1d") >= 4.5);
});

test("versión 2.0 en la app y en el caché; el service worker conoce las tres páginas legales", () => {
  assert.match(read("dist/app-version.js"), /VERSION='2\.\d'/);
  const sw = read("dist/sw.js");
  assert.match(sw, /CACHE='mpd-cache-v2\.\d'/);
  for (const f of ["/privacidad.html", "/terminos.html", "/eliminar-cuenta.html", "/eliminar-cuenta.js", "/legal.css", "/legal.js"]) assert.ok(sw.includes("'" + f + "'"), f);
  assert.match(sw, /NETWORK_FIRST=\[[^\]]*'\/eliminar-cuenta\.html'/);
});

test("base de datos: solicitudes solo se insertan, borrado en cascada y función con JWT propio", () => {
  const mig = read("supabase/migrations/20261120000000_v2_0_eliminacion.sql");
  assert.match(mig, /create table if not exists public\.solicitudes_eliminacion/);
  assert.match(mig, /enable row level security/);
  assert.match(mig, /revoke all on public\.solicitudes_eliminacion from public, anon, authenticated/);
  assert.match(mig, /grant insert \(correo, idioma\) on public\.solicitudes_eliminacion to anon, authenticated/);
  assert.doesNotMatch(mig, /for select|grant select/i, "nadie puede leer desde el navegador");
  assert.match(mig, /sugerencias_user_id_fkey[^;]*on delete cascade/);
  const fn = read("supabase/functions/delete-account/index.ts");
  assert.match(fn, /auth\.getUser\(token\)/);
  assert.match(fn, /deleteUser\(uid\)/);
  assert.match(fn, /confirm !== true/);
  assert.match(fn, /gastos_fijos/);
  assert.doesNotMatch(read("dist/eliminar-cuenta.js"), /service_role|SERVICE_ROLE/i, "la clave de servicio nunca va en el navegador");
  assert.match(read("supabase/config.toml"), /\[functions\.delete-account\]\s*\nverify_jwt = false/);
});
