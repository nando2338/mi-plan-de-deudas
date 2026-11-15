/* Detecta una versión nueva del service worker al abrir la app y ofrece actualizar.
   Al tocar "Actualizar", el nuevo service worker toma el control y la página se recarga. */
(function () {
  "use strict";
  const T = { available: "Nueva versión disponible", update: "Actualizar", reloadHint: "La app se actualizó en otra pestaña.", reload: "Recargar" };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { actualizacion: T });
  if (!("serviceWorker" in navigator)) return;
  let accepted = false,
    reloading = false,
    bar = null;
  function banner(text, label, onClick) {
    if (bar) bar.remove();
    bar = document.createElement("div");
    bar.className = "update-banner";
    bar.setAttribute("role", "status");
    const span = document.createElement("span");
    span.textContent = text;
    const dash = document.createElement("span");
    dash.textContent = " – ";
    dash.setAttribute("aria-hidden", "true");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    bar.append(span, dash, btn);
    document.body.append(bar);
  }
  function offer(worker) {
    banner(T.available, T.update, () => {
      accepted = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    if (accepted) {
      reloading = true;
      location.reload();
    } else banner(T.reloadHint, T.reload, () => location.reload());
  });
  function watch(reg) {
    if (!reg) return;
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        // Only an *update* (there is already a controller) needs the banner.
        if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
      });
    });
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }
  navigator.serviceWorker.ready.then(watch).catch(() => {});
})();
