/* Comprobaciones estáticas: sintaxis de todos los JavaScript y existencia de los
   recursos referenciados por el HTML, el service worker y el manifiesto.
   Ejecutar: node tests/check-resources.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
let failures = 0;
const fail = (m) => {
  failures++;
  console.log("✖ " + m);
};
const ok = (m) => console.log("✔ " + m);

// 1) node --check on every JavaScript file (app, tests).
const jsFiles = [
  ...fs.readdirSync(DIST).filter((f) => f.endsWith(".js")).map((f) => path.join(DIST, f)),
  ...fs.readdirSync(__dirname).filter((f) => f.endsWith(".js")).map((f) => path.join(__dirname, f)),
];
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    fail("sintaxis: " + path.relative(ROOT, f) + "\n" + e.stderr);
  }
}
ok("node --check en " + jsFiles.length + " archivos JavaScript");

// 2) Local resources referenced by each HTML page.
const exists = (p) => fs.existsSync(path.join(DIST, p.replace(/^\//, "").split(/[?#]/)[0]));
for (const page of fs.readdirSync(DIST).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(DIST, page), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]).filter((r) => r !== "/");
  for (const r of refs) if (!exists(r)) fail(page + " referencia un recurso inexistente: " + r);
  ok(page + ": " + refs.length + " referencias locales verificadas");
}

// 3) Service worker assets.
const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
const assets = JSON.parse(sw.match(/const ASSETS=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
for (const a of assets) if (!exists(a)) fail("sw.js ASSETS inexistente: " + a);
const scripts = [...fs.readFileSync(path.join(DIST, "index.html"), "utf8").matchAll(/src="\/([^"]+\.js)"/g)].map((m) => "/" + m[1]);
for (const s of scripts) if (!assets.includes(s)) fail("sw.js no incluye en caché: " + s);
if (!/supabase\.co/.test(sw) && /url\.origin!==location\.origin/.test(sw)) ok("sw.js no intercepta otros orígenes (Supabase) salvo la biblioteca fija");
ok("sw.js: " + assets.length + " recursos presentes; versión " + sw.match(/const CACHE='([^']+)'/)[1]);

// 4) Manifest icons.
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.webmanifest"), "utf8"));
for (const i of manifest.icons) if (!exists(i.src)) fail("manifiesto: ícono inexistente " + i.src);
ok("manifiesto: " + manifest.icons.length + " íconos presentes");

// 5) Same pinned supabase-js file and SRI in page and service worker.
const cloud = fs.readFileSync(path.join(DIST, "cloud-sync.js"), "utf8");
const lib = cloud.match(/LIB_URL = "([^"]+)"/)[1];
if (!sw.includes(lib)) fail("sw.js y cloud-sync.js usan versiones distintas de supabase-js");
if (!/@\d+\.\d+\.\d+\//.test(lib)) fail("supabase-js sin versión fija");
if (!/LIB_SRI = "sha384-/.test(cloud)) fail("supabase-js sin integridad SRI");
ok("supabase-js fijado: " + lib);

// 6) No secrets in the repository.
const secretPatterns = [/service_role/i, /sb_secret_[A-Za-z0-9]/, /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\./];
const scan = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.name === "node_modules" || f.name === ".git") continue;
    if (f.isDirectory()) scan(p);
    else if (/\.(js|ts|html|json|sql|md|toml|webmanifest|css)$/.test(f.name)) {
      const text = fs.readFileSync(p, "utf8");
      for (const re of secretPatterns) {
        const m = text.match(re);
        if (!m) continue;
        // Mentions in comments/docs/detectors are fine; real values are not.
        const allowed = /service_role/i.test(m[0]) && !/=\s*["']eyJ/.test(text);
        if (!allowed) fail("posible secreto en " + path.relative(ROOT, p) + ": " + m[0].slice(0, 20) + "…");
      }
    }
  }
};
scan(ROOT);
ok("sin claves secretas en el repositorio (patrones conocidos)");

if (failures) {
  console.log("\n" + failures + " problema(s).");
  process.exit(1);
}
console.log("\nTodo correcto.");
