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
    if (currency !== "USD" && currency !== "COP") return;
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
  /* Color de un día del calendario. */
  function dayColor(date, today, dayInstallments, dayPayments) {
    if (date === today) return "today";
    const all = [...dayInstallments.map((i) => i.status), ...dayPayments.map((p) => p.status)];
    if (all.some((s) => s === "overdue" || s === "late")) return "late";
    if (all.some((s) => s === "onTime" || s === "paid")) return "paid";
    if (all.some((s) => s === "pending" || s === "dueToday")) return "pending";
    return "none";
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
  return { AVISOS_KEY, AVISOS_OPT, readAvisos, validAvisos, CATEGORIES, NO_CATEGORY, STATUS_LABEL, validDate, addDays, monthDue, monthEnd, dueDay, minPayment, categoryLabel, paymentStatus, installments, payments, monthSummary, dayColor, badgeCount, toCSV, csvCell };
});
