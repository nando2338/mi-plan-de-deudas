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
    legendPending: "Pago pendiente",
    legendPaid: "Pagado",
    legendLate: "Vencido sin pagar",
    legendToday: "Hoy (borde oscuro)",
    legendMany: "Varios pagos (cantidad)",
    legendNone: "Sin pagos",
    legendTitle: "Colores del calendario",
    upTitle: "Próximos pagos",
    upIntro: "Cuotas vencidas sin pagar y pagos de los próximos 30 días. Toca uno para verlo en el calendario.",
    upEmpty: "No tienes pagos pendientes en los próximos 30 días.",
    today: "Hoy",
    tomorrow: "Mañana",
    inDays: "En",
    days: "días",
    day: "día",
    overdueAgo: "Vencido hace",
    cutoff: "Fecha de corte",
    paymentsCount: "pagos",
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
    chip_overdue: "Vencido",
    inPlan: "Según tu plan",
    gasto: "Gasto fijo",
    undo: "Deshacer",
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
  /* ---------- 1.8 Gastos fijos: their payments next to the debt installments ---------- */
  const GC = window.MPDDGastosCore;
  function gastosIn(from, to, t) {
    try {
      return window.MPDDGastos && GC ? GC.occurrences(window.MPDDGastos.list(), { from, to, today: t }) : [];
    } catch (_) {
      return [];
    }
  }
  function gastoMark(it, box) {
    if (it.kind !== "gasto") return;
    const info = window.MPDDGastos.categoryInfo(it.category, en() ? "en" : "es");
    const ic = el("span", "gf-cal-icon", info.icon);
    ic.setAttribute("aria-hidden", "true");
    box.prepend(ic);
    box.append(el("span", "gf-tag", T.gasto));
  }
  /* ---------- fin 1.8 ---------- */
  function appDebts() {
    try {
      // `debts` is the app's working copy (global binding from index.html).
      return Array.isArray(debts) ? debts : [];
    } catch (_) {
      return [];
    }
  }
  function chip(status) {
    const key = status === "overdue" ? "overdue" : status === "dueToday" ? "pending" : status;
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
  /* Legend (1.4). Today keeps its state: dark border, no background, and the
     state is shown by the colored dot or count. */
  const legendTitle = el("p", "visually-hidden", T.legendTitle);
  legendTitle.id = "cal-legend-title";
  const legend = el("ul", "cal-legend");
  legend.setAttribute("aria-labelledby", legendTitle.id);
  for (const [cls, key, mark] of [
    ["pending", "legendPending", "dot"],
    ["paid", "legendPaid", ""],
    ["late", "legendLate", ""],
    ["today", "legendToday", ""],
    ["pending", "legendMany", "2"],
    ["none", "legendNone", ""],
  ]) {
    const item = el("li", "legend-item legend-" + key);
    const sw = el("i", "swatch c-" + cls);
    sw.setAttribute("aria-hidden", "true");
    if (mark === "dot") sw.append(el("span", "sw-dot"));
    else if (mark) sw.append(raw("span", mark, "sw-count"));
    item.append(sw, el("span", "", T[key]));
    legend.append(item);
  }
  const noDue = el("p", "notice", T.noDue);
  const detail = el("div", "cal-detail");
  detail.setAttribute("aria-live", "polite");
  const upBox = el("div", "cal-upcoming");
  const upList = el("ul", "upcoming-list");
  upBox.append(el("h3", "", T.upTitle), el("p", "label", T.upIntro), upList);
  section.append(h2, intro, summary, nav, grid, legendTitle, legend, noDue, detail, upBox);
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
    const planned = window.MPDDPlan ? window.MPDDPlan.planned() : {};
    const sum = S.monthSummary(list, y, m, t, planned);
    // 1.8: fixed expenses count with their full amount in the month they are due.
    for (const o of gastosIn(y + "-" + String(m).padStart(2, "0") + "-01", S.monthEnd(y, m), t)) {
      const box = o.payment ? sum.paid : sum.toPay;
      const v = o.payment ? o.payment.amount : o.expected;
      if (v > 0) box[o.currency] = MPDDMoney.roundTo((box[o.currency] || 0) + v, o.currency);
    }
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
    const inst = S.installments(list, { from, to, today: t, planned }).concat(gastosIn(from, to, t)); // 1.8
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
      const extra = extraPayments(di, dp);
      const color = S.dayColor(date, t, di, extra);
      const n = di.length + extra.length;
      const cell = el("button", "cal-day c-" + color + (date === t ? " c-today" : "") + (selected === date ? " selected" : ""));
      cell.type = "button";
      cell.dataset.date = date;
      cell.dataset.state = color;
      cell.append(raw("span", String(d), "num"));
      if (n > 1) cell.append(raw("span", String(n), "cal-count"));
      else if (n === 1) cell.append(el("span", "dot"));
      let label = formatLong(date);
      if (date === t) label += en() ? " · today" : " · hoy";
      if (n) label += " · " + n + " " + (en() ? (n === 1 ? "payment" : "payments") : n === 1 ? "pago" : T.paymentsCount);
      const stateName = { late: en() ? "overdue" : "vencido", pending: en() ? "pending" : "pendiente", paid: en() ? "paid" : "pagado" }[color];
      if (stateName) label += " · " + stateName;
      cell.setAttribute("aria-label", label);
      if (date === t) cell.setAttribute("aria-current", "date");
      if (selected === date) cell.setAttribute("aria-pressed", "true");
      grid.append(cell);
    }
    noDue.hidden = list.some((x) => S.dueDay(x)) || inst.some((x) => x.kind === "gasto");
    const cuts = readCutoffs(list, t);
    renderDetail(inst, pays, t, cuts);
    renderUpcoming(list, t, planned, cuts);
  }
  /* Payments of a day that do not belong to an installment shown that same day. */
  function extraPayments(di, dp) {
    return dp.filter((x) => !di.some((i) => i.payment && i.debtId === x.debtId && i.payment.date === x.date));
  }
  /* Cutoff dates configured in the reminders (read only; the settings live elsewhere). */
  function readCutoffs(list, t) {
    try {
      const rawPrefs = localStorage.getItem("nando-recordatorios-v1");
      const prefs = rawPrefs === null ? {} : JSON.parse(rawPrefs);
      return S.cutoffs(list, prefs, t, 30);
    } catch (_) {
      return [];
    }
  }
  function relative(days) {
    const box = el("span", "up-when" + (days < 0 ? " is-overdue" : days === 0 ? " is-today" : ""));
    if (days === 0) box.append(el("span", "", T.today));
    else if (days === 1) box.append(el("span", "", T.tomorrow));
    else if (days > 1) box.append(el("span", "", T.inDays), " ", raw("span", String(days)), " ", el("span", "", T.days));
    else box.append(el("span", "", T.overdueAgo), " ", raw("span", String(-days)), " ", el("span", "", -days === 1 ? T.day : T.days));
    return box;
  }
  function shortDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  function renderUpcoming(list, t, planned, cuts) {
    upList.replaceChildren();
    const rows = S.upcoming(list, t, { daysAhead: 30, planned }).map((i) => ({ kind: "payment", date: i.dueDate, days: i.days, it: i }));
    for (const o of gastosIn(S.overdueFrom(t), S.addDays(t, 30), t)) if (!o.payment) rows.push({ kind: "payment", date: o.dueDate, days: S.daysBetween(t, o.dueDate), it: o }); // 1.8
    for (const c of cuts) rows.push({ kind: "cutoff", date: c.date, days: c.days, it: c });
    rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "payment" ? -1 : 1) || a.it.name.localeCompare(b.it.name));
    if (!rows.length) {
      upList.append(el("li", "label up-empty", T.upEmpty));
      return;
    }
    for (const r of rows) {
      const li = el("li");
      const btn = el("button", "upcoming-row up-" + r.kind + (r.days < 0 ? " is-overdue" : ""));
      btn.type = "button";
      btn.dataset.date = r.date;
      if (r.it.kind === "gasto") btn.dataset.gastoId = r.it.gastoId;
      else btn.dataset.debtId = r.it.debtId;
      const when = el("span", "up-date");
      when.append(raw("span", shortDate(r.date), "up-day"), relative(r.days));
      const body = el("span", "up-body");
      body.append(raw("strong", r.it.name, "up-name"));
      gastoMark(r.it, body);
      if (r.kind === "cutoff") body.append(el("span", "label", T.cutoff));
      const amt = el("span", "up-amount");
      if (r.kind === "payment") {
        if (r.it.expected !== null) amt.append(raw("span", MPDDMoney.formatMoney(r.it.expected, r.it.currency)));
        else amt.append(el("span", "muted", T.noAmount));
        if (r.it.planned) amt.append(el("span", "plan-chip", T.inPlan));
      }
      btn.append(when, body, amt);
      li.append(btn);
      upList.append(li);
    }
  }
  function openDay(date) {
    ym = { y: +date.slice(0, 4), m: +date.slice(5, 7) };
    selected = date;
    safeRender();
    const cell = grid.querySelector('.cal-day[data-date="' + date + '"]');
    if (cell && typeof cell.focus === "function") cell.focus({ preventScroll: true });
    if (typeof detail.scrollIntoView === "function") detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  upList.addEventListener("click", (e) => {
    const row = e.target.closest(".upcoming-row");
    if (row && S.validDate(row.dataset.date)) openDay(row.dataset.date);
  });
  function renderDetail(inst, pays, t, cuts) {
    detail.replaceChildren();
    if (!selected || selected.slice(0, 7) !== ym.y + "-" + String(ym.m).padStart(2, "0")) return;
    detail.append(raw("h3", formatLong(selected)));
    const di = inst.filter((x) => x.dueDate === selected);
    const dp = extraPayments(di, pays.filter((x) => x.date === selected));
    const dc = (cuts || []).filter((c) => c.date === selected);
    if (dc.length) {
      const ulc = el("ul", "pay-list cutoff-list");
      for (const c of dc) {
        const li = el("li", "pay-row");
        li.append(el("span", "status-chip st-pending", T.cutoff), raw("strong", c.name));
        ulc.append(li);
      }
      detail.append(ulc);
    }
    if (!di.length && !dp.length) {
      if (!dc.length) detail.append(el("p", "label", T.dayEmpty));
      return;
    }
    const ul = el("ul", "pay-list");
    const isLocked = !window.MPDDApp || window.MPDDApp.isLocked();
    for (const it of di) {
      const li = el("li", "pay-row");
      li.append(chip(it.status));
      const body = el("div", "pay-body");
      body.append(raw("strong", it.name));
      gastoMark(it, body);
      const amt = it.payment ? formatMoney(it.payment.amount, it.currency) : it.expected !== null ? formatMoney(it.expected, it.currency) : null;
      if (amt) {
        body.append(raw("span", amt, "pay-amount"));
        if (!it.payment && it.planned) body.append(el("span", "plan-chip", T.inPlan));
      } else body.append(el("span", "pay-amount muted", T.noAmount));
      const meta = el("span", "label");
      meta.append(el("span", "", T.due), " ", raw("span", it.dueDate));
      if (it.payment) meta.append(" · ", el("span", "", T.paidOn), " ", raw("span", it.payment.date));
      body.append(meta);
      li.append(body);
      if (it.kind === "gasto") {
        // 1.8: fixed expenses are marked (and undone) right here, through MPDDGastos.
        const btn = el("button", "ghost", it.payment ? T.undo : T.markPaid);
        btn.type = "button";
        btn.disabled = isLocked;
        btn.dataset.gastoId = it.gastoId;
        btn.addEventListener("click", () => {
          try {
            if (it.payment) window.MPDDGastos.unmarkPaid(it.gastoId, it.period);
            else window.MPDDGastos.markPaid(it.gastoId, it.period);
          } catch (_) {}
        });
        li.append(btn);
      } else if (!it.payment) {
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
      n += gastosIn(S.overdueFrom(today()), S.addDays(today(), cfg.daysBefore), today()).filter((o) => !o.payment).length; // 1.8
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
  document.addEventListener("mpdd:planchange", safeRender);
  document.addEventListener("mpdd:gastoschange", safeRender); // 1.8
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") safeRender();
  });
  window.MPDDCalendar = { render: safeRender, show: (y, m, day) => ((ym = { y, m }), (selected = day || null), safeRender()) };
  safeRender();
})();
