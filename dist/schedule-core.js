/* Cuotas mensuales, estado de cada pago, resúmenes por moneda y CSV (versión 1.2).
   Lógica pura: sin DOM, almacenamiento ni red. Las fechas son texto YYYY-MM-DD. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MPDDSchedule = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const CATEGORIES = [
    ["tarjeta", "Tarjeta de crédito"],
    ["prestamo", "Préstamo"],
    ["hipoteca", "Hipoteca"],
    ["vehiculo", "Vehículo"],
    ["estudio", "Estudio"],
    ["otra", "Otra"],
  ];
  const NO_CATEGORY = "Sin categoría";
  const pad = (n) => String(n).padStart(2, "0");
  function validDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && x.getUTCFullYear() === y && x.getUTCMonth() + 1 === m && x.getUTCDate() === d;
  }
  function addDays(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.getUTCFullYear() + "-" + pad(x.getUTCMonth() + 1) + "-" + pad(x.getUTCDate());
  }
  function monthDue(year, month, day) {
    const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return year + "-" + pad(month) + "-" + pad(Math.min(day, max));
  }
  function monthStart(s) {
    return s.slice(0, 8) + "01";
  }
  function monthEnd(year, month) {
    return year + "-" + pad(month) + "-" + pad(new Date(Date.UTC(year, month, 0)).getUTCDate());
  }
  function dueDay(debt) {
    const n = Number(debt && debt.due);
    return debt && debt.due !== "" && debt.due !== null && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  }
  function minPayment(debt) {
    const n = Number(debt && debt.minPayment);
    return debt && debt.minPayment !== "" && debt.minPayment !== null && Number.isFinite(n) && n > 0 ? n : null;
  }
  function categoryLabel(debt) {
    const c = CATEGORIES.find(([k]) => k === (debt && debt.category));
    return c ? c[1] : NO_CATEGORY;
  }
  /* Estado de un pago ya hecho. */
  function paymentStatus(entry) {
    if (!entry || !validDate(entry.date)) return "paid";
    if (!validDate(entry.dueDate)) return "paid";
    return entry.date <= entry.dueDate ? "onTime" : "late";
  }
  /* Primer día desde el que se generan cuotas para una deuda. */
  function startDate(debt, today) {
    if (validDate(debt.createdAt)) return debt.createdAt;
    // Debts from before 1.2 have no creation date: start with the current month so
    // months the user never recorded do not appear as overdue.
    return monthStart(today);
  }
  /* Cuotas mensuales entre from y to (inclusive). */
  /* planned (opcional): { "<debtId>|YYYY-MM": monto } del plan del mes (1.3). */
  function installments(debts, { from, to, today, planned }) {
    if (!validDate(from) || !validDate(to) || !validDate(today)) throw new TypeError("Fechas inválidas");
    const out = [];
    for (const debt of debts || []) {
      const day = dueDay(debt);
      if (!day) continue;
      const start = startDate(debt, today);
      const history = Array.isArray(debt.history) ? debt.history : [];
      const used = new Set();
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      // Match from the start of the debt so earlier months consume their own payments.
      const [sy, sm] = start.split("-").map(Number);
      const firstMonth = Math.min(fy * 12 + fm - 1, sy * 12 + sm - 1);
      for (let n = firstMonth; n <= ty * 12 + tm - 1; n++) {
        const year = Math.floor(n / 12),
          month = (n % 12) + 1;
        const dueDate = monthDue(year, month, day);
        if (dueDate < start) continue;
        const ym = dueDate.slice(0, 7);
        // 1) exact due date; 2) a due date in the same month (the due day was edited);
        // 3) a payment without due date made in the same month (data from before 1.2).
        let idx = history.findIndex((h, i) => !used.has(i) && h && h.dueDate === dueDate);
        if (idx < 0) idx = history.findIndex((h, i) => !used.has(i) && h && validDate(h.dueDate) && h.dueDate.slice(0, 7) === ym);
        if (idx < 0) idx = history.findIndex((h, i) => !used.has(i) && h && !validDate(h.dueDate) && validDate(h.date) && h.date.slice(0, 7) === ym);
        const payment = idx >= 0 ? history[idx] : null;
        if (idx >= 0) used.add(idx);
        if (dueDate < from || dueDate > to) continue;
        if (!payment && !(Number(debt.balance) > 0)) continue;
        let status;
        if (payment) status = validDate(payment.date) && payment.date > dueDate ? "late" : "onTime";
        else status = dueDate < today ? "overdue" : dueDate === today ? "dueToday" : "pending";
        out.push({
          debtId: String(debt.id),
          name: String(debt.name || ""),
          currency: debt.currency,
          category: categoryLabel(debt),
          dueDate,
          status,
          expected: planned && Number(planned[String(debt.id) + "|" + dueDate.slice(0, 7)]) > 0 ? Number(planned[String(debt.id) + "|" + dueDate.slice(0, 7)]) : minPayment(debt),
          planned: !!(planned && Number(planned[String(debt.id) + "|" + dueDate.slice(0, 7)]) > 0),
          payment: payment ? { amount: Number(payment.amount), date: payment.date } : null,
        });
      }
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  }
  /* Pagos registrados (historial) con fecha de pago entre from y to. */
  function payments(debts, { from, to }) {
    const out = [];
    for (const debt of debts || [])
      for (const h of Array.isArray(debt.history) ? debt.history : []) {
        if (!h || !validDate(h.date) || h.date < from || h.date > to) continue;
        out.push({
          debtId: String(debt.id),
          name: String(debt.name || ""),
          currency: debt.currency,
          category: categoryLabel(debt),
          amount: Number(h.amount),
          date: h.date,
          dueDate: validDate(h.dueDate) ? h.dueDate : "",
          status: paymentStatus(h),
        });
      }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }
  function addTo(map, currency, n) {
    if (currency !== "USD" && currency !== "COP" && currency !== "EUR") return;
    map[currency] = (map[currency] || 0) + n;
  }
  /* "Por pagar este mes" y "Pagado este mes", separados por moneda. */
  function monthSummary(debts, year, month, today, planned) {
    const from = year + "-" + pad(month) + "-01",
      to = monthEnd(year, month);
    const toPay = {},
      paid = {};
    let unknown = 0;
    for (const it of installments(debts, { from, to, today, planned })) {
      if (it.payment) continue;
      if (it.expected === null) unknown++;
      else addTo(toPay, it.currency, it.expected);
    }
    for (const p of payments(debts, { from, to })) addTo(paid, p.currency, p.amount);
    return { from, to, toPay, paid, unknown };
  }
  /* Estado de un día del calendario (1.4): "late" (vencido sin pagar), "pending" (por pagar),
     "paid" (pagado, a tiempo o tarde) o "none". "Hoy" ya no es un color: el calendario lo marca
     aparte con un borde oscuro y conserva el estado del día. date/today se aceptan por compatibilidad. */
  function dayColor(date, today, dayInstallments, dayPayments) {
    const all = [...(dayInstallments || []).map((i) => i.status), ...(dayPayments || []).map((p) => p.status)];
    if (all.some((s) => s === "overdue")) return "late";
    if (all.some((s) => s === "pending" || s === "dueToday")) return "pending";
    if (all.some((s) => s === "onTime" || s === "paid" || s === "late")) return "paid";
    return "none";
  }
  function daysBetween(a, b) {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }
  /* Desde dónde se buscan cuotas vencidas sin pagar: inicio del mes anterior (igual que el contador). */
  function overdueFrom(today) {
    return monthStart(addDays(monthStart(today), -40));
  }
  /* "Próximos pagos" (1.4, reemplaza la pestaña Avisos): cuotas vencidas sin pagar y cuotas
     sin pagar de los próximos daysAhead días. days < 0 = vencida hace -days días. */
  function upcoming(debts, today, opts) {
    const o = opts || {};
    const ahead = Number.isInteger(o.daysAhead) && o.daysAhead >= 0 ? o.daysAhead : 30;
    return installments(debts, { from: overdueFrom(today), to: addDays(today, ahead), today, planned: o.planned })
      .filter((i) => !i.payment)
      .map((i) => Object.assign({}, i, { days: daysBetween(today, i.dueDate) }));
  }
  /* Fechas de corte configuradas en los recordatorios (solo lectura), entre hoy y daysAhead. */
  function cutoffs(debts, prefs, today, daysAhead) {
    const out = [];
    if (!prefs || typeof prefs !== "object") return out;
    const to = addDays(today, Number.isInteger(daysAhead) ? daysAhead : 30);
    for (const debt of debts || []) {
      const p = Object.prototype.hasOwnProperty.call(prefs, String(debt.id)) ? prefs[String(debt.id)] : null;
      if (!p || typeof p !== "object" || p.cutoffEnabled === false) continue;
      const day = Number(p.cutoffDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      const [y, m] = today.split("-").map(Number);
      for (let k = 0; k < 3; k++) {
        const n = y * 12 + m - 1 + k;
        const date = monthDue(Math.floor(n / 12), (n % 12) + 1, day);
        if (date >= today && date <= to) out.push({ debtId: String(debt.id), name: String(debt.name || ""), currency: debt.currency, date, days: daysBetween(today, date) });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }
  function rateOf(debt) {
    const n = Number(debt && debt.rate);
    return debt && debt.rate !== "" && debt.rate !== null && debt.rate !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
  }
  /* "Lo que debo" (1.4), una sola moneda; nunca convierte.
     view "month": lo que falta pagar este mes (plan si existe, si no la cuota/mínimo).
     view "total": el saldo de cada deuda. */
  function owed(debts, { currency, view, today, planned }) {
    const all = (debts || []).filter((d) => Number(d.balance) > 0 && (d.currency === "USD" || d.currency === "COP" || d.currency === "EUR"));
    const mine = all.filter((d) => d.currency === currency);
    const others = {};
    for (const d of all) if (d.currency !== currency) others[d.currency] = (others[d.currency] || 0) + 1;
    const late = new Set(upcoming(mine, today, { daysAhead: 0 }).filter((i) => i.days < 0).map((i) => i.debtId));
    const [y, m] = today.split("-").map(Number);
    const ym = today.slice(0, 7);
    const inst = installments(mine, { from: ym + "-01", to: monthEnd(y, m), today, planned });
    let unknown = 0;
    const items = [];
    for (const d of mine) {
      const id = String(d.id);
      let amount = Number(d.balance);
      if (view === "month") {
        amount = null;
        if (dueDay(d)) {
          const it = inst.find((i) => i.debtId === id);
          if (!it || it.payment) continue;
          amount = it.expected;
        } else {
          const paidThisMonth = (Array.isArray(d.history) ? d.history : []).some((h) => h && validDate(h.date) && h.date.slice(0, 7) === ym);
          if (paidThisMonth) continue;
          const p = planned && Number(planned[id + "|" + ym]);
          amount = p > 0 ? p : minPayment(d);
        }
        if (amount === null) {
          unknown++;
          continue;
        }
      }
      items.push({ debtId: id, name: String(d.name || ""), currency, amount, balance: Number(d.balance), rate: rateOf(d), overdue: late.has(id) });
    }
    items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const total = items.reduce((s, x) => s + x.amount, 0);
    for (const it of items) it.share = total > 0 ? it.amount / total : 0;
    // Tags and tip use every debt of the currency (same answer in both views).
    const byBalance = mine.slice().sort((a, b) => Number(b.balance) - Number(a.balance) || String(a.name).localeCompare(String(b.name)));
    const withRate = mine.filter((d) => rateOf(d) !== null && rateOf(d) > 0).sort((a, b) => rateOf(b) - rateOf(a) || Number(b.balance) - Number(a.balance) || String(a.name).localeCompare(String(b.name)));
    const biggest = byBalance[0] || null;
    const priciest = withRate[0] || null;
    const smallest = byBalance[byBalance.length - 1] || null;
    const several = mine.length >= 2;
    return {
      currency,
      view: view === "month" ? "month" : "total",
      items,
      total: currency === "COP" ? Math.round(total) : Math.round(total * 100) / 100,
      unknown,
      count: mine.length,
      others,
      mostExpensiveId: several && priciest ? String(priciest.id) : null,
      smallestId: several && smallest ? String(smallest.id) : null,
      biggest: biggest ? { debtId: String(biggest.id), name: String(biggest.name || "") } : null,
      priciest: priciest ? { debtId: String(priciest.id), name: String(priciest.name || ""), rate: rateOf(priciest) } : null,
    };
  }
  /* Due-date highlight (1.7), shared by debts and fixed expenses.
     red    = due today or overdue and unpaid ("Vence hoy" / "Vencido hace X días")
     yellow = due tomorrow ("Vence mañana")
     blue   = due in 2 to 7 days ("Vence en X días")
     null   = paid, no date, or more than 7 days away. The color always goes with a text label. */
  function dueLevel(dueDate, today, paid) {
    if (paid || !validDate(dueDate) || !validDate(today)) return null;
    const days = daysBetween(today, dueDate);
    if (days < 0) return { level: "red", days, kind: "overdue" };
    if (days === 0) return { level: "red", days, kind: "today" };
    if (days === 1) return { level: "yellow", days, kind: "tomorrow" };
    if (days <= 7) return { level: "blue", days, kind: "soon" };
    return null;
  }
  /* Contador del ícono: cuotas vencidas sin pagar (últimos 2 meses) y próximas dentro de daysBefore días. */
  function badgeCount(debts, today, daysBefore) {
    const from = monthStart(addDays(monthStart(today), -40));
    const to = addDays(today, daysBefore);
    return installments(debts, { from, to, today }).filter((i) => !i.payment).length;
  }
  /* CSV: monto como número limpio (punto decimal) y columna Moneda. */
  function csvCell(v) {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s; // evita fórmulas al abrir en hojas de cálculo
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const STATUS_LABEL = { onTime: "Pagado a tiempo", late: "Pagado tarde", paid: "Pagado", pending: "Pendiente", dueToday: "Pendiente", overdue: "Vencido" };
  function toCSV(rows, headers) {
    const h = headers || ["Fecha de pago", "Fecha de vencimiento", "Deuda", "Categoría", "Monto", "Moneda", "Estado"];
    const lines = [h.map(csvCell).join(",")];
    for (const r of rows) {
      const amount = r.currency === "COP" ? String(Math.round(r.amount)) : (Math.round(r.amount * 100) / 100).toFixed(2);
      lines.push([r.date, r.dueDate || "", r.name, r.category, amount, r.currency, r.statusLabel || STATUS_LABEL[r.status] || ""].map(csvCell).join(","));
    }
    return "﻿" + lines.join("\r\n") + "\r\n";
  }
  /* Ajustes de recordatorios: hora del aviso y días de anticipación (1, 3 o 7).
     Activar o desactivar usa la preferencia existente de avisos del dispositivo. */
  const AVISOS_KEY = "mpdd-avisos-v1";
  const AVISOS_OPT = "mpdd-foreground-notices-enabled-v1";
  function readAvisos(store) {
    const out = { enabled: false, time: "08:00", timeSet: false, daysBefore: 3 };
    try {
      out.enabled = store.getItem(AVISOS_OPT) === "true";
      const raw = store.getItem(AVISOS_KEY);
      if (raw !== null) {
        const v = JSON.parse(raw);
        if (v && typeof v === "object") {
          if (typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) {
            out.time = v.time;
            out.timeSet = true;
          }
          if ([1, 3, 7].includes(v.daysBefore)) out.daysBefore = v.daysBefore;
        }
      }
    } catch (_) {}
    return out;
  }
  function validAvisos(v) {
    return !!v && typeof v === "object" && (v.time === undefined || (typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))) && [1, 3, 7].includes(v.daysBefore);
  }
  return { AVISOS_KEY, AVISOS_OPT, readAvisos, validAvisos, CATEGORIES, NO_CATEGORY, STATUS_LABEL, validDate, addDays, monthDue, monthEnd, dueDay, minPayment, categoryLabel, paymentStatus, installments, payments, monthSummary, dayColor, daysBetween, overdueFrom, upcoming, cutoffs, owed, dueLevel, badgeCount, toCSV, csvCell };
});
