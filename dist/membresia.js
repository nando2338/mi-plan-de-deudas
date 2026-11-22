/* SolviPath 2.1 — membresía Premium (solo base y lógica; todavía no hay compra).
   - esPremium(fila): true si activa = true y vence_en es nulo o futuro.
   - Lee la fila propia de public.membresias (RLS: solo lectura) cuando hay sesión.
   - Guarda una copia mínima en este dispositivo para no mostrar anuncios sin conexión.
   - Sección "Membresía" en Más: "Plan gratuito" o "Premium hasta DD/MM/AAAA" y el botón
     "Quitar anuncios" deshabilitado con "Próximamente". */
(function () {
  "use strict";
  const KEY = "mpdd-membership-v1";
  const ls = (() => {
    try {
      return window.localStorage;
    } catch (_) {
      return null;
    }
  })();

  function esPremium(fila, ahora) {
    if (!fila || fila.activa !== true) return false;
    if (fila.vence_en === null || fila.vence_en === undefined || fila.vence_en === "") return true;
    const t = Date.parse(fila.vence_en);
    return Number.isFinite(t) && t > (ahora === undefined ? Date.now() : ahora);
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function fecha(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  let current = null; // { uid, row }
  try {
    const raw = ls && JSON.parse(ls.getItem(KEY) || "null");
    if (raw && typeof raw.uid === "string" && raw.row && typeof raw.row === "object") current = { uid: raw.uid, row: { plan: String(raw.row.plan || ""), activa: raw.row.activa === true, vence_en: raw.row.vence_en || null } };
  } catch (_) {}

  function save() {
    try {
      if (!ls) return;
      if (current) ls.setItem(KEY, JSON.stringify(current));
      else ls.removeItem(KEY);
    } catch (_) {}
  }
  function changed() {
    render();
    try {
      window.dispatchEvent(new CustomEvent("mpdd-membership"));
    } catch (_) {}
  }
  function isPremium() {
    return !!current && esPremium(current.row);
  }

  /* ---------- sección en Más ---------- */
  let planLine = null;
  function render() {
    if (!planLine) return;
    planLine.textContent = "";
    if (isPremium()) {
      const until = current.row.vence_en ? fecha(current.row.vence_en) : "";
      const a = document.createElement("span");
      a.textContent = until ? "Premium hasta" : "Premium";
      planLine.append(a);
      if (until) {
        const b = document.createElement("span");
        b.textContent = " " + until;
        planLine.append(b);
      }
    } else {
      const a = document.createElement("span");
      a.textContent = "Plan gratuito";
      planLine.append(a);
    }
  }
  function build() {
    const more = document.querySelector("#view-more .more-settings");
    if (!more || document.getElementById("membership-section")) return;
    const box = document.createElement("div");
    box.id = "membership-section";
    const h = document.createElement("h3");
    h.textContent = "Membresía";
    planLine = document.createElement("p");
    planLine.id = "membership-plan";
    planLine.className = "membership-plan";
    const note = document.createElement("p");
    note.className = "label";
    note.textContent = "Con Premium podrás usar SolviPath sin anuncios.";
    const row = document.createElement("div");
    row.className = "membership-row";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "membership-remove-ads";
    btn.disabled = true;
    btn.textContent = "Quitar anuncios";
    const soon = document.createElement("span");
    soon.className = "membership-soon";
    soon.textContent = "Próximamente";
    row.append(btn, soon);
    box.append(h, planLine, note, row);
    const account = document.getElementById("account-root");
    const anchor = account && more.contains(account) ? account.closest(".more-settings > *") : null;
    if (anchor && anchor.nextSibling) more.insertBefore(box, anchor.nextSibling);
    else more.append(box);
    render();
  }

  /* ---------- sincronización con la cuenta ---------- */
  let lastUser = null;
  let inflight = false;
  async function refresh() {
    const C = window.MPDDCloud;
    if (!C || typeof C.fetchMembership !== "function" || inflight) return;
    inflight = true;
    try {
      const r = await C.fetchMembership();
      if (r && r.ok) {
        current = r.row ? { uid: r.userId, row: { plan: String(r.row.plan || ""), activa: r.row.activa === true, vence_en: r.row.vence_en || null } } : null;
        save();
        changed();
      }
    } finally {
      inflight = false;
    }
  }
  function onStatus(st) {
    const uid = st && st.userId ? st.userId : null;
    if (uid !== lastUser) {
      lastUser = uid;
      if (!uid || (current && current.uid !== uid)) {
        // Sin sesión o con otra cuenta: la copia de este dispositivo ya no vale.
        if (current) {
          current = null;
          save();
          changed();
        }
      }
    }
    if (uid && st.state === "synced") refresh();
  }
  if (window.MPDDCloud && typeof window.MPDDCloud.onChange === "function") window.MPDDCloud.onChange(onStatus);
  window.addEventListener("online", refresh);

  window.MPDDMembership = Object.freeze({ esPremium, isPremium, formatDate: fecha, refresh, KEY });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
