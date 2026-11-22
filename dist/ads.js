/* SolviPath 2.1 — espacio publicitario (AdSlot). SIN redes de anuncios: no hay SDK ni scripts de terceros.
   - ADS_ENABLED = false (por defecto): no se dibuja nada y no ocupa espacio.
   - Con ?ads=1 en la URL (solo para revisar el diseño) se dibuja una caja punteada
     con el texto "Espacio publicitario".
   - Nunca se muestra con Premium, con un cuadro de diálogo abierto (inicio de sesión, registro,
     recuperar contraseña, agregar/pagar/eliminar), ni a menos de 16 px de los botones
     "Agregar deuda", "Registrar pago"/"Pagar" y "Eliminar".
   - Las páginas /privacidad.html, /terminos.html y /eliminar-cuenta.html no cargan este archivo.
   Uso: MPDDAds.createSlot("bar" | "card") devuelve el elemento o null si no debe mostrarse. */
(function () {
  "use strict";
  const ADS_ENABLED = false;
  const SLOT_HEIGHT = 56; // entre 50 y 60 px
  const GAP = 16; // distancia mínima a los botones de acción
  const preview = /[?&]ads=1(?:&|$)/.test(location.search || "");

  const isPremium = () => !!(window.MPDDMembership && window.MPDDMembership.isPremium());
  const enabled = () => (ADS_ENABLED || preview) && !isPremium();
  const lang = () => (document.documentElement.lang === "en" ? "en" : "es");

  function createSlot(kind) {
    if (!enabled()) return null;
    const el = document.createElement("div");
    el.className = "ad-slot ad-slot--" + (kind === "card" ? "card" : "bar") + (preview ? " ad-slot--preview" : "");
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", lang() === "en" ? "Advertising" : "Publicidad");
    el.dataset.adSlot = kind === "card" ? "card" : "bar";
    if (preview) {
      const t = document.createElement("span");
      t.textContent = "Espacio publicitario";
      el.append(t);
    }
    return el;
  }

  /* ---------- barra fija encima de la navegación inferior ---------- */
  let bar = null;
  const ACTIONS = /^(agregar deuda|add debt|registrar pago|record payment|pagar|pay|eliminar|delete|sí, eliminar|yes, delete)\b/i;
  function actionButtons() {
    const out = [];
    for (const b of document.querySelectorAll("button, a.button")) {
      if (b.closest(".ad-slot") || b.disabled) continue;
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (b.id === "add" || b.hasAttribute("data-pay") || b.hasAttribute("data-delete") || b.hasAttribute("data-confirm-delete") || ACTIONS.test((b.textContent || "").trim())) out.push(r);
    }
    return out;
  }
  function placeBar() {
    const nav = document.querySelector(".bottom-nav");
    const offset = nav ? nav.getBoundingClientRect().height : 0;
    bar.style.bottom = offset + "px";
    document.body.style.setProperty("--ad-bar-space", SLOT_HEIGHT + GAP + "px");
  }
  let queued = false;
  function update() {
    queued = false;
    try {
      run();
    } catch (_) {
      /* la ventana se cerró o el documento cambió: no hay nada que dibujar */
    }
  }
  function run() {
    const want = enabled();
    if (want && !bar) {
      bar = createSlot("bar");
      if (bar) {
        document.body.append(bar);
        document.body.classList.add("has-ad-bar");
      }
    } else if (!want && bar) {
      bar.remove();
      bar = null;
      document.body.classList.remove("has-ad-bar");
      document.body.style.removeProperty("--ad-bar-space");
    }
    if (bar) {
      placeBar();
      const rect = bar.getBoundingClientRect();
      const dialogOpen = !!document.querySelector("dialog[open]");
      let near = false;
      for (const r of actionButtons()) {
        if (r.bottom + GAP > rect.top && r.top - GAP < rect.bottom && r.right + GAP > rect.left && r.left - GAP < rect.right) {
          near = true;
          break;
        }
      }
      bar.style.visibility = dialogOpen || near ? "hidden" : "visible";
    }
    syncCard();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(update);
  }

  /* ---------- tarjeta entre las deudas ---------- */
  function syncCard() {
    const list = document.getElementById("cards");
    if (!list) return;
    const existing = list.querySelector(":scope > .ad-slot--card");
    const cards = Array.from(list.querySelectorAll(":scope > article.card"));
    if (!enabled() || cards.length < 2) {
      if (existing) existing.remove();
      return;
    }
    const after = cards[Math.min(cards.length >= 3 ? 2 : 1, cards.length) - 1];
    if (existing && existing.previousElementSibling === after) return;
    if (existing) existing.remove();
    const el = createSlot("card");
    if (el) after.after(el);
  }

  function start() {
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("mpdd-membership", schedule);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "disabled", "class"] });
  }
  window.MPDDAds = Object.freeze({ ADS_ENABLED, preview, enabled, createSlot, refresh: update, SLOT_HEIGHT, GAP });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
