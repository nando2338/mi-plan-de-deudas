/* Pestaña "Plan" y asistente paso a paso (versión 1.3).
   - Sin plan: tarjeta "Arma tu plan en 2 minutos". Con plan: el plan del mes y "Ajustar mi plan".
   - El plan se guarda en Supabase (tabla debt_plans) y requiere sesión; sin cuenta se puede
     armar y ver, y al tocar "Empezar mi plan" se pide iniciar sesión.
   - La TRM solo se usa aquí, siempre a través de la función de servidor "trm"; la tasa del
     euro (1.8) a través de "tasa-euro" (Banco Central Europeo). Solo se piden las necesarias.
   - Paso 2 (1.8): con gastos fijos (Inicio → Gastos fijos) no se vuelven a pedir.
   - Los datos del usuario solo se insertan con textContent. */
(function () {
  "use strict";
  const root = document.getElementById("plan-root");
  const Core = window.MPDDPlanCore;
  if (!root || !Core || !window.formatMoney) return;
  const T = {
    emptyTitle: "Arma tu plan en 2 minutos",
    emptyText: "Te ayudamos a decidir cuánto pagarle a cada deuda este mes para salir de deudas más rápido.",
    start: "Empezar",
    noAccountNote: "Puedes armarlo sin cuenta; para guardarlo necesitas iniciar sesión.",
    adjust: "Ajustar mi plan",
    loading: "Cargando tu plan…",
    loadError: "No pudimos cargar tu plan guardado. Revisa tu conexión.",
    needsUpdate: "Hay deudas sin tasa o sin pago mínimo. Ajusta tu plan para incluirlas.",
    trmChanged: "La TRM cambió. ¿Actualizar tu plan?",
    update: "Actualizar",
    step: "Paso",
    of: "de",
    back: "Atrás",
    close: "Salir",
    next: "Siguiente",
    s1Title: "¿Cuánto dinero te entra al mes?",
    s1Note: "Si tu ingreso cambia cada mes, pon el del mes más bajo.",
    s1Amount: "Ingresos del mes",
    s1Currency: "Moneda de tus ingresos",
    s1PlanCurrency: "¿En qué moneda quieres ver tu plan?",
    s1Error: "Escribe cuánto dinero te entra al mes.",
    s2Title: "¿Cuánto gastas en lo básico?",
    s2Note: "Escribe los montos en la moneda de tus ingresos:",
    vivienda: "Vivienda",
    comida: "Comida y mercado",
    transporte: "Transporte",
    servicios: "Servicios",
    otros: "Otros",
    otherExpense: "Otro gasto",
    otherName: "Nombre del gasto",
    addExpense: "+ Agregar otro gasto",
    remove: "Quitar",
    s2Total: "Total de gastos básicos:",
    s3Title: "Tus pagos mínimos",
    s3Note: "Los tomamos de tus deudas registradas, cada una en su moneda.",
    noDebts: "Aún no tienes deudas registradas",
    addDebt: "Agregar una deuda",
    missingDebt: "¿Falta una deuda? Agrégala aquí",
    rate: "Tasa:",
    minimum: "Mínimo:",
    rateInput: "Tasa de interés anual (%)",
    minInput: "Pago mínimo mensual",
    s3Total: "Total de mínimos:",
    approx: "aproximado",
    s3Error: "Completa la tasa y el pago mínimo de cada deuda.",
    s3SaveError: "No se pudieron guardar los datos de las deudas.",
    trmToday: "TRM de hoy:",
    trmLast: "Última TRM disponible:",
    trmUsed: "TRM usada en tu plan:",
    trmCustom: "Tasa personalizada:",
    trmSource: "Superintendencia Financiera",
    trmOther: "Usar otra tasa",
    trmOfficial: "Volver a la TRM oficial",
    trmInput: "Tu tasa (pesos por 1 dólar)",
    trmUse: "Usar esta tasa",
    trmBad: "Escribe una tasa válida, por ejemplo 4000.",
    trmMissing: "No pudimos obtener la TRM. Escribe una tasa para continuar.",
    trmLoading: "Consultando la TRM…",
    trmNote: "Los valores convertidos son aproximados. Tu banco puede cobrar una tasa distinta.",
    s4Free: "Cada mes te quedan libres",
    s4Income: "Ingresos",
    s4Basics: "Gastos básicos",
    s4Minimums: "Pagos mínimos",
    s4Question: "¿Cuánto quieres poner extra a tus deudas?",
    s4Extra: "Extra a tus deudas",
    s4Payoff: "Quedas libre de deudas en",
    s4PayoffBase: "Solo con los mínimos:",
    s4Saved: "Intereses que te ahorras:",
    s4Left: "Te queda al mes para imprevistos:",
    s4Never: "Con estos pagos alguna deuda no se termina de pagar. Sube el extra o revisa los mínimos.",
    s4Negative: "Tus gastos y mínimos superan tus ingresos",
    s4NegativeText: "No te preocupes: es un buen punto de partida. Algunas ideas:",
    idea1: "Revisa suscripciones y gastos pequeños que se repiten cada mes.",
    idea2: "Compara precios de servicios como celular, internet o seguros.",
    idea3: "Llama a tu banco y pregunta por un acuerdo de pago o una tasa más baja.",
    idea4: "Por ahora, cubre los mínimos para evitar recargos.",
    s5Title: "Tu plan para",
    avalanche: "Método avalancha: primero la deuda con mayor interés.",
    snowball: "Método bola de nieve: primero la deuda con menor saldo.",
    payFirst: "PAGA PRIMERO",
    payMin: "PAGA SOLO EL MÍNIMO",
    dueOn: "Fecha de pago:",
    noDue: "Sin fecha de pago",
    total: "Total a pagar este mes",
    startPlan: "Empezar mi plan",
    trySnowball: "Probar método bola de nieve",
    tryAvalanche: "Volver al método avalancha",
    needAccount: "Para guardar tu plan necesitas una cuenta. Así lo verás en todos tus dispositivos.",
    goAccount: "Crear cuenta o iniciar sesión",
    saving: "Guardando tu plan…",
    saved: "¡Listo! Tu plan quedó guardado y tus pagos del mes están en el calendario.",
    saveError: "No se pudo guardar tu plan. Revisa tu conexión e inténtalo de nuevo.",
    remindersOff: "Activa los avisos en Más → Notificaciones para que te recordemos cada pago.",
    planPaid: "Pagado",
    resume: "Continuar con tu plan",
    resumeText: "Tienes un plan sin guardar. Ya puedes guardarlo con tu cuenta.",
    discard: "Descartar",
    fxNeedsUpdate: "Agregaste una deuda en otra moneda. Ajusta tu plan para elegir la tasa de cambio.",
    noDebtsPlan: "Agrega al menos una deuda para armar tu plan.",
    baseNever: "Solo con los mínimos no terminarías de pagar.",
    all: "Todo",
    exitTitle: "¿Salir del asistente?",
    exitText: "Perderás lo que llevas.",
    exitStay: "Seguir en el asistente",
    methodSaved: "Listo: tu plan ahora usa este método.",
    // 1.8: euro rate (European Central Bank, dollars per 1 euro).
    eurChanged: "La tasa del euro cambió. ¿Actualizar tu plan?",
    eurToday: "Tasa del euro:",
    eurLast: "Última tasa disponible:",
    eurUsed: "Tasa del euro usada en tu plan:",
    eurCustom: "Tasa del euro personalizada:",
    eurSource: "Banco Central Europeo",
    eurOfficial: "Volver a la tasa oficial",
    eurInput: "Tu tasa (dólares por 1 euro)",
    eurBad: "Escribe una tasa válida, por ejemplo 1.08.",
    eurMissing: "No pudimos obtener la tasa del euro. Escribe una tasa para continuar.",
    eurLoading: "Consultando la tasa del euro…",
    // 1.8: fixed expenses (Inicio → Gastos fijos) in step 2.
    s2FixedTitle: "Tus gastos del mes",
    s2Fixed: "Tus gastos fijos del mes:",
    s2FixedNote: "Los tomamos de tus gastos fijos de Inicio. No tienes que escribirlos de nuevo.",
    s2Edit: "Editar",
    s2Others: "Otros gastos del mes (comida, transporte…)",
    s2OthersNote: "Solo lo que no está en tus gastos fijos.",
    s2StepTotal: "Total de gastos del mes:",
    s2SaveFixed: "Guardar estos gastos como gastos fijos",
    s2SaveFixedNote: "Se guardan vivienda, servicios y los gastos que agregaste, como pagos mensuales con día de pago 1. Comida, transporte y otros no, porque cambian cada mes. Puedes cambiar el día de pago en Inicio → Gastos fijos.",
    s2SaveFixedError: "No se pudieron guardar tus gastos fijos. Inténtalo de nuevo.",
    s2Saved: "Listo: guardamos tus gastos como gastos fijos.",
    fixedName: "Gastos fijos",
    tabFixedA: "De tus ingresos,",
    tabFixedB: "se van en gastos fijos.",
    resumeFixed: "Tienes un plan sin terminar. Continúa cuando revises tus gastos fijos.",
  };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { plan: T });
  /* 1.8: wizard items that are bills and can be saved as fixed expenses. */
  const FIXED_LIKE = ["vivienda", "servicios", "custom"];
  const EXPENSES = [
    ["vivienda", "🏠"],
    ["comida", "🛒"],
    ["transporte", "🚌"],
    ["servicios", "💡"],
    ["otros", "📦"],
  ];
  const en = () => document.documentElement.lang === "en";
  const fmt = (n, c) => formatMoney(n, c);
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
  function btn(text, cls, fn) {
    const b = el("button", cls, text);
    b.type = "button";
    if (fn) b.addEventListener("click", fn);
    return b;
  }
  const today = () => new Date().toLocaleDateString("en-CA");
  function monthName(ym) {
    if (!ym) return "—";
    const [y, m] = ym.split("-").map(Number);
    return new Intl.DateTimeFormat(en() ? "en-US" : "es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  }
  function longDate(d) {
    const [y, m, dd] = d.split("-").map(Number);
    return new Intl.DateTimeFormat(en() ? "en-US" : "es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd)));
  }
  function appDebts() {
    try {
      if (window.MPDDApp && window.MPDDApp.debts) return window.MPDDApp.debts();
      return Array.isArray(debts) ? JSON.parse(JSON.stringify(debts)) : [];
    } catch (_) {
      return [];
    }
  }
  const Cloud = () => window.MPDDCloud || null;
  const signedIn = () => !!(Cloud() && Cloud().status().userId);

  /* ---------------- state ---------------- */
  let saved = null,
    loadedFor = null,
    loadState = "idle",
    trm = null,
    trmState = "idle",
    eur = null,
    eurState = "idle",
    wizard = null,
    draft = null,
    message = null;
  function freshDraft() {
    const ds = appDebts().filter((d) => Number(d.balance) > 0);
    let cur = "COP";
    try {
      const pref = localStorage.getItem("deudas-currency-pref-v1");
      if (Core.CURRENCIES.includes(pref)) cur = pref;
    } catch (_) {}
    return {
      step: 1,
      income: "",
      incomeCurrency: cur,
      planCurrency: null,
      expenses: EXPENSES.map(([key, icon]) => ({ key, icon, amount: "" })),
      others: "",
      saveAsFixed: false,
      extra: null,
      method: "avalanche",
      fx: null,
      fxEur: null,
      edits: {},
      hadDebts: ds.length,
    };
  }
  /* 1.8: the fixed-expenses total of a saved plan is stored as a "custom" item marked fijos
     (older versions read it as one more expense); the other monthly expenses go in "otros". */
  const isFixedEntry = (e) => !!(e && e.key === "custom" && e.fijos === true);
  function draftFromSaved(p) {
    const d = freshDraft();
    d.income = String(Number(p.income));
    d.incomeCurrency = p.income_currency;
    d.planCurrency = p.plan_currency;
    const exp = Array.isArray(p.expenses) ? p.expenses : [];
    d.savedExpenses = exp.map((e) => ({ amount: Math.max(0, Number(e && e.amount) || 0) }));
    d.savedRaw = exp.filter((e) => e && typeof e === "object").map((e) => Object.assign({}, e));
    d.expenses = EXPENSES.map(([key, icon]) => {
      const e = exp.find((x) => x && x.key === key);
      return { key, icon, amount: e && Number(e.amount) > 0 ? String(Number(e.amount)) : "" };
    });
    for (const e of exp) if (e && e.key === "custom" && !isFixedEntry(e)) d.expenses.push({ key: "custom", icon: "➕", label: String(e.label || "").slice(0, 60), amount: String(Number(e.amount) || "") });
    const fixedEntry = exp.find(isFixedEntry);
    d.savedFixed = fixedEntry ? Math.max(0, Number(fixedEntry.amount) || 0) : null;
    // Other monthly expenses: the plan's own "otros" when it already used fixed expenses.
    // In a plan from before 1.8 we cannot know which items are now fixed expenses, so ALL
    // its expenses go into "Otros" (better to subtract too much than to quietly drop rent or
    // utilities); the user sees the amount and can lower it.
    const sumOf = (list) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const others = fixedEntry ? sumOf(exp.filter((e) => e && e.key === "otros")) : sumOf(d.expenses);
    d.others = others > 0 ? String(others) : "";
    d.extra = Number(p.extra) || 0;
    d.method = p.method === "snowball" ? "snowball" : "avalanche";
    if (p.fx_rate) d.fx = { rate: Number(p.fx_rate), type: p.fx_type === "personalizada" ? "personalizada" : "oficial", fecha: p.fx_date || null, desactualizada: false };
    if (p.eur_rate) d.fxEur = { rate: Number(p.eur_rate), type: p.eur_type === "personalizada" ? "personalizada" : "oficial", fecha: p.eur_date || null, desactualizada: false };
    return d;
  }
  function planCurrencyOf(d) {
    const used = Core.currenciesUsed(d.incomeCurrency, appDebts());
    if (used.length > 1) return d.planCurrency || d.incomeCurrency;
    return used[0] || d.incomeCurrency;
  }
  function fxNeeded(d) {
    return Core.needsFx(d.incomeCurrency, planCurrencyOf(d), appDebts());
  }
  /* Rates (1.8): "cop" = TRM (pesos per dollar), "eur" = ECB (dollars per euro). */
  const RATES = {
    cop: { slot: "fx", live: () => (trm && trm.ok ? { rate: trm.valor, fecha: trm.fecha, desactualizada: trm.desactualizada } : null), state: () => trmState },
    eur: { slot: "fxEur", live: () => (eur && eur.ok ? { rate: eur.usdPorEur, fecha: eur.fecha, desactualizada: eur.desactualizada } : null), state: () => eurState },
  };
  /* Rates a set of currencies needs: every currency other than the dollar, when there is more than one. */
  function keysFor(currencies) {
    const set = new Set(currencies);
    const out = [];
    if (set.size > 1 && set.has("COP")) out.push("cop");
    if (set.size > 1 && set.has("EUR")) out.push("eur");
    return out;
  }
  /* Fixed expenses (Inicio → Gastos fijos), monthly total per currency. */
  function fixedList() {
    try {
      return window.MPDDGastos ? window.MPDDGastos.list() : [];
    } catch (_) {
      return [];
    }
  }
  const hasFixed = () => fixedList().length > 0;
  function fixedTotals() {
    try {
      const t = window.MPDDGastos.monthlyTotals() || {};
      const out = {};
      for (const c of Core.CURRENCIES) if (Number(t[c]) > 0) out[c] = Number(t[c]);
      return out;
    } catch (_) {
      return {};
    }
  }
  /* Rates used by the draft: the plan's (income, plan and debt currencies) plus those needed to
     bring the fixed expenses to the income currency. */
  function ratesUsed(d) {
    const keys = new Set(fxNeeded(d) ? Core.ratesNeeded(d.incomeCurrency, planCurrencyOf(d), appDebts()) : []);
    if (!d.snapshot && hasFixed()) for (const k of keysFor([d.incomeCurrency, ...Object.keys(fixedTotals())])) keys.add(k);
    return ["cop", "eur"].filter((k) => keys.has(k));
  }
  function rateOf(d, k) {
    const s = d[RATES[k].slot];
    const live = RATES[k].live();
    if (s && (s.type === "personalizada" || d.useSavedFx)) return s.rate;
    if (live) return live.rate;
    if (s && s.rate) return s.rate;
    return null;
  }
  function infoOf(d, k) {
    const s = d[RATES[k].slot];
    const live = RATES[k].live();
    if (s && d.useSavedFx) return { rate: s.rate, type: s.type, fecha: s.fecha, desactualizada: false, saved: true };
    if (s && s.type === "personalizada") return { rate: s.rate, type: "personalizada", fecha: today(), desactualizada: false };
    if (live) return { rate: live.rate, type: "oficial", fecha: live.fecha, desactualizada: live.desactualizada };
    return null;
  }
  const ratesObj = (d) => ({ cop: rateOf(d, "cop"), eur: rateOf(d, "eur") });
  const fxRate = (d) => rateOf(d, "cop");
  const missingRates = (d) => ratesUsed(d).filter((k) => !rateOf(d, k));
  /* Converts, or null when a rate is missing. */
  function tryConvert(n, from, to, fx) {
    try {
      return Core.convert(n, from, to, fx);
    } catch (_) {
      return null;
    }
  }
  /* Step 2 with fixed expenses: their monthly total in the income currency. */
  function fixedSummary(d) {
    const totals = fixedTotals();
    const fx = ratesObj(d);
    let total = 0,
      approx = false,
      known = true;
    for (const c of Object.keys(totals)) {
      if (c === d.incomeCurrency) total += totals[c];
      else {
        const v = tryConvert(totals[c], c, d.incomeCurrency, fx);
        if (v === null) known = false;
        else total += v;
        approx = true;
      }
    }
    return { totals, total: Core.round(total, d.incomeCurrency), approx, known };
  }
  /* Expenses that go into the plan, in the income currency. */
  function effectiveExpenses(d) {
    if (d.snapshot) return d.savedExpenses || [];
    if (hasFixed()) {
      const f = fixedSummary(d);
      if (!f.known) {
        const e = new Error("Falta la tasa de cambio");
        e.missingFx = missingRates(d);
        throw e;
      }
      return [{ amount: f.total }, { amount: Math.max(0, Number(d.others) || 0) }];
    }
    return d.expenses.map((e) => ({ amount: Number(e.amount) || 0 }));
  }
  function debtsWithEdits(d) {
    return appDebts().map((x) => Object.assign({}, x, d.edits[x.id] || {}));
  }
  function compute(d, overrides = {}) {
    return Core.buildPlan({
      income: Number(d.income) || 0,
      incomeCurrency: d.incomeCurrency,
      planCurrency: planCurrencyOf(d),
      expenses: effectiveExpenses(d),
      extra: overrides.extra !== undefined ? overrides.extra : d.extra || 0,
      method: overrides.method || d.method,
      fx: ratesObj(d),
      debts: debtsWithEdits(d),
      today: today(),
    });
  }
  async function ensureTRM(force) {
    const C = Cloud();
    if (!C || C.status().config !== "ok") {
      trmState = "failed";
      return;
    }
    if (trmState === "loading") return;
    if (trm && !force) return;
    trmState = "loading";
    const r = await C.fetchTRM({ force });
    trm = r && r.ok ? r : null;
    trmState = trm ? "ready" : "failed";
  }
  async function ensureEUR(force) {
    const C = Cloud();
    if (!C || !C.fetchEUR || C.status().config !== "ok") {
      eurState = "failed";
      return;
    }
    if (eurState === "loading") return;
    if (eur && !force) return;
    eurState = "loading";
    const r = await C.fetchEUR({ force });
    eur = r && r.ok ? r : null;
    eurState = eur ? "ready" : "failed";
  }
  /* Fetches only the rates the draft uses, then redraws the wizard. While drawing a step
     (retry false) a rate that already failed is not asked again, so there is no loop. */
  function ensureRates(d, retry) {
    const list = ratesUsed(d);
    const can = (st) => st === "idle" || (retry && st === "failed");
    const jobs = [];
    if (list.includes("cop") && !trm && can(trmState)) jobs.push(ensureTRM());
    if (list.includes("eur") && !eur && can(eurState)) jobs.push(ensureEUR());
    if (jobs.length) Promise.all(jobs).then(() => wizard && renderStep());
  }

  /* ---------------- Plan tab ---------------- */
  function renderTab() {
    root.replaceChildren();
    if (message) {
      const m = el("p", "notice plan-message", message);
      m.setAttribute("role", "status");
      root.append(m);
    }
    if (signedIn() && loadState === "loading" && !saved) {
      root.append(el("p", "label", T.loading));
      return;
    }
    const pd = pendingDraft();
    // A draft kept to edit the fixed expenses is offered with or without an account.
    if (pd && (signedIn() || pd.reason === "gastos")) {
      const box = el("div", "notice plan-resume");
      box.append(el("p", "", pd.reason === "gastos" ? T.resumeFixed : T.resumeText), btn(T.resume, "save", () => openWizard(null, pd)), " ", btn(T.discard, "ghost", () => (dropDraft(), renderTab())));
      root.append(box);
    }
    if (!saved) {
      const card = el("div", "plan-empty");
      card.append(el("h3", "", T.emptyTitle), el("p", "", T.emptyText), btn(T.start, "save plan-start", () => openWizard(null)));
      if (!signedIn()) card.append(el("p", "label", T.noAccountNote));
      if (loadState === "error") card.append(el("p", "label", T.loadError));
      root.append(card);
      return;
    }
    const d = savedDraft();
    let result = null;
    try {
      result = compute(d);
    } catch (e) {
      root.append(el("p", "notice", e && e.missing ? T.needsUpdate : T.fxNeedsUpdate), btn(T.adjust, "save", () => openWizard(saved)));
      return;
    }
    // A rate changed more than 3% since the plan was made (official rates only): TRM and euro.
    for (const k of changedRates()) {
      const box = el("div", "notice plan-trm-changed" + (k === "eur" ? " plan-eur-changed" : ""));
      box.setAttribute("role", "status");
      box.append(el("strong", "", k === "eur" ? T.eurChanged : T.trmChanged), " ", btn(T.update, "save", () => updateWithNewRates()));
      root.append(box);
    }
    const sameMonth = String(saved.plan_month || "").slice(0, 7) === today().slice(0, 7);
    root.append(planView(result, sameMonth && Array.isArray(saved.items) ? saved.items : null, d, true));
    // 1.8: how much of the income already goes to fixed expenses (as saved with the plan).
    if (d.savedFixed > 0) {
      const p = el("p", "label plan-fixed-share");
      p.append(el("span", "", T.tabFixedA), " ", raw("strong", fmt(d.savedFixed, d.incomeCurrency)), " ", el("span", "", T.tabFixedB));
      root.append(p);
    }
    root.append(el("div", "actions"));
    root.lastChild.append(btn(T.adjust, "save", () => openWizard(saved)));
  }
  /* The saved plan as it was made: same expenses and the rates used then. */
  function savedDraft() {
    const d = draftFromSaved(saved);
    d.useSavedFx = true; // the Plan tab shows the rate used when the plan was made
    d.snapshot = true;
    return d;
  }
  function changedRates() {
    const out = [];
    if (saved.fx_type === "oficial" && trm && trm.ok && !trm.desactualizada && Core.fxChanged(Number(saved.fx_rate), trm.valor)) out.push("cop");
    if (saved.eur_type === "oficial" && eur && eur.ok && !eur.desactualizada && Core.fxChanged(Number(saved.eur_rate), eur.usdPorEur)) out.push("eur");
    return out;
  }
  async function updateWithNewRates() {
    const d = savedDraft();
    const changed = changedRates();
    if (changed.includes("cop")) d.fx = { rate: trm.valor, type: "oficial", fecha: trm.fecha };
    if (changed.includes("eur")) d.fxEur = { rate: eur.usdPorEur, type: "oficial", fecha: eur.fecha };
    await savePlan(d, compute(d), true);
  }

  /* Plan of the month (step 5 and the Plan tab). */
  const planFx = (r) => ({ cop: r.fx, eur: r.fxEur });
  function planView(r, savedItems, d, readOnly) {
    const box = el("div", "plan-view");
    const h = el("h2");
    h.append(el("span", "", T.s5Title), " ", raw("span", monthName(r.month)));
    box.append(h, el("p", "label", r.method === "snowball" ? T.snowball : T.avalanche));
    const items = r.items.map((it) => {
      const s = savedItems && savedItems.find((x) => x && x.debtId === it.debtId);
      return s ? Object.assign({}, it, { payment: Number(s.payment), approx: s.approx === null || s.approx === undefined ? null : Number(s.approx), first: !!s.first, dueDate: s.dueDate || it.dueDate }) : it;
    });
    const first = items.filter((i) => i.first),
      rest = items.filter((i) => !i.first);
    if (first.length) {
      box.append(el("div", "plan-tag first", T.payFirst));
      for (const it of first) box.append(itemCard(it, r, true));
    }
    if (rest.length) {
      box.append(el("div", "plan-tag", T.payMin));
      const ul = el("div", "plan-min-list");
      for (const it of rest) ul.append(itemCard(it, r, false));
      box.append(ul);
    }
    const totals = {};
    for (const it of items) totals[it.currency] = Core.round((totals[it.currency] || 0) + it.payment, it.currency);
    const tot = el("div", "plan-total");
    tot.append(el("div", "label", T.total));
    for (const c of Core.CURRENCIES) if (totals[c] !== undefined) tot.append(raw("div", fmt(totals[c], c), "plan-total-line"));
    if (r.fxUsed) {
      const approx = items.reduce((s, it) => s + (it.currency === r.planCurrency ? it.payment : Core.convert(it.payment, it.currency, r.planCurrency, planFx(r))), 0);
      const line = el("div", "plan-approx");
      line.append(raw("span", "≈ " + fmt(approx, r.planCurrency)), " ", raw("span", "("), el("span", "", T.approx), raw("span", ")"));
      tot.append(line);
    }
    box.append(tot);
    if (d) for (const card of rateCards(d, readOnly)) box.append(card);
    return box;
  }
  function itemCard(it, r, highlight) {
    const c = el("div", "plan-item" + (highlight ? " highlight" : ""));
    c.append(raw("strong", it.name, "plan-item-name"));
    const amt = el("div", "plan-item-amount");
    amt.append(raw("span", fmt(it.payment, it.currency)));
    if (r.fxUsed && it.currency !== r.planCurrency) amt.append(" ", raw("small", "(≈ " + fmt(Core.convert(it.payment, it.currency, r.planCurrency, planFx(r)), r.planCurrency) + ")", "plan-approx-small"));
    c.append(amt);
    const meta = el("div", "label");
    if (it.dueDate) meta.append(el("span", "", T.dueOn), " ", raw("span", longDate(it.dueDate)));
    else meta.append(el("span", "", T.noDue));
    c.append(meta);
    return c;
  }
  /* One card per rate the draft uses (TRM first, then the euro). */
  function rateCards(d, readOnly) {
    return ratesUsed(d).map((k) => (k === "eur" ? eurLine(d, readOnly) : trmLine(d, readOnly)));
  }
  function trmLine(d, readOnly) {
    const info = infoOf(d, "cop") || (d.fx ? { rate: d.fx.rate, type: d.fx.type, fecha: d.fx.fecha } : null);
    const box = el("div", "trm-card");
    if (!info) {
      // No official TRM available (offline, cloud not configured or service down): ask for a rate.
      if (!readOnly) box.append(rateControls(d, "cop"), el("p", "label small", T.trmNote));
      return box;
    }
    const line = el("div", "trm-line");
    if (info.saved && info.type === "oficial") line.append(el("strong", "", T.trmUsed), " ", raw("span", "1 USD = " + MPDDMoney.formatRate(info.rate)), " · ", el("span", "", T.trmSource), " · ", raw("span", info.fecha ? longDate(info.fecha) : "—"));
    else if (info.type === "personalizada") line.append(el("strong", "", T.trmCustom), " ", raw("span", "1 USD = " + MPDDMoney.formatRate(info.rate)));
    else if (info.desactualizada) line.append(el("strong", "", T.trmLast), " ", raw("span", info.fecha ? longDate(info.fecha) : "—"), " · ", raw("span", "1 USD = " + MPDDMoney.formatRate(info.rate)));
    else line.append(el("strong", "", T.trmToday), " ", raw("span", "1 USD = " + MPDDMoney.formatRate(info.rate)), " · ", el("span", "", T.trmSource), " · ", raw("span", info.fecha ? longDate(info.fecha) : "—"));
    box.append(line);
    if (!readOnly) box.append(rateControls(d, "cop"));
    box.append(el("p", "label small", T.trmNote));
    return box;
  }
  /* 1.8: euro card, same style as the TRM card. */
  function eurLine(d, readOnly) {
    const info = infoOf(d, "eur") || (d.fxEur ? { rate: d.fxEur.rate, type: d.fxEur.type, fecha: d.fxEur.fecha } : null);
    const box = el("div", "trm-card eur-card");
    if (!info) {
      if (!readOnly) box.append(rateControls(d, "eur"), el("p", "label small", T.trmNote));
      return box;
    }
    const rate = () => raw("span", "1 EUR = " + MPDDMoney.formatEurRate(info.rate));
    const date = () => raw("span", info.fecha ? longDate(info.fecha) : "—");
    const line = el("div", "trm-line");
    if (info.saved && info.type === "oficial") line.append(el("strong", "", T.eurUsed), " ", rate(), " · ", el("span", "", T.eurSource), " · ", date());
    else if (info.type === "personalizada") line.append(el("strong", "", T.eurCustom), " ", rate());
    else if (info.desactualizada) line.append(el("strong", "", T.eurLast), " ", date(), " · ", rate(), " · ", el("span", "", T.eurSource));
    else line.append(el("strong", "", T.eurToday), " ", rate(), " · ", el("span", "", T.eurSource), " · ", date());
    box.append(line);
    if (!readOnly) box.append(rateControls(d, "eur"));
    box.append(el("p", "label small", T.trmNote));
    return box;
  }
  let editing = { cop: false, eur: false };
  function rateControls(d, k) {
    const isEur = k === "eur";
    const slot = RATES[k].slot;
    const wrap = el("div", "trm-controls");
    const missing = !rateOf(d, k);
    if (!editing[k] && !missing) {
      wrap.append(btn(T.trmOther, "ghost" + (isEur ? " eur-other" : ""), () => ((editing[k] = true), renderStep())));
      if (d[slot] && d[slot].type === "personalizada") wrap.append(" ", btn(isEur ? T.eurOfficial : T.trmOfficial, "ghost", () => ((d[slot] = null), renderStep())));
      return wrap;
    }
    if (missing && RATES[k].state() !== "loading") wrap.append(el("p", "error", isEur ? T.eurMissing : T.trmMissing));
    const field = el("div", "field");
    const label = el("label", "", isEur ? T.eurInput : T.trmInput);
    const input = el("input");
    input.type = "number";
    input.min = isEur ? "0.2" : "100";
    input.step = isEur ? "0.0001" : "0.01";
    input.inputMode = "decimal";
    input.id = isEur ? "plan-fx-eur" : "plan-fx";
    input.value = d[slot] && d[slot].type === "personalizada" ? String(d[slot].rate) : "";
    label.htmlFor = input.id;
    field.append(label, input);
    const err = el("p", "error");
    err.setAttribute("role", "alert");
    wrap.append(
      field,
      btn(T.trmUse, "save" + (isEur ? " eur-use" : ""), () => {
        const v = Number(String(input.value).replace(",", "."));
        if (!(isEur ? Core.validEurRate(v) : Core.validRate(v))) {
          err.textContent = isEur ? T.eurBad : T.trmBad;
          return;
        }
        d[slot] = { rate: isEur ? Math.round(v * 10000) / 10000 : Math.round(v * 100) / 100, type: "personalizada", fecha: today() };
        editing[k] = false;
        renderStep();
      }),
      err,
    );
    return wrap;
  }

  /* ---------------- wizard ---------------- */
  function openWizard(fromSaved, fromDraft, opts) {
    if (wizard) {
      wizard.remove();
      wizard = null;
    }
    // A resumed draft opens where it was left (step 2 after editing the fixed expenses, else step 5).
    draft = fromDraft ? Object.assign(freshDraft(), fromDraft, { step: [1, 2, 3, 4, 5].includes(fromDraft.step) ? fromDraft.step : 5, reason: null, saveAsFixed: false }) : fromSaved ? draftFromSaved(fromSaved) : freshDraft();
    draft.snapshot = false;
    draft.useSavedFx = false;
    if (opts && (opts.method === "avalanche" || opts.method === "snowball")) draft.method = opts.method;
    editing = { cop: false, eur: false };
    message = null;
    wizard = el("div", "plan-wizard");
    wizard.setAttribute("role", "dialog");
    wizard.setAttribute("aria-modal", "true");
    wizard.setAttribute("aria-labelledby", "plan-step-title");
    document.body.append(wizard);
    document.body.classList.add("plan-wizard-open");
    ensureRates(draft, true);
    renderStep();
  }
  /* Escape, wherever the focus is (also on <body>), while the wizard is open. Not when
     another dialog is open above it (e.g. the sign-in dialog), which handles its own Escape. */
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !wizard || !wizard.isConnected) return;
      const t = e.target;
      if (t && t.closest && t.closest("dialog[open]") && !wizard.contains(t)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (wizard.querySelector(".pw-confirm")) hideExitConfirm();
      else showExitConfirm();
    },
    true,
  );
  /* Escape asks before leaving (in-app dialog, never window.confirm). */
  function showExitConfirm() {
    if (!wizard || wizard.querySelector(".pw-confirm")) return;
    const back = document.activeElement;
    const layer = el("div", "pw-confirm");
    const box = el("div", "pw-confirm-box");
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "pw-confirm-title");
    box.setAttribute("aria-describedby", "pw-confirm-text");
    const title = el("h3", "", T.exitTitle);
    title.id = "pw-confirm-title";
    const text = el("p", "", T.exitText);
    text.id = "pw-confirm-text";
    const stay = btn(T.exitStay, "save pw-confirm-stay", () => hideExitConfirm());
    const leave = btn(T.close, "ghost pw-confirm-leave", () => closeWizard());
    const actions = el("div", "pw-confirm-actions");
    actions.append(leave, stay);
    box.append(title, " ", text, actions);
    layer.append(box);
    // Keep keyboard focus inside the confirmation.
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const items = [leave, stay];
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    });
    layer._back = back;
    for (const n of wizard.children) if (n !== layer) n.setAttribute("aria-hidden", "true");
    wizard.append(layer);
    stay.focus();
  }
  function hideExitConfirm() {
    const layer = wizard && wizard.querySelector(".pw-confirm");
    if (!layer) return;
    layer.remove();
    for (const n of wizard.children) n.removeAttribute("aria-hidden");
    const back = layer._back;
    if (back && back.isConnected && wizard.contains(back)) back.focus();
    else {
      const h = wizard.querySelector("h2");
      if (h) h.focus();
    }
  }
  function closeWizard() {
    if (wizard) wizard.remove();
    wizard = null;
    document.body.classList.remove("plan-wizard-open");
    renderTab();
    const start = root.querySelector("button");
    if (start) start.focus();
  }
  function go(step) {
    draft.step = step;
    editing = { cop: false, eur: false };
    renderStep();
  }
  function renderStep() {
    if (!wizard) return;
    const d = draft;
    wizard.replaceChildren();
    const top = el("div", "pw-top");
    const back = btn("", "ghost pw-back", () => (d.step > 1 ? go(d.step - 1) : closeWizard()));
    back.append(raw("span", "‹ "), el("span", "", T.back));
    const prog = el("div", "pw-progress");
    const label = el("div", "pw-step");
    label.append(el("span", "", T.step), " ", raw("span", String(d.step)), " ", el("span", "", T.of), " ", raw("span", "5"));
    const bar = el("div", "pw-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "1");
    bar.setAttribute("aria-valuemax", "5");
    bar.setAttribute("aria-valuenow", String(d.step));
    const fill = el("div", "pw-fill");
    fill.style.width = d.step * 20 + "%";
    bar.append(fill);
    prog.append(label, bar);
    top.append(back, prog, btn("×", "ghost pw-close", closeWizard));
    top.lastChild.setAttribute("aria-label", en() ? "Close" : T.close);
    const body = el("div", "pw-body");
    const foot = el("div", "pw-foot");
    wizard.append(top, body, foot);
    [step1, step2, step3, step4, step5][d.step - 1](body, foot, d);
    const h = wizard.querySelector("h2");
    if (h) {
      h.id = "plan-step-title";
      h.tabIndex = -1;
      h.focus();
    }
  }
  function curSwitch(value, onPick, labelText) {
    const g = el("div", "switch pw-switch");
    g.setAttribute("role", "group");
    if (labelText) g.setAttribute("aria-label", labelText);
    for (const c of Core.CURRENCIES) {
      const b = raw("button", c);
      b.type = "button";
      b.className = c === value ? "active" : "";
      b.setAttribute("aria-pressed", String(c === value));
      b.dataset.planCur = c;
      b.addEventListener("click", () => onPick(c));
      g.append(b);
    }
    return g;
  }
  function amountInput(id, label, value, cur) {
    const f = el("div", "field pw-field");
    const l = el("label", "", label);
    const i = el("input");
    i.type = "number";
    i.min = "0";
    i.step = cur === "COP" ? "1" : "0.01";
    i.inputMode = "decimal";
    i.id = id;
    i.value = value;
    l.htmlFor = id;
    f.append(l, i);
    return [f, i];
  }
  function nextButton(foot, text, fn) {
    const b = btn(text || T.next, "save pw-next", fn);
    foot.append(b);
    return b;
  }

  function step1(body, foot, d) {
    body.append(el("h2", "", T.s1Title));
    body.append(el("p", "label", T.s1Currency), curSwitch(d.incomeCurrency, (c) => {
      d.incomeCurrency = c;
      if (!d.planChosen) d.planCurrency = c;
      ensureRates(d, true);
      renderStep();
    }));
    const [f, input] = amountInput("plan-income", T.s1Amount, d.income, d.incomeCurrency);
    input.classList.add("pw-big");
    input.addEventListener("input", () => (d.income = input.value));
    body.append(f, el("p", "label", T.s1Note));
    const used = Core.currenciesUsed(d.incomeCurrency, appDebts());
    if (used.length > 1) {
      if (!d.planCurrency) d.planCurrency = d.incomeCurrency;
      body.append(el("h3", "pw-sub", T.s1PlanCurrency), curSwitch(d.planCurrency, (c) => {
        d.planCurrency = c;
        d.planChosen = true;
        d.extra = null;
        ensureRates(d, true);
        renderStep();
      }, T.s1PlanCurrency));
    }
    const err = el("p", "error");
    err.setAttribute("role", "alert");
    body.append(err);
    nextButton(foot, T.next, () => {
      const n = Number(input.value);
      if (!(n > 0 && Number.isFinite(n))) {
        err.textContent = T.s1Error;
        input.focus();
        return;
      }
      d.income = input.value;
      ensureRates(d, true);
      go(2);
    });
  }
  /* Step 2 (1.8): with fixed expenses (Inicio → Gastos fijos) it does not ask for them again: it
     shows their monthly total and asks only for the other monthly expenses. Without them it asks
     for the list once and offers to keep it as fixed expenses. */
  const labelIn = (text) => (en() && window.DebtI18n ? window.DebtI18n.translateText(text, "en") : text);
  function fixedKeys(d) {
    return keysFor([d.incomeCurrency, ...Object.keys(fixedTotals())]);
  }
  function step2(body, foot, d) {
    if (hasFixed()) return step2Fixed(body, foot, d);
    body.append(el("h2", "", T.s2Title));
    const note = el("p", "label");
    note.append(el("span", "", T.s2Note), " ", raw("strong", d.incomeCurrency));
    body.append(note);
    const list = el("div", "pw-expenses");
    const total = el("div", "pw-total");
    const totalAmount = raw("strong", "");
    total.append(el("span", "", T.s2Total), " ", totalAmount);
    const refresh = () => (totalAmount.textContent = fmt(d.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), d.incomeCurrency));
    d.expenses.forEach((e, idx) => {
      const row = el("div", "pw-expense");
      const icon = el("span", "pw-icon", e.icon);
      icon.setAttribute("aria-hidden", "true");
      row.append(icon);
      if (e.key === "custom") {
        const nameF = el("div", "field pw-field");
        const nl = el("label", "", T.otherName);
        const ni = el("input");
        ni.type = "text";
        ni.maxLength = 60;
        ni.id = "plan-exp-name-" + idx;
        ni.value = e.label || "";
        nl.htmlFor = ni.id;
        ni.addEventListener("input", () => (e.label = ni.value));
        nameF.append(nl, ni);
        row.append(nameF);
      }
      const [f, input] = amountInput("plan-exp-" + idx, e.key === "custom" ? T.otherExpense : T[e.key], e.amount, d.incomeCurrency);
      input.addEventListener("input", () => {
        e.amount = input.value;
        refresh();
      });
      row.append(f);
      if (e.key === "custom")
        row.append(
          btn(T.remove, "ghost", () => {
            d.expenses.splice(idx, 1);
            renderStep();
          }),
        );
      list.append(row);
    });
    body.append(list, btn(T.addExpense, "ghost pw-add", () => {
      d.expenses.push({ key: "custom", icon: "➕", label: "", amount: "" });
      renderStep();
    }), total);
    refresh();
    const err = el("p", "error");
    err.setAttribute("role", "alert");
    if (window.MPDDGastos) {
      // Offer to keep these expenses as fixed expenses (monthly, day 1, income currency).
      const offer = el("div", "pw-save-fixed");
      const lab = el("label", "check-row");
      const box = el("input");
      box.type = "checkbox";
      box.id = "plan-save-fixed";
      box.checked = !!d.saveAsFixed;
      box.addEventListener("change", () => (d.saveAsFixed = box.checked));
      lab.htmlFor = box.id;
      lab.append(box, " ", el("span", "", T.s2SaveFixed));
      offer.append(lab, el("p", "label small", T.s2SaveFixedNote));
      body.append(offer);
    }
    body.append(err);
    nextButton(foot, T.next, () => {
      if (d.saveAsFixed && window.MPDDGastos) {
        // Only items that are bills (housing, utilities and the ones the user named), not food,
        // transport or "otros", which change every month and would show up as a bill due on the 1st.
        const items = d.expenses
          .filter((e) => Number(e.amount) > 0 && FIXED_LIKE.includes(e.key))
          .map((e) => ({ name: (e.key === "custom" ? String(e.label || "").trim() || labelIn(T.otherExpense) : labelIn(T[e.key])).slice(0, 80), amount: Number(e.amount), currency: d.incomeCurrency, day: 1, frequency: "monthly", category: "" }));
        if (items.length) {
          let n = 0;
          try {
            n = window.MPDDGastos.addMany(items);
          } catch (_) {
            n = 0;
          }
          if (!n) return (err.textContent = T.s2SaveFixedError);
          d.saveAsFixed = false;
          d.fixedNotice = true;
          // What was saved is now fixed expenses; what was not (food, transport, other)
          // goes to "Otros gastos del mes", so the step total does not change.
          const rest = d.expenses.filter((e) => Number(e.amount) > 0 && !FIXED_LIKE.includes(e.key)).reduce((s, e) => s + Number(e.amount), 0);
          d.others = rest > 0 ? String(rest) : "";
        }
      }
      go(3);
    });
  }
  function step2Fixed(body, foot, d) {
    body.append(el("h2", "", T.s2FixedTitle));
    const keys = fixedKeys(d);
    if (keys.length) ensureRates(d);
    const f = fixedSummary(d);
    const line = el("div", "pw-total pw-fixed");
    line.append(el("span", "", T.s2Fixed), " ", raw("strong", f.known ? fmt(f.total, d.incomeCurrency) : "—", "pw-fixed-total"));
    if (f.approx) line.append(" ", el("span", "pill", T.approx));
    line.append(" ", btn(T.s2Edit, "ghost pw-fixed-edit", () => {
      keepDraft(d, { step: 2, reason: "gastos" });
      closeWizard();
      if (window.MPDDGastos) window.MPDDGastos.open();
    }));
    body.append(line);
    // Several currencies (or another one): the breakdown, small, each in its own currency.
    const curs = Core.CURRENCIES.filter((c) => f.totals[c] !== undefined);
    if (curs.length > 1 || (curs.length === 1 && curs[0] !== d.incomeCurrency)) {
      const small = el("p", "label small pw-fixed-breakdown");
      curs.forEach((c, i) => {
        if (i) small.append(" · ");
        small.append(raw("span", fmt(f.totals[c], c)));
      });
      body.append(small);
    }
    body.append(el("p", "label", T.s2FixedNote));
    for (const k of keys) {
      if (RATES[k].state() === "loading" && !(d[RATES[k].slot] && d[RATES[k].slot].type === "personalizada")) body.append(el("p", "label", k === "eur" ? T.eurLoading : T.trmLoading));
      body.append(k === "eur" ? eurLine(d, false) : trmLine(d, false));
    }
    const [of, input] = amountInput("plan-others", T.s2Others, d.others || "", d.incomeCurrency);
    of.append(el("p", "label small", T.s2OthersNote));
    body.append(of);
    const total = el("div", "pw-total");
    const totalAmount = raw("strong", "", "pw-step-total");
    total.append(el("span", "", T.s2StepTotal), " ", totalAmount);
    if (f.approx) total.append(" ", el("span", "pill", T.approx));
    const refresh = () => (totalAmount.textContent = f.known ? fmt(f.total + Math.max(0, Number(d.others) || 0), d.incomeCurrency) : "—");
    input.addEventListener("input", () => {
      d.others = input.value;
      refresh();
    });
    refresh();
    const err = el("p", "error");
    err.setAttribute("role", "alert");
    body.append(total, err);
    nextButton(foot, T.next, () => {
      if (!fixedSummary(d).known) return (err.textContent = missingRates(d).includes("cop") ? T.trmMissing : T.eurMissing);
      go(3);
    });
  }
  function step3(body, foot, d) {
    body.append(el("h2", "", T.s3Title));
    if (d.fixedNotice) {
      const ok = el("p", "notice pw-fixed-saved", T.s2Saved);
      ok.setAttribute("role", "status");
      body.append(ok);
      d.fixedNotice = false;
    }
    const list = appDebts().filter((x) => Number(x.balance) > 0);
    if (!list.length) {
      body.append(el("p", "notice", T.noDebts), btn(T.addDebt, "save", () => window.MPDDApp && window.MPDDApp.openAdd()));
      nextButton(foot, T.next, () => go(4));
      return;
    }
    body.append(el("p", "label", T.s3Note));
    const planCur = planCurrencyOf(d);
    const fxNeed = fxNeeded(d);
    const keys = ratesUsed(d);
    if (missingRates(d).length) ensureRates(d);
    const fx = ratesObj(d);
    const rows = el("div", "pw-debts");
    let totalMin = 0,
      totalKnown = true;
    for (const x of list) {
      const v = Object.assign({}, x, d.edits[x.id] || {});
      const row = el("div", "pw-debt");
      row.append(raw("strong", x.name, "pw-debt-name"));
      const missing = Core.missingFields([x])[x.id] || [];
      const rate = el("div", "pw-debt-line");
      if (missing.includes("rate")) {
        const [f, input] = amountInput("plan-rate-" + x.id, T.rateInput, v.rate ?? "", "USD");
        // Text with a decimal keyboard: accepts a comma or a point and up to 3 decimals (4,875).
        input.type = "text";
        input.removeAttribute("min");
        input.removeAttribute("step");
        input.autocomplete = "off";
        input.maxLength = 8;
        input.addEventListener("input", () => (d.edits[x.id] = Object.assign({}, d.edits[x.id], { rate: input.value })));
        rate.append(f);
      } else rate.append(el("span", "", T.rate), " ", raw("span", Number(x.rate) + "%"));
      const min = el("div", "pw-debt-line");
      if (missing.includes("minPayment")) {
        const [f, input] = amountInput("plan-min-" + x.id, T.minInput, v.minPayment ?? "", x.currency);
        f.querySelector("label").append(" ", raw("span", "(" + x.currency + ")"));
        input.addEventListener("input", () => (d.edits[x.id] = Object.assign({}, d.edits[x.id], { minPayment: input.value })));
        min.append(f);
      } else {
        min.append(el("span", "", T.minimum), " ", raw("strong", fmt(x.minPayment, x.currency)));
        const eq = fxNeed && x.currency !== planCur ? tryConvert(x.minPayment, x.currency, planCur, fx) : null;
        if (eq !== null) min.append(" ", raw("small", "≈ " + fmt(eq, planCur), "plan-approx-small"));
      }
      const m = Number(v.minPayment);
      const mPlan = x.currency === planCur ? m : tryConvert(m, x.currency, planCur, fx);
      if (m > 0 && mPlan !== null) totalMin += mPlan;
      if (!(m > 0) || mPlan === null) totalKnown = false;
      row.append(rate, min);
      rows.append(row);
    }
    body.append(rows);
    const tot = el("div", "pw-total");
    tot.append(el("span", "", T.s3Total), " ", raw("strong", totalKnown ? fmt(totalMin, planCur) : "—"));
    if (fxNeed) tot.append(" ", el("span", "pill", T.approx));
    body.append(tot);
    for (const k of keys) {
      if (RATES[k].state() === "loading" && !(d[RATES[k].slot] && d[RATES[k].slot].type === "personalizada")) body.append(el("p", "label", k === "eur" ? T.eurLoading : T.trmLoading));
      body.append(k === "eur" ? eurLine(d, false) : trmLine(d, false));
    }
    const link = btn(T.missingDebt, "linklike", () => window.MPDDApp && window.MPDDApp.openAdd());
    const err = el("p", "error");
    err.setAttribute("role", "alert");
    body.append(link, err);
    nextButton(foot, T.next, () => {
      const patches = [];
      for (const x of list) {
        const miss = Core.missingFields([x])[x.id] || [];
        if (!miss.length) continue;
        const e = d.edits[x.id] || {};
        const p = { id: x.id };
        if (miss.includes("rate")) {
          const r = MPDDMoney.parsePercent(e.rate);
          if (r === null || Number.isNaN(r)) return (err.textContent = T.s3Error);
          p.rate = r;
        }
        if (miss.includes("minPayment")) {
          const n = Number(e.minPayment);
          if (!(n > 0)) return (err.textContent = T.s3Error);
          p.minPayment = n;
        }
        patches.push(p);
      }
      const lacking = missingRates(d);
      if (lacking.length) return (err.textContent = lacking.includes("cop") ? T.trmMissing : T.eurMissing);
      if (patches.length && !(window.MPDDApp && window.MPDDApp.updateDebts(patches))) return (err.textContent = T.s3SaveError);
      d.edits = {};
      go(4);
    });
  }
  function step4(body, foot, d) {
    let r;
    try {
      r = compute(d, { extra: d.extra === null ? 0 : d.extra });
    } catch (e) {
      body.append(el("h2", "", T.s4Free), el("p", "error", e.missing ? T.s3Error : e.missingFx && !e.missingFx.includes("cop") ? T.eurMissing : T.trmMissing));
      nextButton(foot, T.back, () => go(3));
      return;
    }
    if (d.extra === null) d.extra = 0;
    const cur = r.planCurrency;
    const head = el("div", "pw-free" + (r.free <= 0 ? " negative" : ""));
    const h2 = el("h2", "", T.s4Free);
    const big = raw("div", fmt(r.free, cur), "pw-free-amount");
    head.append(h2, big);
    if (r.fxUsed || (hasFixed() && fixedSummary(d).approx)) head.append(el("span", "pill", T.approx));
    const breakdown = el("dl", "pw-breakdown");
    for (const [k, v, sign] of [
      ["s4Income", r.income, ""],
      ["s4Basics", r.expenses, "− "],
      ["s4Minimums", r.minimums, "− "],
    ]) {
      breakdown.append(el("dt", "", T[k]), raw("dd", sign + fmt(v, cur)));
    }
    head.append(breakdown);
    body.append(head);
    if (r.free <= 0) {
      const box = el("div", "notice pw-negative");
      box.setAttribute("role", "status");
      box.append(el("strong", "", T.s4Negative), el("p", "", T.s4NegativeText));
      const ul = el("ul");
      for (const k of ["idea1", "idea2", "idea3", "idea4"]) ul.append(el("li", "", T[k]));
      box.append(ul);
      body.append(box);
      d.extra = 0;
      nextButton(foot, T.next, () => go(5));
      return;
    }
    body.append(el("h3", "pw-sub", T.s4Question));
    const sliderWrap = el("div", "pw-slider");
    const slider = el("input");
    slider.type = "range";
    slider.id = "plan-extra";
    slider.min = "0";
    slider.max = String(r.free);
    const unit = cur === "COP" ? (r.free >= 10000 ? 1000 : 1) : r.free >= 100 ? 1 : 0.01;
    // Arrow keys move one rounding unit; "Todo" reaches the exact free amount.
    slider.step = String(unit);
    const snap = (v) => (v >= r.free - unit / 2 ? r.free : Core.round(Math.round(v / unit) * unit, cur));
    d.extra = Math.min(d.extra, r.free);
    slider.value = String(d.extra);
    const sl = el("label", "", T.s4Extra);
    sl.htmlFor = slider.id;
    const val = raw("strong", fmt(d.extra, cur), "pw-extra-value");
    const allBtn = btn(T.all, "ghost pw-all", () => {
      slider.value = String(r.free);
      update(r.free);
    });
    sliderWrap.append(sl, slider, val, allBtn);
    body.append(sliderWrap);
    const results = el("div", "pw-results");
    results.setAttribute("aria-live", "polite");
    body.append(results);
    const update = (exact) => {
      d.extra = typeof exact === "number" ? exact : snap(Number(slider.value));
      const x = compute(d, { extra: d.extra });
      val.textContent = fmt(d.extra, cur);
      slider.setAttribute("aria-valuetext", fmt(d.extra, cur));
      results.replaceChildren();
      if (!x.hasDebts) {
        results.append(el("p", "label", T.noDebtsPlan));
      } else if (x.status !== "paid") {
        results.append(el("p", "error", T.s4Never));
      } else {
        const p1 = el("p", "pw-payoff");
        p1.append(el("span", "", T.s4Payoff), " ", raw("strong", monthName(x.payoffYm)));
        const p2 = el("p", "label");
        if (x.statusWithoutExtra === "paid") p2.append(el("span", "", T.s4PayoffBase), " ", raw("span", monthName(x.payoffYmWithoutExtra)));
        else p2.append(el("span", "", T.baseNever));
        const p3 = el("p");
        if (x.interestSaved !== null) p3.append(el("span", "", T.s4Saved), " ", raw("strong", fmt(x.interestSaved, cur)));
        results.append(p1, p2, p3);
      }
      const p4 = el("p");
      p4.append(el("span", "", T.s4Left), " ", raw("strong", fmt(x.leftover, cur)));
      results.append(p4);
    };
    slider.addEventListener("input", update);
    update(d.extra);
    nextButton(foot, T.next, () => go(5));
  }
  function step5(body, foot, d) {
    let r;
    try {
      r = compute(d);
    } catch (e) {
      body.append(el("h2", "", T.s5Title), el("p", "error", T.s3Error));
      nextButton(foot, T.back, () => go(3));
      return;
    }
    body.append(planView(r, null, d, false));
    const status = el("p", "label pw-status");
    status.setAttribute("role", "status");
    body.append(status);
    foot.append(
      btn(d.method === "snowball" ? T.tryAvalanche : T.trySnowball, "ghost", () => {
        d.method = d.method === "snowball" ? "avalanche" : "snowball";
        renderStep();
      }),
    );
    const startBtn = nextButton(foot, T.startPlan, async () => {
      if (!r.hasDebts) {
        status.textContent = T.noDebtsPlan;
        return;
      }
      if (!signedIn()) {
        keepDraft(d);
        status.replaceChildren(el("span", "", T.needAccount), " ", btn(T.goAccount, "save", () => {
          closeWizard();
          if (window.MPDDAccount && window.MPDDAccount.ask("plan")) return;
          if (window.MPDDNavigate) window.MPDDNavigate("more");
          const a = document.getElementById("account-title");
          if (a && a.scrollIntoView) a.scrollIntoView({ block: "start" });
        }));
        return;
      }
      startBtn.disabled = true;
      status.textContent = T.saving;
      const ok = await savePlan(d, r, false);
      startBtn.disabled = false;
      if (!ok) status.textContent = T.saveError;
    });
  }

  /* Unsaved draft while the user signs in. It is kept in sessionStorage and also in
     localStorage with a timestamp, so a sign-in link (magic link or confirmation) opened in
     ANOTHER tab can still offer "Continuar con tu plan". It expires after 24 hours and is
     removed as soon as the plan is saved or discarded. The saved plan lives in Supabase.
     While a restore is pending (restore journal present) localStorage is not touched. */
  const DRAFT_KEY = "mpdd-plan-draft-v1";
  const DRAFT_TTL = 24 * 60 * 60 * 1000;
  const JOURNAL = "nando-restore-journal-v1";
  const restorePending = () => {
    try {
      return localStorage.getItem(JOURNAL) !== null;
    } catch (_) {
      return true;
    }
  };
  const validDraft = (v) => v && typeof v === "object" && Array.isArray(v.expenses) && Core.CURRENCIES.includes(v.incomeCurrency);
  function readEntry(store) {
    try {
      const v = JSON.parse(store.getItem(DRAFT_KEY) || "null");
      if (!v || typeof v !== "object") return null;
      if (validDraft(v)) return { savedAt: null, local: false, draft: v }; // 1.3 format (sessionStorage only)
      if (typeof v.savedAt === "number" && validDraft(v.draft)) return v;
    } catch (_) {}
    return null;
  }
  /* opts.step: where to resume (5 by default); opts.reason "gastos": kept to edit the fixed
     expenses, offered again in the Plan tab even without an account. */
  function keepDraft(d, opts) {
    const o = opts || {};
    const entry = { savedAt: Date.now(), local: false, draft: Object.assign({}, d, { step: o.step || 5, reason: o.reason || null, snapshot: false, useSavedFx: false }) };
    if (!restorePending()) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.assign({}, entry, { local: true })));
        entry.local = true;
      } catch (_) {}
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(entry));
    } catch (_) {}
  }
  function pendingDraft() {
    const now = Date.now();
    const fresh = (e) => e && (e.savedAt === null || (now - e.savedAt >= 0 && now - e.savedAt < DRAFT_TTL));
    let local = null,
      session = null;
    try {
      local = readEntry(localStorage);
    } catch (_) {}
    try {
      session = readEntry(sessionStorage);
    } catch (_) {}
    if (local && !fresh(local)) {
      if (!restorePending())
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch (_) {}
      local = null;
    }
    if (session && !fresh(session)) session = null;
    // This tab's copy was also in localStorage, and another tab already saved or discarded it.
    if (session && session.local && (!local || local.savedAt !== session.savedAt)) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch (_) {}
      session = null;
    }
    const best = local && (!session || local.savedAt >= (session.savedAt || 0)) ? local : session;
    return best ? best.draft : null;
  }
  function dropDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (_) {}
    if (!restorePending())
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (_) {}
  }
  // Another tab saved, discarded or created a draft: refresh the Plan tab.
  window.addEventListener("storage", (e) => {
    if (e.key !== DRAFT_KEY) return;
    pendingDraft(); // drops this tab's copy if another tab saved or discarded it
    if (!wizard) renderTab();
  });

  /* ---------------- saving ---------------- */
  /* Expenses saved with the plan (in the income currency). With fixed expenses: their total
     (marked fijos) and the other monthly expenses; a recomputed saved plan keeps its own. */
  function expensesRow(d) {
    if (d.snapshot) return (d.savedRaw || []).filter((e) => Number(e.amount) > 0);
    if (hasFixed()) {
      const out = [{ key: "custom", label: T.fixedName, amount: fixedSummary(d).total, fijos: true }, { key: "otros", amount: Math.max(0, Number(d.others) || 0) }];
      return out.filter((e) => e.amount > 0);
    }
    return d.expenses.filter((e) => Number(e.amount) > 0).map((e) => (e.key === "custom" ? { key: "custom", label: String(e.label || "").slice(0, 60), amount: Number(e.amount) } : { key: e.key, amount: Number(e.amount) }));
  }
  function rowFrom(d, r) {
    const keys = ratesUsed(d);
    const pick = (k) => {
      const slot = d[RATES[k].slot];
      if (!keys.includes(k) && !(d.snapshot && slot)) return null;
      return infoOf(d, k) || (slot ? { rate: slot.rate, type: slot.type, fecha: slot.fecha } : null);
    };
    const fx = pick("cop");
    const fe = pick("eur");
    return {
      income: Number(d.income) || 0,
      income_currency: d.incomeCurrency,
      plan_currency: r.planCurrency,
      expenses: expensesRow(d),
      extra: r.extra,
      method: r.method,
      fx_rate: fx ? fx.rate : null,
      fx_date: fx ? fx.fecha || today() : null,
      fx_type: fx ? fx.type : null,
      // 1.8: euro rate used (dollars per 1 euro), null when not needed.
      eur_rate: fe ? fe.rate : null,
      eur_date: fe ? fe.fecha || today() : null,
      eur_type: fe ? fe.type : null,
      plan_month: r.month + "-01",
      items: r.items.map((it) => ({ debtId: it.debtId, name: it.name, currency: it.currency, payment: it.payment, approx: it.approx, first: it.first, dueDate: it.dueDate })),
    };
  }
  async function savePlan(d, r, silent, okMessage) {
    const res = await Cloud().savePlan(rowFrom(d, r));
    if (!res.ok) {
      if (silent) {
        message = T.saveError;
        renderTab();
      }
      return false;
    }
    saved = res.plan;
    dropDraft();
    addReminders(r);
    message = okMessage || T.saved;
    try {
      if (window.MPDDSchedule && !MPDDSchedule.readAvisos(localStorage).enabled) message += " " + T.remindersOff;
    } catch (_) {}
    if (wizard) closeWizard();
    else renderTab();
    document.dispatchEvent(new Event("mpdd:planchange"));
    return true;
  }
  /* Payment reminders for the plan's debts that have a due day and no reminder yet. */
  function addReminders(r) {
    try {
      if (localStorage.getItem("nando-restore-journal-v1") !== null) return;
      const KEY = "nando-recordatorios-v1";
      const raw0 = localStorage.getItem(KEY);
      const prefs = raw0 === null ? {} : JSON.parse(raw0);
      if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return;
      const days = window.MPDDSchedule ? MPDDSchedule.readAvisos(localStorage).daysBefore : 3;
      let changed = false;
      for (const it of r.items) {
        if (!it.dueDate || Object.prototype.hasOwnProperty.call(prefs, it.debtId) || ["__proto__", "constructor", "prototype"].includes(it.debtId)) continue;
        prefs[it.debtId] = { cutoffDay: null, paymentDay: Number(it.dueDate.slice(8, 10)), paidThrough: null, beforeDays: days, cutoffEnabled: false, paymentEnabled: true, sameDay: true };
        changed = true;
      }
      if (changed) localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  /* ---------------- calendar integration ---------------- */
  window.MPDDPlan = {
    planned() {
      if (!saved || !Array.isArray(saved.items)) return {};
      const ym = String(saved.plan_month || "").slice(0, 7);
      const out = {};
      for (const it of saved.items) if (it && it.debtId && Number(it.payment) > 0) out[it.debtId + "|" + (typeof it.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.dueDate) ? it.dueDate.slice(0, 7) : ym)] = Number(it.payment);
      return out;
    },
    current: () => saved,
    open: () => openWizard(saved),
    /* 1.4: change the saved plan's method (from the Métodos tab). Recomputes the items with
       the same data and rate used in the plan, and saves like savePlan (needs a session).
       With no session or no saved plan, opens the assistant with that method preselected. */
    async setMethod(method) {
      if (method !== "avalanche" && method !== "snowball") return { ok: false, error: "method" };
      if (!signedIn() || !saved) {
        openWizard(saved, null, { method });
        return { ok: false, opened: true };
      }
      const d = savedDraft();
      d.method = method;
      let r;
      try {
        r = compute(d);
      } catch (_) {
        openWizard(saved, null, { method });
        return { ok: false, opened: true };
      }
      const ok = await savePlan(d, r, true, T.methodSaved);
      return { ok };
    },
  };

  /* ---------------- loading ---------------- */
  async function loadFor(userId) {
    loadedFor = userId;
    saved = Cloud().cachedPlan();
    loadState = "loading";
    renderTab();
    const res = await Cloud().loadPlan();
    if (loadedFor !== userId) return;
    if (res.ok) {
      saved = res.plan;
      loadState = "ready";
    } else {
      saved = res.plan || saved;
      loadState = "error";
    }
    if (saved && saved.fx_type === "oficial") await ensureTRM(true);
    if (saved && saved.eur_type === "oficial") await ensureEUR(true);
    renderTab();
    document.dispatchEvent(new Event("mpdd:planchange"));
  }
  function onCloud(s) {
    const uid = s.userId || null;
    if (uid && uid !== loadedFor && s.state !== "needsChoice") loadFor(uid);
    if (!uid && loadedFor) {
      loadedFor = null;
      saved = null;
      loadState = "idle";
      renderTab();
      document.dispatchEvent(new Event("mpdd:planchange"));
    }
  }
  if (Cloud()) Cloud().onChange(onCloud);
  document.addEventListener("deudas:languagechange", () => (wizard ? renderStep() : renderTab()));
  // 1.8: fixed expenses changed (Inicio, sync or this wizard): step 2 and the totals follow.
  let lastFixedSig = null;
  document.addEventListener("mpdd:gastoschange", (ev) => {
    if (!wizard || !draft) return;
    // A sync or a category change that does not change the totals does not redraw the step:
    // on a phone it would close the keyboard mid-typing.
    const sig = window.MPDDGastos ? JSON.stringify(window.MPDDGastos.monthlyTotals()) + window.MPDDGastos.list().length : "";
    const source = ev && ev.detail && ev.detail.source;
    if ((source === "sync" || source === "categories") && sig === lastFixedSig) return;
    lastFixedSig = sig;
    renderStep();
  });
  document.addEventListener("mpdd:rendered", () => {
    if (wizard && draft && draft.step === 3) renderStep();
    else if (!wizard) renderTab();
  });
  renderTab();
})();
