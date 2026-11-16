/* Única función de formato de montos de la app (versión 1.2).
   USD: US$1,250.00 USD  (en-US, coma de miles, punto y 2 decimales)
   COP: $1.250.000 COP   (es-CO, punto de miles, sin decimales)
   Nunca convierte ni suma monedas distintas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.MPDDMoney = api;
    root.formatMoney = api.formatMoney;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const CURRENCIES = ["USD", "COP"];
  const usd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cop = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function formatMoney(amount, currency) {
    let n = Number(amount);
    if (!Number.isFinite(n)) n = 0;
    const neg = n < 0;
    const abs = Math.abs(n);
    if (currency === "COP") {
      const r = Math.round(abs);
      return (neg && r ? "−" : "") + "$" + cop.format(r) + " COP";
    }
    const r = Math.round(abs * 100) / 100;
    return (neg && r ? "−" : "") + "US$" + usd.format(r) + " USD";
  }
  /* Totals per currency. Never mixes currencies: returns { USD: n, COP: n } only for those present. */
  function totalsByCurrency(items, value) {
    const out = {};
    for (const it of items || []) {
      if (!CURRENCIES.includes(it.currency)) continue;
      const v = Number(value(it));
      if (!Number.isFinite(v)) continue;
      out[it.currency] = (out[it.currency] || 0) + v;
    }
    for (const c of Object.keys(out)) out[c] = c === "COP" ? Math.round(out[c]) : Math.round(out[c] * 100) / 100;
    return out;
  }
  /* Currencies in fixed display order (USD first, then COP). */
  function ordered(totals) {
    return CURRENCIES.filter((c) => Object.prototype.hasOwnProperty.call(totals, c));
  }
  /* Tasa de cambio (pesos por dólar) con sus 2 decimales oficiales: $3.912,45 COP. */
  const rate = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function formatRate(n) {
    const v = Number(n);
    return "$" + rate.format(Number.isFinite(v) ? v : 0) + " COP";
  }
  return { CURRENCIES, formatMoney, formatRate, totalsByCurrency, ordered };
});
