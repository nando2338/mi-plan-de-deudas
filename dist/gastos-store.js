/* Gastos fijos (versión 1.8): almacenamiento en el dispositivo y API común.
   La usan la sección "Gastos fijos" de Inicio, el asistente del Plan, el calendario, los
   avisos, los respaldos y la sincronización. Cada cambio avisa con el evento
   "mpdd:gastoschange" en document. Sin cuenta, todo queda solo en este dispositivo. */
(function () {
  "use strict";
  const C = window.MPDDGastosCore;
  if (!C) return;
  const KEY = C.KEY;
  const CATS = C.CATS_KEY;
  const JOURNAL = "nando-restore-journal-v1";
  const ls = window.localStorage;
  const pad = (n) => String(n).padStart(2, "0");

  /* Today's date on the device (local time zone, not UTC). */
  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function restoring() {
    try {
      return ls.getItem(JOURNAL) !== null;
    } catch (_) {
      return false;
    }
  }
  function emit(source) {
    try {
      document.dispatchEvent(new CustomEvent("mpdd:gastoschange", { detail: { source: source || "local" } }));
    } catch (_) {}
  }
  /* Everything stored, including deletion marks (needed for sync). */
  function all() {
    try {
      return C.sanitize(JSON.parse(ls.getItem(KEY) || "[]"));
    } catch (_) {
      return [];
    }
  }
  function writeAll(list, source) {
    // While a backup is being restored, nothing else writes to the device.
    if (restoring()) throw Object.assign(new Error("restore"), { code: "restore" });
    ls.setItem(KEY, JSON.stringify(C.sanitize(list)));
    emit(source);
  }
  function newId() {
    try {
      return "g-" + crypto.randomUUID();
    } catch (_) {
      return "g-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
  }
  function stamp(g) {
    return Object.assign({}, g, { updatedAt: new Date().toISOString() });
  }
  /* Saves (creates or edits) an expense. Returns { ok, gasto } or { ok:false, errors }. */
  function save(input) {
    const g = Object.assign({}, input);
    g.name = typeof g.name === "string" ? g.name.trim() : g.name;
    g.amount = Number(g.amount);
    g.day = Number(g.day);
    g.month = C.FREQUENCIES[g.frequency] > 1 ? Number(g.month) : null;
    const errors = C.validate(g);
    if (errors.length) return { ok: false, errors };
    const list = all();
    const i = g.id ? list.findIndex((x) => x.id === g.id) : -1;
    if (i >= 0 && list[i].deleted) return { ok: false, errors: ["deleted"] };
    if (!g.id) g.id = newId();
    if (!g.createdAt) g.createdAt = i >= 0 && list[i].createdAt ? list[i].createdAt : today();
    if (!Array.isArray(g.payments)) g.payments = i >= 0 ? list[i].payments || [] : [];
    const saved = stamp(g);
    if (i >= 0) list[i] = saved;
    else list.push(saved);
    writeAll(list);
    return { ok: true, gasto: C.sanitize([saved])[0] };
  }
  function update(id, fn) {
    const list = all();
    const i = list.findIndex((x) => x.id === id && !x.deleted);
    if (i < 0) return null;
    list[i] = stamp(fn(list[i]));
    writeAll(list);
    return list[i];
  }
  /* Deleting leaves a mark (deleted) so the deletion reaches the other devices. */
  function remove(id) {
    const list = all();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list[i] = { id, deleted: true, updatedAt: new Date().toISOString() };
    writeAll(list);
    return true;
  }
  const api = {
    KEY,
    today,
    all,
    list: () => C.active(all()),
    get: (id) => C.active(all()).find((g) => g.id === id) || null,
    save,
    remove,
    /* Records the payment of a period ("YYYY-MM"); by default today and the full amount. */
    markPaid: (id, period, date, amount) => update(id, (g) => C.markPaid(g, period, date || today(), amount)),
    unmarkPaid: (id, period) => update(id, (g) => C.unmarkPaid(g, period)),
    /* Saves several at once (e.g. those the Plan wizard asked for). Returns how many were saved. */
    addMany(items) {
      let n = 0;
      const list = all();
      for (const it of Array.isArray(items) ? items : []) {
        const g = Object.assign({ frequency: "monthly", payments: [], note: "", category: "" }, it, { id: newId(), createdAt: today() });
        g.amount = Number(g.amount);
        g.day = Number(g.day);
        if (C.FREQUENCIES[g.frequency] === 1) g.month = null;
        if (C.validate(g).length) continue;
        list.push(stamp(g));
        n++;
      }
      if (n) writeAll(list);
      return n;
    },
    /* Monthly total per currency (annual ÷ 12, etc.). */
    monthlyTotals: () => C.monthlyTotals(all()),
    /* Replaces everything (sync, backup restore). source: "sync" | "restore". */
    replaceAll(list, source) {
      writeAll(list, source || "sync");
    },
    /* Categories created by the user: [{ key: "c-…", label, icon }]. */
    categories() {
      try {
        const v = JSON.parse(ls.getItem(CATS) || "[]");
        return (Array.isArray(v) ? v : []).filter((c) => c && typeof c.key === "string" && /^c-[a-z0-9-]{1,36}$/.test(c.key) && typeof c.label === "string" && c.label.trim() && c.label.length <= 30).map((c) => ({ key: c.key, label: c.label.trim(), icon: C.CUSTOM_ICONS.includes(c.icon) ? c.icon : "⭐" }));
      } catch (_) {
        return [];
      }
    },
    addCategory(label, icon) {
      const name = String(label || "").trim();
      if (!name || name.length > 30) return null;
      const cats = api.categories();
      const same = cats.find((c) => c.label.toLowerCase() === name.toLowerCase());
      if (same) return same;
      if (restoring()) return null;
      const cat = { key: "c-" + newId().slice(2, 14).toLowerCase(), label: name, icon: C.CUSTOM_ICONS.includes(icon) ? icon : "⭐" };
      cats.push(cat);
      ls.setItem(CATS, JSON.stringify(cats.slice(-40)));
      emit("categories");
      return cat;
    },
    categoryInfo(key, lang) {
      return C.categoryInfo(key, api.categories(), lang || (document.documentElement.lang === "en" ? "en" : "es"));
    },
    /* Goes to the "Gastos fijos" section of Inicio (e.g. from the Plan wizard). */
    open() {
      try {
        if (window.MPDDNavigate) window.MPDDNavigate("home");
      } catch (_) {}
      setTimeout(() => {
        const sec = document.getElementById("gastos-fijos");
        if (!sec) return;
        try {
          sec.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_) {}
        const h = sec.querySelector("h2, h3");
        if (h) {
          h.setAttribute("tabindex", "-1");
          try {
            h.focus({ preventScroll: true });
          } catch (_) {}
        }
      }, 50);
    },
  };
  window.MPDDGastos = api;
})();
