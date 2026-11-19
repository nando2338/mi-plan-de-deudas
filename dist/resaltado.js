/* 1.8 Highlight of upcoming payments on the Inicio debt cards.
   - Uses MPDDSchedule.upcoming (same installments as the calendar: unpaid ones from the
     previous month on, plus the next 7 days) and MPDDSchedule.dueLevel for the color.
   - Each highlighted card gets a colored border AND a text label (never color alone).
   - Without a sort chosen by the user, urgent cards go first (red, yellow, blue, by date)
     inside each currency group; with a user sort the order is kept.
   - Decorates the cards after render() (event "mpdd:rendered"); does not change the data.
   - "today" is the device's local date. Text is only set with textContent. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.MPDDResaltado = api;
    api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const RANK = { red: 0, yellow: 1, blue: 2 };
  const SORT_KEY = "nando-deudas-sort-v1";
  const sched = () => root.MPDDSchedule || (typeof require === "function" ? require("./schedule-core.js") : null);

  /* Pure: Map debtId -> { level, kind, days, dueDate } for the debts to highlight. */
  function levels(debts, today) {
    const S = sched();
    const out = new Map();
    if (!S || !S.validDate(today)) return out;
    let list = [];
    try {
      list = S.upcoming(debts || [], today, { daysAhead: 7 });
    } catch (_) {
      return out;
    }
    // Sorted by date: the first unpaid installment of each debt is the most urgent one.
    for (const it of list) {
      if (out.has(it.debtId)) continue;
      const lv = S.dueLevel(it.dueDate, today, !!it.payment);
      if (lv) out.set(it.debtId, { level: lv.level, kind: lv.kind, days: lv.days, dueDate: it.dueDate });
    }
    return out;
  }
  /* Pure: the label as parts; "raw" parts are numbers (not translated). */
  function labelParts(info) {
    if (!info) return [];
    if (info.kind === "today") return [{ t: "Vence hoy" }];
    if (info.kind === "tomorrow") return [{ t: "Vence mañana" }];
    if (info.kind === "soon") return [{ t: "Vence en" }, { raw: String(info.days) }, { t: "días" }];
    const n = -info.days;
    return [{ t: "Vencido hace" }, { raw: String(n) }, { t: n === 1 ? "día" : "días" }];
  }
  /* Pure: counts for the summary. */
  function summarize(map) {
    const c = { overdue: 0, today: 0, week: 0, total: 0, top: null };
    for (const v of map.values()) {
      if (v.kind === "overdue") c.overdue++;
      else if (v.kind === "today") c.today++;
      else c.week++;
      c.total++;
      if (!c.top || RANK[v.level] < RANK[c.top]) c.top = v.level;
    }
    return c;
  }

  function install(win) {
    const doc = win.document;
    const cards = doc.getElementById("cards");
    const S = win.MPDDSchedule;
    if (!cards || !S || typeof S.dueLevel !== "function") return;
    const section = cards.closest("section");
    const head = section && section.querySelector(".section-head");

    const today = () => new win.Date().toLocaleDateString("en-CA");
    function appDebts() {
      try {
        if (win.MPDDApp && typeof win.MPDDApp.debts === "function") return win.MPDDApp.debts();
      } catch (_) {}
      return [];
    }
    function userSorted() {
      try {
        return win.localStorage.getItem(SORT_KEY) !== null;
      } catch (_) {
        return true;
      }
    }
    function span(text, raw) {
      const s = doc.createElement("span");
      s.textContent = text;
      if (raw) s.dataset.localizedOutput = "true";
      return s;
    }
    function fill(node, parts) {
      node.replaceChildren();
      parts.forEach((p, i) => {
        if (i) node.append(doc.createTextNode(" "));
        node.append(p.raw !== undefined ? span(p.raw, true) : span(p.t));
      });
    }

    /* Summary above "Mis deudas" (a button: tapping it goes to the first highlighted card). */
    const summary = doc.createElement("button");
    summary.type = "button";
    summary.id = "due-summary";
    summary.className = "due-summary";
    summary.hidden = true;
    if (section && head) section.insertBefore(summary, head);
    summary.addEventListener("click", () => {
      const first = cards.querySelector("article.card[data-due-level]");
      if (!first) return;
      if (typeof first.scrollIntoView === "function") {
        try {
          first.scrollIntoView({ block: "center", behavior: win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        } catch (_) {}
      }
      try {
        first.focus({ preventScroll: true });
      } catch (_) {
        first.focus();
      }
    });
    const note = doc.createElement("p");
    note.className = "due-order-note label";
    note.id = "due-order-note";
    note.hidden = true;
    note.textContent = "Los pagos más próximos aparecen primero. Elige un orden para cambiarlo.";
    const sortbox = section && section.querySelector(".sortbox");
    if (sortbox) sortbox.after(note);

    function summaryParts(c) {
      const parts = [];
      const add = (n, one, many) => parts.push([{ raw: String(n) }, { t: n === 1 ? one : many }]);
      if (c.overdue) add(c.overdue, "pago vencido", "pagos vencidos");
      if (c.today) add(c.today, "pago vence hoy", "pagos vencen hoy");
      if (c.week) add(c.week, "pago vence esta semana", "pagos vencen esta semana");
      return parts;
    }

    function decorate() {
      const t = today();
      const map = levels(appDebts(), t);
      const articles = [...cards.querySelectorAll(":scope > article.card")];
      articles.forEach((a, i) => {
        if (!a.dataset.order) a.dataset.order = String(i);
        a.querySelectorAll(":scope > .due-flag").forEach((n) => n.remove());
        a.classList.remove("due-red", "due-yellow", "due-blue");
        delete a.dataset.dueLevel;
        const btn = a.querySelector("[data-edit]");
        const info = btn ? map.get(String(btn.dataset.edit)) : null;
        if (!info) {
          a.removeAttribute("tabindex");
          return;
        }
        a.dataset.dueLevel = info.level;
        a.classList.add("due-" + info.level);
        a.setAttribute("tabindex", "-1");
        const flag = doc.createElement("p");
        flag.className = "due-flag due-flag-" + info.level;
        fill(flag, labelParts(info));
        a.prepend(flag);
      });
      // Order: only when the user has not chosen one; inside each currency group.
      const reorder = !userSorted() && map.size > 0;
      const groups = [];
      let cur = [];
      for (const n of [...cards.children]) {
        if (n.matches("article.card")) cur.push(n);
        else {
          if (cur.length) groups.push(cur);
          cur = [];
        }
      }
      if (cur.length) groups.push(cur);
      for (const g of groups) {
        const key = (a) => {
          const btn = a.querySelector("[data-edit]");
          const info = reorder && btn ? map.get(String(btn.dataset.edit)) : null;
          return info ? [RANK[info.level], info.dueDate] : [9, ""];
        };
        const sorted = g.slice().sort((a, b) => {
          const ka = key(a),
            kb = key(b);
          return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || Number(a.dataset.order) - Number(b.dataset.order);
        });
        if (sorted.some((n, i) => n !== g[i])) {
          const anchor = g[g.length - 1].nextSibling;
          for (const n of sorted) cards.insertBefore(n, anchor);
        }
      }
      note.hidden = !reorder;

      const c = summarize(map);
      summary.classList.remove("due-red", "due-yellow", "due-blue");
      if (!c.total) {
        summary.hidden = true;
        summary.replaceChildren();
        return;
      }
      summary.classList.add("due-" + c.top);
      summary.replaceChildren();
      summaryParts(c).forEach((p, i) => {
        if (i) summary.append(doc.createTextNode(" · "));
        const box = doc.createElement("span");
        fill(box, p);
        summary.append(box);
      });
      const arrow = doc.createElement("span");
      arrow.className = "due-summary-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "›";
      summary.append(arrow);
      summary.hidden = false;
    }
    function safe() {
      try {
        decorate();
      } catch (_) {}
    }

    // Date change: at local midnight and when the app comes back to the screen.
    let lastDay = today();
    let timer = null;
    function scheduleMidnight() {
      win.clearTimeout(timer);
      const now = new win.Date();
      const next = new win.Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = win.setTimeout(() => {
        lastDay = today();
        safe();
        scheduleMidnight();
      }, Math.max(1000, Math.min(next - now, 86400000)));
    }
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState !== "visible") return;
      if (today() !== lastDay) {
        lastDay = today();
        scheduleMidnight();
      }
      safe();
    });
    doc.addEventListener("mpdd:rendered", safe);
    doc.addEventListener("deudas:languagechange", safe);
    scheduleMidnight();
    safe();
    if (root.MPDDResaltado) root.MPDDResaltado.refresh = safe;
  }

  return { levels, labelParts, summarize, install, refresh: () => {} };
});
