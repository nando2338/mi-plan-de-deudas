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
  const CURRENCIES = ["USD", "COP", "EUR"];
  const MAX_MONTHS = 600;
  const round = (n, c) => (c === "COP" ? Math.round(n) : Math.round(n * 100) / 100);
  const pad = (n) => String(n).padStart(2, "0");

  /* TRM: pesos colombianos por 1 dólar. */
  function validRate(fx) {
    return typeof fx === "number" && Number.isFinite(fx) && fx >= 100 && fx <= 100000;
  }
  /* Euro (1.8): dólares por 1 euro (tasa de referencia del Banco Central Europeo, ~1,05). */
  function validEurRate(r) {
    return typeof r === "number" && Number.isFinite(r) && r >= 0.2 && r <= 5;
  }
  /* fx can be a number (TRM, as in 1.3–1.7) or { cop: TRM, eur: dollars per euro }. */
  function normalizeFx(fx) {
    if (typeof fx === "number") return { cop: validRate(fx) ? fx : null, eur: null };
    const o = fx && typeof fx === "object" ? fx : {};
    return { cop: validRate(o.cop) ? o.cop : null, eur: validEurRate(o.eur) ? o.eur : null };
  }
  function missingFx(err, which) {
    const e = new Error("Falta la tasa de cambio");
    e.missingFx = which;
    return e;
  }
  /* Converts between USD, COP and EUR, always through the dollar:
     COP↔USD with the TRM; EUR↔USD with the ECB rate; EUR↔COP = EUR→USD→COP. */
  function convert(amount, from, to, fx) {
    const n = Number(amount) || 0;
    if (from === to) return n;
    if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to)) throw new Error("Moneda no soportada");
    const r = normalizeFx(fx);
    const need = [];
    if ((from === "COP" || to === "COP") && !r.cop) need.push("cop");
    if ((from === "EUR" || to === "EUR") && !r.eur) need.push("eur");
    if (need.length) throw missingFx(null, need);
    const usd = from === "USD" ? n : from === "COP" ? n / r.cop : n * r.eur;
    return to === "USD" ? usd : to === "COP" ? usd * r.cop : usd / r.eur;
  }
  /* Which rates a plan needs: "cop" (TRM) and/or "eur" (ECB). */
  function ratesNeeded(incomeCurrency, planCurrency, debts) {
    const used = new Set(currenciesUsed(incomeCurrency, debts));
    used.add(planCurrency);
    const out = [];
    if (used.size > 1 && used.has("COP")) out.push("cop");
    if (used.size > 1 && used.has("EUR")) out.push("eur");
    return out;
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

  /* Tasa mensual a partir de la tasa anual en %. Las deudas guardan la tasa nominal anual
     (APR): mensual = APR / 12. Si una deuda indica rateType "EA" (efectiva anual), la tasa
     mensual equivalente es (1 + EA)^(1/12) − 1. */
  function monthlyRate(rate, rateType) {
    const r = Math.max(0, Number(rate) || 0) / 100;
    return rateType === "EA" ? Math.expm1(Math.log1p(r) / 12) : r / 12;
  }
  /* Lo que se debe este mes en la moneda de la deuda: saldo + interés del mes, cada uno
     redondeado a la unidad de la moneda (COP pesos enteros, USD centavos), igual que la simulación. */
  function owedThisMonth(d) {
    const c = d.currency;
    const b = Math.max(0, Number(d.balance) || 0);
    return round(round(b, c) + round(b * monthlyRate(d.rate, d.rateType), c), c);
  }

  /* Simulación en una sola moneda. debts: [{ id, balance, rate, min, rateType? }] (moneda del plan).
     Trabaja en centavos para evitar errores de redondeo.
     Devuelve también, por deuda, el mes (YYYY-MM) y el número de mes (1 = primer mes) en que
     queda pagada, y el orden en que se van pagando. */
  function simulate(debts, extra, method, startYm, maxMonths = MAX_MONTHS) {
    if (!["avalanche", "snowball"].includes(method)) throw new Error("Método inválido");
    const C = 100;
    const a = debts
      .filter((d) => Number(d.balance) > 0)
      .map((d, i) => ({ id: String(d.id), balance: Math.round(d.balance * C), min: Math.round(Math.max(0, d.min) * C), monthly: monthlyRate(d.rate, d.rateType), idx: i, payoffN: null, interest: 0, payoff: null }));
    const budget = a.reduce((s, d) => s + d.min, 0) + Math.round(Math.max(0, extra) * C);
    const first = new Map();
    let totalInterest = 0,
      months = 0,
      status = "paid";
    if (!a.length) return { status, months: 0, payoffYm: startYm, totalInterest: 0, firstMonth: first, payoffs: {}, payoffMonths: {}, order: [] };
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
      for (const d of live)
        if (d.balance === 0 && !d.payoff) {
          d.payoff = ym;
          d.payoffN = n;
        }
      if (n === 1) for (const [id, c] of paidNow) first.set(id, c / C);
      months = n;
      if (a.every((d) => d.balance === 0)) break;
      if (!Number.isSafeInteger(totalInterest) || a.some((d) => !Number.isSafeInteger(d.balance))) {
        status = "never";
        break;
      }
      if (n === maxMonths) status = "never";
    }
    const payoffs = {},
      payoffMonths = {};
    for (const d of a) {
      payoffs[d.id] = d.payoff;
      payoffMonths[d.id] = d.payoffN;
    }
    const order = a
      .filter((d) => d.payoffN)
      .sort((x, y) => x.payoffN - y.payoffN || x.idx - y.idx)
      .map((d) => d.id);
    return { status, months, payoffYm: status === "paid" ? monthAdd(startYm, months - 1) : null, totalInterest: totalInterest / C, firstMonth: first, payoffs, payoffMonths, order };
  }

  /* Plan completo.
     input: { income, incomeCurrency, planCurrency, expenses:[{amount}], extra, method,
              fx (pesos por dólar o null), debts:[{id,name,currency,balance,rate,minPayment,due}], today: "YYYY-MM-DD" } */
  function buildPlan(input) {
    const planCurrency = CURRENCIES.includes(input.planCurrency) ? input.planCurrency : input.incomeCurrency;
    const incomeCurrency = input.incomeCurrency;
    const debts = (input.debts || []).filter((d) => Number(d.balance) > 0 && CURRENCIES.includes(d.currency));
    const fxUsed = needsFx(incomeCurrency, planCurrency, debts);
    // input.fx: TRM number (1.3–1.7) or { cop, eur } (1.8).
    const rates = normalizeFx(input.fx);
    const lacking = fxUsed ? ratesNeeded(incomeCurrency, planCurrency, debts).filter((k) => !rates[k]) : [];
    if (lacking.length) throw missingFx(null, lacking);
    const fx = fxUsed ? rates : null;
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
    const owedNow = (d) => Number(d.balance) * (1 + monthlyRate(d.rate, d.rateType));
    const planDebts = debts.map((d) => ({ id: String(d.id), balance: toPlan(d.balance, d.currency), rate: Number(d.rate), rateType: d.rateType, min: toPlan(Math.min(Number(d.minPayment), owedNow(d)), d.currency) }));
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
      // Converting back and forth can lose or add cents. Rules, in the debt's own currency:
      // never more than what is owed this month (balance + this month's interest); never less
      // than the real minimum (which is itself capped at what is owed); and a debt the plan
      // pays off this month gets exactly what is owed.
      const owed = owedThisMonth(d);
      const realMin = Math.min(round(Number(d.minPayment), d.currency), owed);
      let payment = 0;
      if (payPlan > 0) {
        const back = round(convert(payPlan, planCurrency, d.currency, fx), d.currency);
        payment = withExtra.payoffMonths[id] === 1 ? owed : Math.min(owed, Math.max(back, realMin));
      }
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
      fx: fxUsed ? rates.cop : null,
      fxEur: fxUsed ? rates.eur : null,
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
    // Works for the TRM and for the euro rate (any positive rate).
    if (!(used > 0) || !(current > 0) || !Number.isFinite(used) || !Number.isFinite(current)) return false;
    return Math.abs(current - used) / used > threshold;
  }
  return { CURRENCIES, MAX_MONTHS, round, validRate, validEurRate, normalizeFx, ratesNeeded, convert, currenciesUsed, needsFx, missingFields, monthlyRate, owedThisMonth, simulate, buildPlan, fxChanged, monthAdd, dueDateIn };
});
