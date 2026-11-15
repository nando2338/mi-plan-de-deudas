/* Pestaña "Calendario" (versión 1.2) y contador rojo de la pestaña Inicio.
   Lee las deudas de la app; para marcar un pago usa el formulario existente
   (MPDDApp.openPayment), que valida y guarda con el mismo mecanismo de siempre.
   Los datos del usuario solo se insertan con textContent. */
(function () {
  "use strict";
  const view = document.getElementById("view-calendar");
  const S = window.MPDDSchedule;
  if (!view || !S || !window.formatMoney) return;
  const T = {
    title: "Calendario de pagos",
    intro: "Cada día se colorea según los pagos de tus deudas. Toca un día para ver sus pagos y marcarlos como pagados.",
    toPay: "Por pagar este mes",
    paid: "Pagado este mes",
    nothingToPay: "Nada pendiente",
    nothingPaid: "Sin pagos registrados",
    unknown: "Cuotas sin monto definido:",
    unknownHelp: "Agrega la cuota mensual al editar la deuda para sumarla aquí.",
    prev: "Mes anterior",
    next: "Mes siguiente",
    legendPaid: "Pagado a tiempo",
    legendLate: "Vencido sin pagar o pagado tarde",
    legendToday: "Hoy",
    legendPending: "Pendiente",
    legendNone: "Sin pagos",
    noDue: "Para ver tus cuotas en el calendario, agrega el día de vencimiento a cada deuda.",
    dayEmpty: "No hay pagos este día.",
    due: "Vence:",
    paidOn: "Pagado el",
    markPaid: "Marcar como pagado",
    noAmount: "Monto por definir",
    locked: "Hay una recuperación pendiente: no se pueden registrar pagos hasta revisarla.",
    badge: "pagos vencidos o próximos",
    chip_onTime: "Pagado a tiempo",
    chip_late: "Pagado tarde",
    chip_paid: "Pagado",
    chip_pending: "Pendiente",
  };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { calendario: T });

  const en = () => document.documentElement.lang === "en";
  const locale = () => (en() ? "en-US" : "es-CO");
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const raw = (tag, text, cls) => {
    const n = el(tag, cls, text);
    n.dataset.localizedOutput = "true";
    return n;
  };
  function today() {
    return new Date().toLocaleDateString("en-CA");
  }
  function appDebts() {
    try {
      // `debts` is the app's working copy (global binding from index.html).
      return Array.isArray(debts) ? debts : [];
    } catch (_) {
      return [];
    }
  }
  function chip(status) {
    const key = status === "overdue" || status === "dueToday" ? "pending" : status;
    return el("span", "status-chip st-" + key, T["chip_" + key] || T.chip_pending);
  }
  function moneyLines(totals) {
    const box = el("div", "money-lines");
    for (const c of MPDDMoney.ordered(totals)) box.append(raw("div", formatMoney(totals[c], c), "money-line"));
    return box;
  }
  const isoDate = (d) => d.toLocaleDateString("en-CA");
  function formatLong(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  /* ---------- layout ---------- */
  const section = el("section", "overview calendar-view");
  const h2 = el("h2", "", T.title);
  const intro = el("p", "label", T.intro);
  const summary = el("div", "cal-summary");
  const nav = el("div", "cal-nav");
  const prev = el("button", "ghost", "‹");
  const next = el("button", "ghost", "›");
  prev.type = next.type = "button";
  const monthTitle = raw("h3", "", "cal-month");
  monthTitle.setAttribute("aria-live", "polite");
  nav.append(prev, monthTitle, next);
  const grid = el("div", "cal-grid");
  grid.setAttribute("role", "grid");
  const legend = el("div", "cal-legend");
  for (const [cls, key] of [
    ["paid", "legendPaid"],
    ["late", "legendLate"],
    ["today", "legendToday"],
    ["pending", "legendPending"],
    ["none", "legendNone"],
  ]) {
    const item = el("span", "legend-item");
    item.append(el("i", "swatch c-" + cls), el("span", "", T[key]));
    legend.append(item);
  }
  const noDue = el("p", "notice", T.noDue);
  const detail = el("div", "cal-detail");
  detail.setAttribute("aria-live", "polite");
  section.append(h2, intro, summary, nav, grid, legend, noDue, detail);
  view.append(section);

  let ym = (() => {
    const t = today();
    return { y: +t.slice(0, 4), m: +t.slice(5, 7) };
  })();
  let selected = null;

  function render() {
    const t = today();
    const list = appDebts();
    const { y, m } = ym;
    // Summary
    const sum = S.monthSummary(list, y, m, t);
    summary.replaceChildren();
    const a = el("div", "cal-sum");
    a.append(el("div", "label", T.toPay), Object.keys(sum.toPay).length ? moneyLines(sum.toPay) : el("div", "money-line muted", T.nothingToPay));
    if (sum.unknown) {
      const u = el("div", "label");
      u.append(el("span", "", T.unknown), " ", raw("strong", String(sum.unknown)));
      u.title = T.unknownHelp;
      a.append(u);
    }
    const b = el("div", "cal-sum");
    b.append(el("div", "label", T.paid), Object.keys(sum.paid).length ? moneyLines(sum.paid) : el("div", "money-line muted", T.nothingPaid));
    summary.append(a, b);
    // Month title
    monthTitle.textContent = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
    prev.setAttribute("aria-label", en() ? "Previous month" : T.prev);
    next.setAttribute("aria-label", en() ? "Next month" : T.next);
    // Grid
    const from = y + "-" + String(m).padStart(2, "0") + "-01",
      to = S.monthEnd(y, m);
    const inst = S.installments(list, { from, to, today: t });
    const pays = S.payments(list, { from, to });
    grid.replaceChildren();
    const wd = new Intl.DateTimeFormat(locale(), { weekday: "short", timeZone: "UTC" });
    for (let i = 0; i < 7; i++) grid.append(raw("div", wd.format(new Date(Date.UTC(2024, 0, 1 + i))), "cal-wd")); // 2024-01-01 is a Monday
    const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) grid.append(el("div", "cal-pad"));
    const days = +to.slice(8, 10);
    for (let d = 1; d <= days; d++) {
      const date = from.slice(0, 8) + String(d).padStart(2, "0");
      const di = inst.filter((x) => x.dueDate === date),
        dp = pays.filter((x) => x.date === date);
      const color = S.dayColor(date, t, di, dp);
      const cell = el("button", "cal-day c-" + color + (selected === date ? " selected" : ""));
      cell.type = "button";
      cell.dataset.date = date;
      cell.append(raw("span", String(d), "num"));
      if (di.length + dp.length) cell.append(el("span", "dot"));
      cell.setAttribute("aria-label", formatLong(date));
      if (selected === date) cell.setAttribute("aria-pressed", "true");
      grid.append(cell);
    }
    noDue.hidden = list.some((x) => S.dueDay(x));
    renderDetail(inst, pays, t);
  }
  function renderDetail(inst, pays, t) {
    detail.replaceChildren();
    if (!selected || selected.slice(0, 7) !== ym.y + "-" + String(ym.m).padStart(2, "0")) return;
    detail.append(raw("h3", formatLong(selected)));
    const di = inst.filter((x) => x.dueDate === selected);
    const dp = pays.filter((x) => x.date === selected && !di.some((i) => i.payment && i.debtId === x.debtId && i.payment.date === x.date));
    if (!di.length && !dp.length) {
      detail.append(el("p", "label", T.dayEmpty));
      return;
    }
    const ul = el("ul", "pay-list");
    const isLocked = !window.MPDDApp || window.MPDDApp.isLocked();
    for (const it of di) {
      const li = el("li", "pay-row");
      li.append(chip(it.status));
      const body = el("div", "pay-body");
      body.append(raw("strong", it.name));
      const amt = it.payment ? formatMoney(it.payment.amount, it.currency) : it.expected !== null ? formatMoney(it.expected, it.currency) : null;
      if (amt) body.append(raw("span", amt, "pay-amount"));
      else body.append(el("span", "pay-amount muted", T.noAmount));
      const meta = el("span", "label");
      meta.append(el("span", "", T.due), " ", raw("span", it.dueDate));
      if (it.payment) meta.append(" · ", el("span", "", T.paidOn), " ", raw("span", it.payment.date));
      body.append(meta);
      li.append(body);
      if (!it.payment) {
        const btn = el("button", "ghost", T.markPaid);
        btn.type = "button";
        btn.disabled = isLocked;
        btn.addEventListener("click", () => {
          const preset = { dueDate: it.dueDate };
          if (it.expected !== null) preset.amount = it.expected;
          window.MPDDApp.openPayment(it.debtId, preset);
        });
        li.append(btn);
      }
      ul.append(li);
    }
    for (const p of dp) {
      const li = el("li", "pay-row");
      li.append(chip(p.status));
      const body = el("div", "pay-body");
      body.append(raw("strong", p.name), raw("span", formatMoney(p.amount, p.currency), "pay-amount"));
      const meta = el("span", "label");
      meta.append(el("span", "", T.paidOn), " ", raw("span", p.date));
      if (p.dueDate) meta.append(" · ", el("span", "", T.due), " ", raw("span", p.dueDate));
      body.append(meta);
      li.append(body);
      ul.append(li);
    }
    detail.append(ul);
    if (isLocked && di.some((i) => !i.payment)) detail.append(el("p", "label", T.locked));
  }
  prev.addEventListener("click", () => {
    ym = ym.m === 1 ? { y: ym.y - 1, m: 12 } : { y: ym.y, m: ym.m - 1 };
    selected = null;
    safeRender();
  });
  next.addEventListener("click", () => {
    ym = ym.m === 12 ? { y: ym.y + 1, m: 1 } : { y: ym.y, m: ym.m + 1 };
    selected = null;
    safeRender();
  });
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-day");
    if (!cell) return;
    selected = cell.dataset.date;
    safeRender();
  });

  /* ---------- badge on the Inicio tab ---------- */
  function updateBadge() {
    const btn = document.querySelector('.bottom-nav [data-target="home"]');
    if (!btn) return;
    let n = 0;
    try {
      const cfg = S.readAvisos(localStorage);
      n = S.badgeCount(appDebts(), today(), cfg.daysBefore);
    } catch (_) {
      n = 0;
    }
    let badge = btn.querySelector(".nav-badge");
    if (!n) {
      if (badge) badge.remove();
      btn.removeAttribute("aria-description");
      return;
    }
    if (!badge) {
      badge = raw("span", "", "nav-badge");
      badge.setAttribute("aria-hidden", "true");
      btn.append(badge);
    }
    badge.textContent = n > 99 ? "99+" : String(n);
    btn.setAttribute("aria-description", n + " " + (en() ? "overdue or upcoming payments" : T.badge));
  }
  function safeRender() {
    try {
      render();
    } catch (_) {
      // Never break the rest of the app because of the calendar.
    }
    updateBadge();
  }
  document.addEventListener("mpdd:rendered", safeRender);
  document.addEventListener("deudas:languagechange", safeRender);
  document.addEventListener("mpdd:avisoschange", updateBadge);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") safeRender();
  });
  window.MPDDCalendar = { render: safeRender, show: (y, m, day) => ((ym = { y, m }), (selected = day || null), safeRender()) };
  safeRender();
})();
