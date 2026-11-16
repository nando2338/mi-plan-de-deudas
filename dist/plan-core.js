/* Motor del plan de pagos (versión 1.3). Lógica pura, sin DOM ni red.
   - Simulación mes a mes: interés mensual = tasa anual / 12; se paga el mínimo de cada
     deuda y el resto del presupuesto (mínimos + extra) va a la deuda prioritaria.
     Cuando una deuda se paga, su pago completo pasa a la siguiente.
   - Avalancha: primero la de mayor tasa. Bola de nieve: primero la de menor saldo
     (saldos convertidos a la moneda del plan).
   - Si hay dos monedas se convierte todo a la moneda del plan con la tasa usada
     (pesos por dólar) y se supone constante; los pagos se devuelven a su moneda original
     con la misma tasa. La TRM solo se usa aquí, nunca en los totales de Inicio. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MPDDPlanCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const CURRENCIES = ["USD", "COP"];
  const MAX_MONTHS = 600;
  const round = (n, c) => (c === "COP" ? Math.round(n) : Math.round(n * 100) / 100);
  const pad = (n) => String(n).padStart(2, "0");

  function validRate(fx) {
    return typeof fx === "number" && Number.isFinite(fx) && fx >= 100 && fx <= 100000;
  }
  /* Convierte entre USD y COP. fx = pesos colombianos por 1 dólar. */
  function convert(amount, from, to, fx) {
    const n = Number(amount) || 0;
    if (from === to) return n;
    if (!validRate(fx)) throw new Error("Falta la tasa de cambio");
    if (from === "USD" && to === "COP") return n * fx;
    if (from === "COP" && to === "USD") return n / fx;
    throw new Error("Moneda no soportada");
  }
  /* Monedas que aparecen entre los ingresos y las deudas con saldo. */
  function currenciesUsed(incomeCurrency, debts) {
    const set = new Set();
    if (CURRENCIES.includes(incomeCurrency)) set.add(incomeCurrency);
    for (const d of debts || []) if (Number(d.balance) > 0 && CURRENCIES.includes(d.currency)) set.add(d.currency);
    return CURRENCIES.filter((c) => set.has(c));
  }
  function needsFx(incomeCurrency, planCurrency, debts) {
    const used = currenciesUsed(incomeCurrency, debts);
    return used.length > 1 || (used.length === 1 && used[0] !== planCurrency);
  }
  function monthAdd(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + "-" + pad((t % 12) + 1);
  }
  function dueDateIn(ym, day) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return ym + "-" + pad(Math.min(day, last));
  }
  function dueDay(d) {
    const n = Number(d && d.due);
    return d && d.due !== "" && d.due !== null && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  }
  function numOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  /* Qué le falta a cada deuda para poder planear: tasa o mínimo. */
  function missingFields(debts) {
    const out = {};
    for (const d of debts || []) {
      if (!(Number(d.balance) > 0)) continue;
      const miss = [];
      const r = numOrNull(d.rate);
      if (r === null || r < 0 || r > 1000) miss.push("rate");
      const m = numOrNull(d.minPayment);
      if (m === null || m <= 0) miss.push("minPayment");
      if (miss.length) out[String(d.id)] = miss;
    }
    return out;
  }

  /* Simulación en una sola moneda. debts: [{ id, balance, rate, min }] (moneda del plan).
     Trabaja en centavos para evitar errores de redondeo. */
  function simulate(debts, extra, method, startYm, maxMonths = MAX_MONTHS) {
    if (!["avalanche", "snowball"].includes(method)) throw new Error("Método inválido");
    const C = 100;
    const a = debts
      .filter((d) => Number(d.balance) > 0)
      .map((d, i) => ({ id: String(d.id), balance: Math.round(d.balance * C), min: Math.round(Math.max(0, d.min) * C), monthly: Math.max(0, Number(d.rate) || 0) / 100 / 12, idx: i, interest: 0, payoff: null }));
    const budget = a.reduce((s, d) => s + d.min, 0) + Math.round(Math.max(0, extra) * C);
    const first = new Map();
    let totalInterest = 0,
      months = 0,
      status = "paid";
    if (!a.length) return { status, months: 0, payoffYm: startYm, totalInterest: 0, firstMonth: first, payoffs: {} };
    for (let n = 1; n <= maxMonths; n++) {
      const live = a.filter((d) => d.balance > 0);
      for (const d of live) {
        const charge = Math.round(d.balance * d.monthly);
        d.balance += charge;
        d.interest += charge;
        totalInterest += charge;
      }
      let remaining = budget;
      const paidNow = new Map();
      for (const d of live) {
        const pay = Math.min(d.min, d.balance, remaining);
        d.balance -= pay;
        remaining -= pay;
        paidNow.set(d.id, pay);
      }
      const order = live
        .filter((d) => d.balance > 0)
        .sort((x, y) => (method === "avalanche" ? y.monthly - x.monthly || x.balance - y.balance || x.idx - y.idx : x.balance - y.balance || y.monthly - x.monthly || x.idx - y.idx));
      for (const d of order) {
        if (!remaining) break;
        const pay = Math.min(remaining, d.balance);
        d.balance -= pay;
        remaining -= pay;
        paidNow.set(d.id, paidNow.get(d.id) + pay);
      }
      const ym = monthAdd(startYm, n - 1);
      for (const d of live) if (d.balance === 0 && !d.payoff) d.payoff = ym;
      if (n === 1) for (const [id, c] of paidNow) first.set(id, c / C);
      months = n;
      if (a.every((d) => d.balance === 0)) break;
      if (!Number.isSafeInteger(totalInterest) || a.some((d) => !Number.isSafeInteger(d.balance))) {
        status = "never";
        break;
      }
      if (n === maxMonths) status = "never";
    }
    const payoffs = {};
    for (const d of a) payoffs[d.id] = d.payoff;
    return { status, months, payoffYm: status === "paid" ? monthAdd(startYm, months - 1) : null, totalInterest: totalInterest / C, firstMonth: first, payoffs };
  }

  /* Plan completo.
     input: { income, incomeCurrency, planCurrency, expenses:[{amount}], extra, method,
              fx (pesos por dólar o null), debts:[{id,name,currency,balance,rate,minPayment,due}], today: "YYYY-MM-DD" } */
  function buildPlan(input) {
    const planCurrency = CURRENCIES.includes(input.planCurrency) ? input.planCurrency : input.incomeCurrency;
    const incomeCurrency = input.incomeCurrency;
    const debts = (input.debts || []).filter((d) => Number(d.balance) > 0 && CURRENCIES.includes(d.currency));
    const fxUsed = needsFx(incomeCurrency, planCurrency, debts);
    const fx = fxUsed ? input.fx : null;
    if (fxUsed && !validRate(fx)) throw new Error("Falta la tasa de cambio");
    const toPlan = (n, c) => convert(n, c, planCurrency, fx);
    const missing = missingFields(debts);
    if (Object.keys(missing).length) {
      const e = new Error("Faltan datos de algunas deudas");
      e.missing = missing;
      throw e;
    }
    const income = Math.max(0, Number(input.income) || 0);
    const expensesTotal = (input.expenses || []).reduce((s, x) => s + Math.max(0, Number(x && x.amount) || 0), 0);
    const incomePlan = round(toPlan(income, incomeCurrency), planCurrency);
    const expensesPlan = round(toPlan(expensesTotal, incomeCurrency), planCurrency);
    // A minimum larger than what is owed only needs the balance plus this month's interest.
    const owedNow = (d) => Number(d.balance) * (1 + Math.max(0, Number(d.rate)) / 1200);
    const planDebts = debts.map((d) => ({ id: String(d.id), balance: toPlan(d.balance, d.currency), rate: Number(d.rate), min: toPlan(Math.min(Number(d.minPayment), owedNow(d)), d.currency) }));
    const minimumsPlan = round(planDebts.reduce((s, d) => s + d.min, 0), planCurrency);
    const free = round(incomePlan - expensesPlan - minimumsPlan, planCurrency);
    const maxExtra = Math.max(0, free);
    const extra = round(Math.min(Math.max(0, Number(input.extra) || 0), maxExtra), planCurrency);
    const method = input.method === "snowball" ? "snowball" : "avalanche";
    const ym = String(input.today).slice(0, 7);
    const withExtra = simulate(planDebts, extra, method, ym);
    const base = simulate(planDebts, 0, method, ym);
    const interestSaved = withExtra.status === "paid" && base.status === "paid" ? round(Math.max(0, base.totalInterest - withExtra.totalInterest), planCurrency) : null;
    const items = debts.map((d) => {
      const id = String(d.id);
      const payPlan = withExtra.firstMonth.get(id) || 0;
      const minPlan = planDebts.find((x) => x.id === id).min;
      // Converting back and forth can lose cents: never show less than the real minimum.
      const realMin = round(Math.min(Number(d.minPayment), owedNow(d)), d.currency);
      const payment = Math.max(round(convert(payPlan, planCurrency, d.currency, fx), d.currency), payPlan > 0 ? realMin : 0);
      const day = dueDay(d);
      // If this month's due day already passed, the next payment date is next month's.
      let due = day ? dueDateIn(ym, day) : null;
      if (due && due < String(input.today)) due = dueDateIn(monthAdd(ym, 1), day);
      return {
        debtId: id,
        name: String(d.name || ""),
        currency: d.currency,
        rate: Number(d.rate),
        balance: Number(d.balance),
        minimum: round(Number(d.minPayment), d.currency),
        payment,
        approx: d.currency !== planCurrency ? round(payPlan, planCurrency) : null,
        first: payPlan > minPlan + (planCurrency === "COP" ? 1 : 0.01),
        dueDate: due,
      };
    });
    // Priority order for display: first the ones receiving extra (in simulation order), then the rest by due date.
    const order = planDebts
      .slice()
      .sort((x, y) => (method === "avalanche" ? y.rate - x.rate || x.balance - y.balance : x.balance - y.balance || y.rate - x.rate))
      .map((d) => d.id);
    items.sort((a, b) => (a.first !== b.first ? (a.first ? -1 : 1) : a.first ? order.indexOf(a.debtId) - order.indexOf(b.debtId) : String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))));
    const totals = {};
    for (const it of items) totals[it.currency] = round((totals[it.currency] || 0) + it.payment, it.currency);
    const totalApprox = fxUsed ? round(items.reduce((s, it) => s + (withExtra.firstMonth.get(it.debtId) || 0), 0), planCurrency) : null;
    return {
      hasDebts: debts.length > 0,
      planCurrency,
      incomeCurrency,
      fxUsed,
      fx: fxUsed ? fx : null,
      month: ym,
      income: incomePlan,
      expenses: expensesPlan,
      minimums: minimumsPlan,
      free,
      extra,
      maxExtra,
      leftover: round(free - extra, planCurrency),
      method,
      payoffYm: withExtra.payoffYm,
      payoffYmWithoutExtra: base.payoffYm,
      status: withExtra.status,
      statusWithoutExtra: base.status,
      interest: round(withExtra.totalInterest, planCurrency),
      interestWithoutExtra: round(base.totalInterest, planCurrency),
      interestSaved,
      items,
      totals,
      totalApprox,
    };
  }
  /* ¿Cambió la TRM más de 3 % frente a la usada? */
  function fxChanged(used, current, threshold = 0.03) {
    if (!validRate(used) || !validRate(current)) return false;
    return Math.abs(current - used) / used > threshold;
  }
  return { CURRENCIES, MAX_MONTHS, round, validRate, convert, currenciesUsed, needsFx, missingFields, simulate, buildPlan, fxChanged, monthAdd, dueDateIn };
});
