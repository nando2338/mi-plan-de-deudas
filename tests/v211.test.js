/* Versión 2.1.1: menú del avatar en móvil. DOM simulado (jsdom): comportamiento de abrir/cerrar y ajuste
   dentro de la pantalla; el diseño real (360, 390 y 430 px) se comprobó con capturas en Chrome. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { load, closeAll, waitFor, sleep, debt, session } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

async function signedIn() {
  const server = new FakeServer();
  const uid = server.addUser("persona.con.un.correo.muy.largo@ejemplo.test", "x12345678");
  const h = load({ config: "test", server, storage: { "deudas-lang-v1": "es", "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("persona.con.un.correo.muy.largo@ejemplo.test", uid), "nando-deudas-v1": JSON.stringify([debt("d1", "Uno")]) } });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "inicio de sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") await h.win.MPDDCloud.resolveLink("merge");
  await waitFor(() => !h.doc.querySelector(".account-avatar").hidden, { label: "avatar" });
  return h;
}

test("menú del avatar: se abre, y se cierra al tocar fuera, al elegir una opción y con Escape", async () => {
  const h = await signedIn();
  const avatar = h.doc.querySelector(".account-avatar");
  const menu = h.doc.getElementById("account-menu");
  const open = () => avatar.click();
  assert.equal(menu.hidden, true);
  open();
  assert.equal(menu.hidden, false);
  assert.equal(avatar.getAttribute("aria-expanded"), "true");
  assert.match(menu.querySelector(".account-menu-email").textContent, /persona\.con\.un\.correo\.muy\.largo@ejemplo\.test/);
  // tocar fuera
  h.doc.querySelector("main, body").dispatchEvent(new h.win.MouseEvent("click", { bubbles: true }));
  assert.equal(menu.hidden, true, "se cierra al tocar fuera");
  // Escape
  open();
  h.doc.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(menu.hidden, true, "se cierra con Escape");
  assert.equal(avatar.getAttribute("aria-expanded"), "false");
  // elegir una opción: Mi cuenta
  open();
  [...menu.querySelectorAll("button")].find((b) => b.textContent === "Mi cuenta").click();
  assert.equal(menu.hidden, true, "se cierra al elegir «Mi cuenta»");
  // elegir una opción: Cerrar sesión
  open();
  [...menu.querySelectorAll("button")].find((b) => b.textContent === "Cerrar sesión").click();
  assert.equal(menu.hidden, true, "se cierra al elegir «Cerrar sesión»");
  // tocar el propio avatar alterna
  h.doc.querySelector("dialog[open]") && h.doc.querySelector("dialog[open]").close();
  open();
  assert.equal(menu.hidden, false);
  open();
  assert.equal(menu.hidden, true);
});

test("menú del avatar: si el panel quedara fuera de la pantalla, se ajusta para no salirse", async () => {
  const h = await signedIn();
  const avatar = h.doc.querySelector(".account-avatar");
  const menu = h.doc.getElementById("account-menu");
  Object.defineProperty(h.doc.documentElement, "clientWidth", { value: 430, configurable: true });
  // Caso 1: se sale por la izquierda (avatar pegado al borde izquierdo): se ancla con left:0 y, si hace falta, se desplaza.
  let calls = 0;
  menu.getBoundingClientRect = () => {
    calls += 1;
    const left = menu.style.left === "0px" || menu.style.left === "0" ? 20 + (menu.style.transform ? parseInt(menu.style.transform.replace(/[^-\d]/g, ""), 10) : 0) : -160;
    return { left, right: left + 280, top: 100, bottom: 260, width: 280, height: 160 };
  };
  avatar.click();
  assert.match(menu.style.left, /^0(px)?$/, "se ancla a la izquierda");
  assert.equal(menu.style.right, "auto");
  assert.ok(calls >= 2);
  avatar.click();
  // Caso 2: se sale por la derecha
  menu.getBoundingClientRect = () => ({ left: 200, right: 480, top: 100, bottom: 260, width: 280, height: 160 });
  avatar.click();
  assert.equal(menu.style.transform, "translateX(-62px)", "se desplaza para quedar a 12 px del borde");
});

test("CSS móvil: avatar y selector de idioma en la fila superior; panel anclado a la derecha y con ancho limitado", () => {
  const css = read("dist/account.css");
  const block = css.slice(css.indexOf("2.1.1:"));
  assert.match(block, /\.account-menu\{width:min\(280px,calc\(100vw - 24px\)\);min-width:0;max-width:none;right:0;left:auto;z-index:200/);
  assert.match(block, /overflow-wrap:anywhere/);
  assert.match(block, /header \.top \.brand\{order:0;flex:1 1 0;min-width:0\}/);
  assert.match(block, /header \.top \.language-control\{order:1;flex:none;margin-left:0\}/);
  assert.match(block, /header \.top \.account-header\{order:2;flex:none;margin-left:0\}/);
  assert.match(block, /header \.top \.private\{order:3;flex:0 0 100%\}/);
  assert.match(css, /\.account-header\{position:relative;/);
  assert.match(css, /\.account-menu\{position:absolute;[^}]*top:calc\(100% \+ 8px\)/);
  assert.match(css, /\.account-avatar\{width:40px;height:40px;border-radius:50%/);
});

test("versión 2.1.1 y caché v2.1.1 del service worker", () => {
  assert.match(read("dist/app-version.js"), /VERSION='(2\.1\.1|3\.\d(\.\d+)?)'/);
  assert.match(read("dist/sw.js"), /CACHE='mpd-cache-v(2\.1\.1|3\.\d(\.\d+)?)'/);
});
