/* Loads dist/index.html with all its scripts in jsdom (DOM simulado).
   Every network path is replaced by spies so tests can assert that no request happens. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { createFakeLib } = require("./fake-supabase");

const DIST = path.join(__dirname, "..", "dist");
const read = (f) => fs.readFileSync(path.join(DIST, f), "utf8");
const PLACEHOLDER_CONFIG = 'window.MPDD_CONFIG=Object.freeze({supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseKey:"TU_CLAVE_PUBLICA",googleEnabled:false});';
const TEST_CONFIG = 'window.MPDD_CONFIG=Object.freeze({supabaseUrl:"https://proyecto-prueba.supabase.co",supabaseKey:"sb_publishable_PRUEBA123",googleEnabled:false});';

const open = new Set();
async function closeAll() {
  // Let pending timers/microtasks of the app settle before tearing the window down.
  await new Promise((r) => setTimeout(r, 60));
  for (const w of open) w.close();
  open.clear();
}

function buildHtml(configSource) {
  let html = read("index.html");
  const deferred = [];
  html = html.replace(/<script src="\/([^"]+)"( defer)?><\/script>/g, (_, file, defer) => {
    const code = file === "config.js" ? configSource : read(file);
    const tag = "<script>" + code.replace(/<\/script/gi, "<\\/script") + "\n</script>";
    if (defer) {
      deferred.push(tag);
      return "";
    }
    return tag;
  });
  html = html.replace(/<link rel="stylesheet"[^>]*>/g, "");
  return html.replace("</body>", deferred.join("") + "</body>");
}

/**
 * options:
 *  storage: initial localStorage entries
 *  config: "placeholder" | "test"
 *  server: FakeServer (enables window.supabase fake when config is "test")
 *  online: initial navigator.onLine
 */
function load(options = {}) {
  const net = { fetch: [], xhr: [], scripts: [], createClient: 0, beacons: [] };
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e && (e.stack || e.message || e))));
  const consoleLogs = [];
  for (const m of ["log", "info", "warn", "error", "debug"]) vc.on(m, (...a) => consoleLogs.push([m, a.map(String).join(" ")]));
  let online = options.online !== false;
  let lib = null;
  const html = buildHtml(options.config === "test" ? TEST_CONFIG : PLACEHOLDER_CONFIG);
  const dom = new JSDOM(html, {
    url: options.url || "https://app.test/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      for (const [k, v] of Object.entries(options.storage || {})) win.localStorage.setItem(k, v);
      win.fetch = (...a) => {
        net.fetch.push(String(a[0]));
        return Promise.reject(new TypeError("network disabled in tests"));
      };
      win.XMLHttpRequest = function () {
        net.xhr.push("xhr");
        throw new Error("network disabled in tests");
      };
      win.navigator.sendBeacon = (u) => {
        net.beacons.push(u);
        return false;
      };
      Object.defineProperty(win.navigator, "onLine", { configurable: true, get: () => online });
      if (!win.crypto || !win.crypto.randomUUID) {
        const nodeCrypto = require("crypto");
        Object.defineProperty(win, "crypto", { configurable: true, value: { randomUUID: () => nodeCrypto.randomUUID(), getRandomValues: (a) => nodeCrypto.getRandomValues(a), subtle: nodeCrypto.webcrypto.subtle } });
      }
      win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      win.scrollTo = () => {};
      win.HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
      win.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
        this.dispatchEvent(new win.Event("close"));
      };
      if (!win.Blob.prototype.text)
        win.Blob.prototype.text = function () {
          return new Promise((resolve, reject) => {
            const r = new win.FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error);
            r.readAsText(this);
          });
        };
      win.URL.createObjectURL = () => "blob:test";
      win.URL.revokeObjectURL = () => {};
      // Record any script the app tries to add (e.g. the supabase-js CDN file).
      const append = win.HTMLHeadElement.prototype.append;
      win.HTMLHeadElement.prototype.append = function (...nodes) {
        for (const n of nodes) if (n && n.tagName === "SCRIPT" && n.src) net.scripts.push({ src: n.src, integrity: n.integrity, crossOrigin: n.crossOrigin });
        return append.apply(this, nodes);
      };
      if (options.server) {
        lib = createFakeLib(options.server, win);
        win.supabase = {
          createClient: (...a) => {
            net.createClient++;
            return lib.createClient(...a);
          },
        };
      }
    },
  });
  const win = dom.window;
  open.add(win);
  return {
    dom,
    win,
    doc: win.document,
    net,
    errors,
    consoleLogs,
    lib,
    setOnline(v) {
      online = v;
      win.dispatchEvent(new win.Event(v ? "online" : "offline"));
    },
    async close() {
      // Let pending app work settle, then stop this "device". closeAll() also runs after each test.
      await new Promise((r) => setTimeout(r, 60));
      open.delete(win);
      win.close();
    },
    debts() {
      return JSON.parse(win.localStorage.getItem("nando-deudas-v1") || "[]");
    },
  };
}

async function waitFor(fn, { timeout = 4000, step = 10, label = "condición" } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("Tiempo agotado esperando: " + label + (last instanceof Error ? " (" + last.message + ")" : ""));
}
const sleep = (n) => new Promise((r) => setTimeout(r, n));

function debt(id, name, extra = {}) {
  return Object.assign({ id, history: [], name, balance: 100, initial: 200, limit: null, rate: 20, currency: "USD", due: "15", source: "Actualizado manualmente" }, extra);
}
function session(email, id) {
  return JSON.stringify({ access_token: "fake-token-" + id, user: { id, email } });
}
async function addDebtViaForm(h, name, balance = "50") {
  const { doc, win } = h;
  doc.getElementById("add").click();
  doc.getElementById("name").value = name;
  doc.getElementById("balance").value = balance;
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
}

module.exports = { load, closeAll, waitFor, sleep, debt, session, addDebtViaForm, buildHtml };
