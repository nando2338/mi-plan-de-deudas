/* Gastos fijos (versión 1.8): lógica pura, sin DOM, almacenamiento ni red.
   Un gasto fijo en el dispositivo (clave mpdd-gastos-fijos-v1, lista de objetos):
     { id, name, amount, currency: "USD"|"COP"|"EUR",
       frequency: "monthly"|"quarterly"|"semiannual"|"annual",
       day: 1..31 (día de pago), month: 1..12 (mes de un pago; null si es mensual),
       category: clave ("agua", "luz"… o "c-<id>" para las propias), note,
       payments: [{ period: "YYYY-MM", date: "YYYY-MM-DD", amount }],
       createdAt: "YYYY-MM-DD", updatedAt: ISO, deleted: true (solo marca de borrado para sincronizar) }
   Las fechas son texto YYYY-MM-DD en la zona horaria del dispositivo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MPDDGastosCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "mpdd-gastos-fijos-v1";
  const CATS_KEY = "mpdd-gastos-categorias-v1";
  const CURRENCIES = ["USD", "COP", "EUR"];
  /* Months per payment of each frequency. */
  const FREQUENCIES = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  /* Suggested categories: [key, Spanish name, English name, icon]. */
  const CATEGORIES = [
    ["agua", "Agua", "Water", "💧"],
    ["luz", "Luz", "Electricity", "💡"],
    ["gas", "Gas", "Gas", "🔥"],
    ["hoa", "HOA", "HOA", "🏘️"],
    ["impuestos", "Impuestos", "Taxes", "🧾"],
    ["camaras", "Cámaras de seguridad", "Security cameras", "📹"],
    ["cesped", "Corte de césped", "Lawn care", "🌿"],
  ];
  /* Simple icons to choose for categories the user creates. */
  const CUSTOM_ICONS = ["🏠", "📶", "🛡️", "🚨", "📱", "🚗", "💳", "📦", "🧹", "🐶", "🎓", "⭐"];
  const pad = (n) => String(n).padStart(2, "0");

  function validDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && x.getUTCFullYear() === y && x.getUTCMonth() + 1 === m && x.getUTCDate() === d;
  }
  function roundTo(n, currency) {
    const v = Number(n) || 0;
    return currency === "COP" ? Math.round(v) : Math.round(v * 100) / 100;
  }
  /* Due date of a month; a day 31 in a 30-day month (or 29–31 in February) is that month's last day. */
  function monthDue(year, month, day) {
    const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return year + "-" + pad(month) + "-" + pad(Math.min(day, max));
  }
  function addDays(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.getUTCFullYear() + "-" + pad(x.getUTCMonth() + 1) + "-" + pad(x.getUTCDate());
  }
  function daysBetween(a, b) {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }
  function step(g) {
    return FREQUENCIES[g && g.frequency] || 1;
  }
  /* Is a payment due in that month? Monthly: every month. Others: the anchor month and every
     3/6/12 months from it. */
  function isDueMonth(g, year, month) {
    const s = step(g);
    if (s === 1) return true;
    const anchor = Number(g.month);
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 12) return false;
    return (((month - anchor) % s) + s) % s === 0;
  }
  /* What it costs per month on average (an annual 1.200 = 100 per month). */
  function monthlyEquivalent(g) {
    const a = Number(g && g.amount);
    if (!(a > 0)) return 0;
    return a / step(g);
  }
  function active(list) {
    return (Array.isArray(list) ? list : []).filter((g) => g && typeof g === "object" && !g.deleted);
  }
  /* Monthly total per currency (non-monthly expenses converted to monthly), never mixing currencies. */
  function monthlyTotals(list) {
    const out = {};
    for (const g of active(list)) {
      if (!CURRENCIES.includes(g.currency)) continue;
      out[g.currency] = (out[g.currency] || 0) + monthlyEquivalent(g);
    }
    for (const c of Object.keys(out)) out[c] = roundTo(out[c], c);
    return out;
  }
  /* What is actually paid in a calendar month (the full amount in the month it falls due). */
  function dueInMonthTotals(list, year, month) {
    const out = {};
    for (const g of active(list)) {
      if (!CURRENCIES.includes(g.currency) || !isDueMonth(g, year, month)) continue;
      out[g.currency] = roundTo((out[g.currency] || 0) + (Number(g.amount) || 0), g.currency);
    }
    return out;
  }
  function paymentFor(g, period) {
    return (Array.isArray(g.payments) ? g.payments : []).find((p) => p && p.period === period) || null;
  }
  /* First date that counts: creation date, or the start of the current month for old data. */
  function startOf(g, today) {
    return validDate(g.createdAt) ? g.createdAt : today.slice(0, 8) + "01";
  }
  /* Payments of each expense between from and to (inclusive), like the debt installments, so the
     calendar, the reminders and the notifications use them the same way.
     status: "onTime" | "late" (paid) | "overdue" | "dueToday" | "pending". */
  function occurrences(list, { from, to, today }) {
    if (!validDate(from) || !validDate(to) || !validDate(today)) throw new TypeError("Fechas inválidas");
    const out = [];
    for (const g of active(list)) {
      const day = Number(g.day);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      const start = startOf(g, today);
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      for (let n = fy * 12 + fm - 1; n <= ty * 12 + tm - 1; n++) {
        const year = Math.floor(n / 12),
          month = (n % 12) + 1;
        if (!isDueMonth(g, year, month)) continue;
        const dueDate = monthDue(year, month, day);
        if (dueDate < from || dueDate > to || dueDate.slice(0, 7) < start.slice(0, 7)) continue;
        const period = dueDate.slice(0, 7);
        const pay = paymentFor(g, period);
        let status;
        if (pay) status = validDate(pay.date) && pay.date > dueDate ? "late" : "onTime";
        else status = dueDate < today ? "overdue" : dueDate === today ? "dueToday" : "pending";
        out.push({
          kind: "gasto",
          gastoId: String(g.id),
          name: String(g.name || ""),
          currency: g.currency,
          category: g.category || "",
          frequency: g.frequency || "monthly",
          dueDate,
          period,
          status,
          expected: Number(g.amount) || null,
          payment: pay ? { amount: Number(pay.amount), date: pay.date } : null,
        });
      }
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  }
  /* Current payment of an expense for the highlight and the "Pagar" button: the oldest one
     overdue and unpaid (up to 2 months back); otherwise the next one, today or later. */
  function currentOccurrence(g, today) {
    const from = addDays(today.slice(0, 8) + "01", -62).slice(0, 8) + "01";
    const to = addDays(today, 400);
    const list = occurrences([g], { from, to, today });
    return list.find((o) => !o.payment && o.dueDate < today) || list.find((o) => !o.payment && o.dueDate >= today) || null;
  }
  /* Same rules as the debts (1.8): red today/overdue, yellow tomorrow, blue 2–7 days. */
  function dueLevel(dueDate, today, paid) {
    if (paid || !validDate(dueDate) || !validDate(today)) return null;
    const days = daysBetween(today, dueDate);
    if (days < 0) return { level: "red", days, kind: "overdue" };
    if (days === 0) return { level: "red", days, kind: "today" };
    if (days === 1) return { level: "yellow", days, kind: "tomorrow" };
    if (days <= 7) return { level: "blue", days, kind: "soon" };
    return null;
  }
  /* Records the payment of a period (replaces it if one already exists). */
  function markPaid(g, period, date, amount) {
    if (!/^\d{4}-\d{2}$/.test(period) || !validDate(date)) throw new TypeError("Pago inválido");
    const payments = (Array.isArray(g.payments) ? g.payments : []).filter((p) => p && p.period !== period);
    payments.push({ period, date, amount: roundTo(amount === undefined ? g.amount : amount, g.currency) });
    payments.sort((a, b) => a.period.localeCompare(b.period));
    // Only the last 5 years, so the record does not grow forever.
    return Object.assign({}, g, { payments: payments.slice(-60) });
  }
  function unmarkPaid(g, period) {
    return Object.assign({}, g, { payments: (Array.isArray(g.payments) ? g.payments : []).filter((p) => p && p.period !== period) });
  }
  /* Validates an expense typed by the user. Returns the list of wrong fields (empty = valid). */
  function validate(g) {
    const bad = [];
    if (!g || typeof g !== "object") return ["all"];
    if (typeof g.name !== "string" || !g.name.trim() || g.name.length > 80) bad.push("name");
    const a = Number(g.amount);
    if (!(a > 0) || a > 1e12 || !Number.isFinite(a)) bad.push("amount");
    if (!CURRENCIES.includes(g.currency)) bad.push("currency");
    if (!FREQUENCIES[g.frequency]) bad.push("frequency");
    const d = Number(g.day);
    if (!Number.isInteger(d) || d < 1 || d > 31) bad.push("day");
    if (step(g) > 1) {
      const m = Number(g.month);
      if (!Number.isInteger(m) || m < 1 || m > 12) bad.push("month");
    }
    if (g.note !== undefined && g.note !== null && (typeof g.note !== "string" || g.note.length > 300)) bad.push("note");
    if (g.category !== undefined && g.category !== null && (typeof g.category !== "string" || g.category.length > 40)) bad.push("category");
    return bad;
  }
  /* Cleans a stored list (backups, sync): keeps only valid expenses and fields. */
  function sanitize(list) {
    const out = [];
    const seen = new Set();
    for (const g of Array.isArray(list) ? list : []) {
      if (!g || typeof g !== "object" || typeof g.id !== "string" || !g.id || g.id.length > 80 || seen.has(g.id)) continue;
      seen.add(g.id);
      if (g.deleted) {
        out.push({ id: g.id, deleted: true, updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : new Date(0).toISOString() });
        continue;
      }
      if (validate(g).length) continue;
      out.push({
        id: g.id,
        name: g.name.trim(),
        amount: roundTo(g.amount, g.currency),
        currency: g.currency,
        frequency: g.frequency,
        day: Number(g.day),
        month: step(g) > 1 ? Number(g.month) : null,
        category: typeof g.category === "string" ? g.category : "",
        note: typeof g.note === "string" ? g.note : "",
        payments: (Array.isArray(g.payments) ? g.payments : [])
          .filter((p) => p && /^\d{4}-\d{2}$/.test(p.period) && validDate(p.date) && Number(p.amount) >= 0)
          .map((p) => ({ period: p.period, date: p.date, amount: Number(p.amount) }))
          .slice(-60),
        createdAt: validDate(g.createdAt) ? g.createdAt : undefined,
        updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : undefined,
      });
    }
    return out;
  }
  /* Category name and icon (suggested or one created by the user). */
  function categoryInfo(key, custom, lang) {
    const c = CATEGORIES.find((x) => x[0] === key);
    if (c) return { key, label: lang === "en" ? c[2] : c[1], icon: c[3], custom: false };
    const own = (Array.isArray(custom) ? custom : []).find((x) => x && x.key === key);
    if (own) return { key, label: String(own.label || ""), icon: CUSTOM_ICONS.includes(own.icon) ? own.icon : "⭐", custom: true };
    return { key: "", label: lang === "en" ? "No category" : "Sin categoría", icon: "📌", custom: false };
  }
  /* Database row (table gastos_fijos) ↔ device object. */
  const FREQ_DB = { monthly: "mensual", quarterly: "trimestral", semiannual: "semestral", annual: "anual" };
  function toRow(g) {
    if (g.deleted) return { id: g.id, borrado: g.updatedAt || new Date().toISOString(), actualizado: g.updatedAt || new Date().toISOString() };
    return {
      id: g.id,
      nombre: g.name,
      monto: g.amount,
      moneda: g.currency,
      frecuencia: FREQ_DB[g.frequency],
      dia: g.day,
      mes: step(g) > 1 ? g.month : null,
      categoria: g.category || null,
      nota: g.note || null,
      pagos: g.payments || [],
      creado_en: g.createdAt || null,
      actualizado: g.updatedAt || new Date().toISOString(),
      borrado: null,
    };
  }
  function fromRow(r) {
    if (!r || typeof r !== "object") return null;
    if (r.borrado) return { id: String(r.id), deleted: true, updatedAt: r.actualizado || r.borrado };
    const freq = Object.keys(FREQ_DB).find((k) => FREQ_DB[k] === r.frecuencia) || "monthly";
    const list = sanitize([
      {
        id: String(r.id),
        name: r.nombre,
        amount: Number(r.monto),
        currency: r.moneda,
        frequency: freq,
        day: r.dia,
        month: r.mes,
        category: r.categoria || "",
        note: r.nota || "",
        payments: Array.isArray(r.pagos) ? r.pagos : [],
        createdAt: r.creado_en || undefined,
        updatedAt: r.actualizado,
      },
    ]);
    return list[0] || null;
  }
  /* Last write wins, expense by expense (updatedAt). Deleted ones stay as a mark. */
  function merge(local, remote) {
    const byId = new Map();
    const t = (g) => Date.parse(g && g.updatedAt) || 0;
    for (const g of sanitize(local)) byId.set(g.id, g);
    for (const g of sanitize(remote)) {
      const cur = byId.get(g.id);
      if (!cur || t(g) > t(cur)) byId.set(g.id, g);
    }
    return [...byId.values()];
  }
  /* In-app reminders (1.8, like the debts): unpaid payments due exactly daysBefore days from
     today, or today. key is unique per expense, due date and offset (no repeated notices). */
  function reminders(list, { today, daysBefore }) {
    const before = Number.isInteger(daysBefore) && daysBefore >= 0 ? daysBefore : 3;
    if (!validDate(today)) return [];
    const out = [];
    for (const o of occurrences(list, { from: today, to: addDays(today, before), today })) {
      if (o.payment) continue;
      const days = daysBetween(today, o.dueDate);
      if (days !== before && days !== 0) continue;
      out.push({ key: "gasto|" + encodeURIComponent(o.gastoId) + "|" + o.dueDate + "|" + days, gastoId: o.gastoId, name: o.name, dueDate: o.dueDate, offsetDays: days, currency: o.currency, expected: o.expected });
    }
    return out;
  }
  function reminderMessage(e, lang) {
    const time = e.offsetDays === 0 ? (lang === "en" ? "today" : "hoy") : lang === "en" ? "in " + e.offsetDays + " days" : "en " + e.offsetDays + " días";
    return lang === "en" ? e.name + ": fixed expense due " + time + "." : e.name + ": gasto fijo vence " + time + ".";
  }
  return {
    reminders,
    reminderMessage,
    KEY,
    CATS_KEY,
    CURRENCIES,
    FREQUENCIES,
    CATEGORIES,
    CUSTOM_ICONS,
    validDate,
    monthDue,
    isDueMonth,
    monthlyEquivalent,
    monthlyTotals,
    dueInMonthTotals,
    occurrences,
    currentOccurrence,
    dueLevel,
    markPaid,
    unmarkPaid,
    validate,
    sanitize,
    categoryInfo,
    toRow,
    fromRow,
    merge,
    active,
  };
});
