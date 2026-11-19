/* Pestaña "Métodos" (versión 1.4): comparador automático de bola de nieve y avalancha.
   - Usa las deudas registradas (MPDDApp.debts) y el pago mensual del plan guardado
     (mínimos + extra, MPDDPlan.current). Sin plan, usa la suma de los mínimos.
   - El cálculo es el mismo motor del plan (MPDDPlanCore.simulate).
   - Si hay deudas en varias monedas se convierte con la tasa del plan o con la del día
     (TRM: MPDDCloud.fetchTRM; euro, 1.8: MPDDCloud.fetchEUR) y los valores convertidos se
     marcan como aproximados.
   - Los datos del usuario solo se insertan con textContent. No escribe nada en el dispositivo. */
(function () {
  "use strict";
  const root = document.getElementById("metodos-root");
  const Core = window.MPDDPlanCore;
  if (!root || !Core || !window.MPDDMoney) return;
  const T = {
    showIn: "Ver en:",
    options: "Opciones",
    startDate: "Fecha de inicio",
    planPayment: "Tu pago mensual del plan:",
    minPayment: "Pago mensual (suma de tus mínimos):",
    noPlan: "Arma tu plan para usar tu pago real",
    buildPlan: "Armar mi plan",
    noDebts: "Aún no tienes deudas para comparar.",
    addDebt: "Agregar una deuda",
    skipped: "Estas deudas no tienen tasa o pago mínimo y no se incluyen:",
    complete: "Completar datos",
    approx: "aproximado",
    trmPlan: "TRM usada en tu plan:",
    trmToday: "TRM de hoy:",
    trmLast: "Última TRM disponible:",
    trmCustom: "Tasa personalizada:",
    trmLoading: "Consultando la TRM…",
    trmMissing: "No pudimos obtener la TRM. Solo comparamos tus deudas en",
    trmNote: "Los valores convertidos son aproximados. Tu banco puede cobrar una tasa distinta.",
    snowball: "Bola de nieve",
    avalanche: "Avalancha",
    snowballHow: "Primero la deuda más pequeña",
    avalancheHow: "Primero la de mayor interés",
    recommended: "Recomendado",
    finishOn: "Terminas en",
    totalInterest: "Intereses totales",
    clear: "Te quitas",
    inWord: "en",
    month: "mes",
    months: "meses",
    cardNever: "Con este pago no terminas de pagar tus deudas.",
    noneCleared: "Con este pago ninguna deuda se termina de pagar.",
    avaSaves: "Con avalancha ahorras",
    avaFinishes: "Con avalancha terminas",
    snowSaves: "Con bola de nieve ahorras",
    snowFinishes: "Con bola de nieve terminas",
    andFinish: "y terminas",
    monthsSooner: "meses antes",
    monthSooner: "mes antes",
    snowFirst: "Con bola de nieve te quitas tu primera deuda",
    avaFirst: "Con avalancha te quitas tu primera deuda",
    equalSame: "En tu caso los dos métodos dan igual, porque tu deuda más pequeña también es la de mayor interés.",
    equalPlain: "En tu caso los dos métodos dan el mismo resultado.",
    similar: "Los dos métodos dan resultados muy parecidos en tu caso.",
    neverBoth: "Con este pago mensual tus deudas no se terminan de pagar. Prueba pagar un poco más con la barra de abajo.",
    onlyAva: "Con este pago, solo avalancha termina de pagar tus deudas.",
    onlySnow: "Con este pago, solo bola de nieve termina de pagar tus deudas.",
    moreTitle: "¿Y si pagas un poco más?",
    moreLabel: "Pago extra al mes",
    moreHint: "Mueve la barra para ver qué pasa si pagas más cada mes.",
    paying: "Pagando",
    perMonthFinish: "al mes terminas",
    monthsSoonerSave: "meses antes y ahorras",
    monthSoonerSave: "mes antes y ahorras",
    moreInterest: "más en intereses",
    perMonthSave: "al mes ahorras",
    perMonthFreeBy: "al mes terminas de pagar en",
    perMonthStillNever: "al mes todavía no terminas de pagar.",
    perMonthSame: "al mes el resultado casi no cambia.",
    timeline: "Orden en que se pagan",
    paidInMonth: "se paga en el mes",
    neverPaid: "no se termina de pagar",
    motiveTitle: "¿Qué te motiva más?",
    motiveFast: "Ver desaparecer mis deudas rápido",
    motiveCheap: "Pagar lo menos posible en total",
    recSnow: "Te recomendamos bola de nieve: te quitas deudas antes y eso te ayuda a seguir.",
    recAva: "Te recomendamos avalancha: pagas menos intereses en total.",
    useSnow: "Usar bola de nieve en mi plan",
    useAva: "Usar avalancha en mi plan",
    hasSnow: "Tu plan ya usa bola de nieve.",
    hasAva: "Tu plan ya usa avalancha.",
    saving: "Guardando tu plan…",
    saved: "Listo: tu plan ahora usa este método.",
    saveError: "No se pudo guardar tu plan. Revisa tu conexión e inténtalo de nuevo.",
    // 1.8: euro (European Central Bank, dollars per 1 euro).
    eurPlan: "Tasa del euro usada en tu plan:",
    eurToday: "Tasa del euro:",
    eurLast: "Última tasa disponible:",
    eurCustom: "Tasa del euro personalizada:",
    eurSource: "Banco Central Europeo",
    eurLoading: "Consultando la tasa del euro…",
    eurMissing: "No pudimos obtener la tasa del euro. Solo comparamos tus deudas en",
    bothMissing: "No pudimos obtener las tasas de cambio. Solo comparamos tus deudas en",
  };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { metodos: T });

  const en = () => document.documentElement.lang === "en";
  const fmt = (n, c) => MPDDMoney.formatMoney(n, c);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
    const [y, m, dd] = d.split("-").map(Number);
    return new Intl.DateTimeFormat(en() ? "en-US" : "es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd)));
  }
  const monthsWord = (n) => (n === 1 ? T.month : T.months);
  function appDebts() {
    try {
      return window.MPDDApp && window.MPDDApp.debts ? window.MPDDApp.debts() : [];
    } catch (_) {
      return [];
    }
  }
  const savedPlan = () => {
    try {
      return window.MPDDPlan && window.MPDDPlan.current ? window.MPDDPlan.current() : null;
    } catch (_) {
      return null;
    }
  };
  const Cloud = () => window.MPDDCloud || null;

  /* ---------------- state (memory only) ---------------- */
  const state = { cur: null, start: today(), extra: 0, motive: null, status: null };
  let trm = null,
    trmState = "idle",
    eur = null,
    eurState = "idle";
  function loadEUR() {
    const C = Cloud();
    if (eurState !== "idle") return;
    if (!C || !C.fetchEUR || C.status().config !== "ok") {
      eurState = "failed";
      return;
    }
    eurState = "loading";
    C.fetchEUR()
      .then((r) => {
        eur = r && r.ok ? r : null;
        eurState = eur ? "ready" : "failed";
      })
      .catch(() => (eurState = "failed"))
      .then(() => refresh());
  }
  function loadTRM() {
    const C = Cloud();
    if (trmState !== "idle") return;
    if (!C || !C.fetchTRM || C.status().config !== "ok") {
      trmState = "failed";
      return;
    }
    trmState = "loading";
    C.fetchTRM()
      .then((r) => {
        trm = r && r.ok ? r : null;
        trmState = trm ? "ready" : "failed";
      })
      .catch(() => (trmState = "failed"))
      .then(() => refresh());
  }
  function defaultCurrency(plan, debts) {
    if (plan && Core.CURRENCIES.includes(plan.plan_currency)) return plan.plan_currency;
    const used = Core.CURRENCIES.filter((c) => debts.some((d) => d.currency === c));
    if (used.length === 1) return used[0];
    try {
      const pref = localStorage.getItem("deudas-currency-pref-v1");
      if (Core.CURRENCIES.includes(pref)) return pref;
    } catch (_) {}
    return "COP";
  }

  /* Everything the comparison needs, already in the selected currency. */
  function model() {
    const all = appDebts().filter((d) => Number(d.balance) > 0 && Core.CURRENCIES.includes(d.currency));
    const plan = savedPlan();
    const cur = state.cur || defaultCurrency(plan, all);
    const m = { cur, plan, empty: !all.length, skipped: [], debts: [], fx: null, fxInfo: null, fxInfos: [], fxMissing: false, fxMissingKeys: [], fxLoadingKeys: [], approx: false };
    if (m.empty) return m;
    const missing = Core.missingFields(all);
    m.skipped = all.filter((d) => missing[String(d.id)]);
    let usable = all.filter((d) => !missing[String(d.id)]);
    const planExtra = plan ? Math.max(0, Number(plan.extra) || 0) : 0;
    // 1.8: the rates needed (TRM for COP, the ECB rate for EUR): the plan's, else today's.
    const involved = new Set([cur, ...usable.map((d) => d.currency)]);
    if (plan && planExtra > 0 && Core.CURRENCIES.includes(plan.plan_currency)) involved.add(plan.plan_currency);
    const keys = involved.size > 1 ? ["cop", "eur"].filter((k) => involved.has(k === "cop" ? "COP" : "EUR")) : [];
    const fx = { cop: null, eur: null };
    for (const k of keys) {
      const isEur = k === "eur";
      const planRate = plan ? Number(isEur ? plan.eur_rate : plan.fx_rate) : NaN;
      const live = isEur ? (eur && eur.ok ? { rate: eur.usdPorEur, fecha: eur.fecha, last: eur.desactualizada } : null) : trm && trm.ok ? { rate: trm.valor, fecha: trm.fecha, last: trm.desactualizada } : null;
      if (plan && (isEur ? Core.validEurRate(planRate) : Core.validRate(planRate))) {
        fx[k] = planRate;
        m.fxInfos.push({ key: k, kind: (isEur ? plan.eur_type : plan.fx_type) === "personalizada" ? "custom" : "plan", rate: planRate, fecha: isEur ? plan.eur_date : plan.fx_date });
      } else if (live) {
        fx[k] = live.rate;
        m.fxInfos.push({ key: k, kind: live.last ? "last" : "today", rate: live.rate, fecha: live.fecha });
      } else {
        if (isEur) loadEUR();
        else loadTRM();
        const st = isEur ? eurState : trmState;
        if (st === "loading" || st === "idle") {
          m.fxLoading = true;
          m.fxLoadingKeys.push(k);
        } else m.fxMissingKeys.push(k);
      }
    }
    if (keys.length) m.fx = fx;
    m.fxInfo = m.fxInfos[0] || null;
    m.fxMissing = !m.fxLoading && m.fxMissingKeys.length > 0;
    const canConv = (c) => {
      if (c === cur) return true;
      try {
        Core.convert(1, c, cur, fx);
        return true;
      } catch (_) {
        return false;
      }
    };
    usable = usable.filter((d) => canConv(d.currency));
    m.shown = Core.CURRENCIES.filter((c) => c === cur || usable.some((d) => d.currency === c));
    const conv = (n, c) => (c === cur ? n : Core.convert(n, c, cur, m.fx));
    m.approx = !!m.fx && usable.some((d) => d.currency !== cur);
    m.debts = usable.map((d) => ({
      id: String(d.id),
      name: String(d.name || ""),
      balance: conv(Number(d.balance), d.currency),
      rate: Number(d.rate),
      rateType: d.rateType,
      // A minimum larger than what is owed only needs the balance plus this month's interest.
      min: conv(Math.min(Number(d.minPayment), Number(d.balance) * (1 + Core.monthlyRate(d.rate, d.rateType))), d.currency),
    }));
    m.minimums = Core.round(m.debts.reduce((s, d) => s + d.min, 0), cur);
    m.planExtra = 0;
    if (plan) {
      if (plan.plan_currency === cur) m.planExtra = planExtra;
      else if (m.fx && canConv(plan.plan_currency)) {
        m.planExtra = Core.convert(planExtra, plan.plan_currency, cur, m.fx);
        if (planExtra > 0) m.approx = true;
      }
    }
    m.payment = Core.round(m.minimums + m.planExtra, cur);
    const step = niceStep(Math.max(m.payment, cur === "COP" ? 1000 : 1) / 20, cur);
    m.sliderStep = step;
    m.sliderMax = step * 40;
    return m;
  }
  function niceStep(x, cur) {
    const minUnit = cur === "COP" ? 1000 : 1;
    if (!(x > minUnit)) return minUnit;
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function run(m, extraSlider) {
    const ym = /^\d{4}-\d{2}-\d{2}$/.test(state.start) ? state.start.slice(0, 7) : today().slice(0, 7);
    const extra = Math.max(0, m.payment - m.minimums) + Math.max(0, extraSlider);
    return {
      avalanche: Core.simulate(m.debts, extra, "avalanche", ym),
      snowball: Core.simulate(m.debts, extra, "snowball", ym),
    };
  }
  /* Debt each method attacks first (same order rules as plan-core). */
  function firstTarget(m, method) {
    const list = m.debts.map((d, i) => ({ d, i, mr: Core.monthlyRate(d.rate, d.rateType) }));
    list.sort((x, y) => (method === "avalanche" ? y.mr - x.mr || x.d.balance - y.d.balance || x.i - y.i : x.d.balance - y.d.balance || y.mr - x.mr || x.i - y.i));
    return list.length ? list[0].d.id : null;
  }
  const firstPaid = (sim) => (sim.order && sim.order.length ? { id: sim.order[0], n: sim.payoffMonths[sim.order[0]] } : null);
  function chosenMethod(m) {
    if (state.motive === "fast") return "snowball";
    if (state.motive === "cheap") return "avalanche";
    return m.plan && m.plan.method === "snowball" ? "snowball" : "avalanche";
  }
  const label = (method) => (method === "snowball" ? T.snowball : T.avalanche);
  const nameOf = (m, id) => {
    const d = m.debts.find((x) => x.id === id);
    return d ? d.name : "";
  };
  const approxPill = () => el("span", "pill met-approx", T.approx);

  /* ---------------- rendering ---------------- */
  let current = null; // { m, parts }
  function render() {
    root.replaceChildren();
    const m = model();
    current = { m };
    // Currency selector (the only control at the top).
    const top = el("div", "met-top");
    const sw = el("div", "switch met-switch");
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", en() ? "Currency" : "Moneda");
    for (const c of Core.CURRENCIES) {
      const b = raw("button", c);
      b.type = "button";
      b.className = c === m.cur ? "active" : "";
      b.setAttribute("aria-pressed", String(c === m.cur));
      b.dataset.metCur = c;
      b.addEventListener("click", () => {
        if (state.cur === c && m.cur === c) return;
        state.cur = c;
        state.extra = 0;
        state.status = null;
        render();
        const again = root.querySelector('[data-met-cur="' + c + '"]');
        if (again) again.focus();
      });
      sw.append(b);
    }
    top.append(el("span", "label met-top-label", T.showIn), sw);
    root.append(top);
    // Options: start date.
    const opts = el("details", "met-options");
    opts.append(el("summary", "", T.options));
    const f = el("div", "field");
    const l = el("label", "", T.startDate);
    const date = el("input");
    date.type = "date";
    date.id = "met-date";
    date.value = state.start;
    l.htmlFor = date.id;
    date.addEventListener("change", () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return;
      state.start = date.value;
      updateResults();
    });
    f.append(l, date);
    opts.append(f);
    if (state.optionsOpen) opts.open = true;
    opts.addEventListener("toggle", () => (state.optionsOpen = opts.open));
    root.append(opts);

    if (m.empty) {
      const box = el("div", "plan-empty met-empty");
      box.append(el("p", "", T.noDebts), btn(T.addDebt, "save", () => window.MPDDApp && window.MPDDApp.openAdd()));
      root.append(box);
      return;
    }
    // Where the monthly payment comes from.
    const src = el("div", "met-source");
    const pay = el("p", "met-payment");
    pay.append(el("span", "", m.plan ? T.planPayment : T.minPayment), " ", raw("strong", fmt(m.payment, m.cur)));
    if (m.approx) pay.append(" ", approxPill());
    src.append(pay);
    if (!m.plan) {
      const n = el("div", "notice met-noplan");
      n.append(el("p", "", T.noPlan), btn(T.buildPlan, "save", () => window.MPDDPlan && window.MPDDPlan.open()));
      src.append(n);
    }
    if (m.skipped.length) {
      const n = el("div", "notice met-skipped");
      const p = el("p");
      p.append(el("span", "", T.skipped), " ", raw("span", m.skipped.map((d) => String(d.name || "")).join(", ")));
      n.append(p, btn(T.complete, "ghost", () => window.MPDDPlan && window.MPDDPlan.open()));
      src.append(n);
    }
    for (const info of m.fxInfos) {
      const isEur = info.key === "eur";
      const line = el("p", "label met-trm" + (isEur ? " met-eur" : ""));
      const key = isEur ? { plan: T.eurPlan, today: T.eurToday, last: T.eurLast, custom: T.eurCustom }[info.kind] : { plan: T.trmPlan, today: T.trmToday, last: T.trmLast, custom: T.trmCustom }[info.kind];
      line.append(el("strong", "", key), " ", raw("span", isEur ? "1 EUR = " + MPDDMoney.formatEurRate(info.rate) : "1 USD = " + MPDDMoney.formatRate(info.rate)));
      if (isEur && info.kind !== "custom") line.append(" · ", el("span", "", T.eurSource));
      if (info.fecha && info.kind !== "custom") line.append(" · ", raw("span", longDate(String(info.fecha).slice(0, 10))));
      src.append(line);
    }
    if (m.fxInfos.length) src.append(el("p", "label small", T.trmNote));
    if (m.fxLoading) src.append(el("p", "label", m.fxLoadingKeys.includes("cop") ? T.trmLoading : T.eurLoading));
    else if (m.fxMissing) {
      const p = el("p", "notice met-trm-missing");
      const text = m.fxMissingKeys.length > 1 ? T.bothMissing : m.fxMissingKeys[0] === "eur" ? T.eurMissing : T.trmMissing;
      p.append(el("span", "", text), " ", raw("span", m.shown.join(" / ") + "."));
      src.append(p);
    }
    root.append(src);
    if (!m.debts.length) return;

    // Results area (cards + summary), updated in place by the slider.
    const cards = el("div", "met-cards");
    const summary = el("div", "met-summary");
    summary.setAttribute("aria-live", "polite");
    root.append(cards, summary);
    // Slider.
    const more = el("div", "met-more");
    more.append(el("h3", "", T.moreTitle));
    const sl = el("input");
    sl.type = "range";
    sl.id = "met-extra";
    sl.min = "0";
    sl.max = String(m.sliderMax);
    sl.step = String(m.sliderStep);
    state.extra = Math.min(state.extra, m.sliderMax);
    sl.value = String(state.extra);
    const sll = el("label", "", T.moreLabel);
    sll.htmlFor = sl.id;
    const val = raw("strong", "", "met-extra-value");
    const moreText = el("p", "met-more-text");
    moreText.setAttribute("aria-live", "polite");
    more.append(sll, sl, val, moreText);
    sl.addEventListener("input", () => {
      state.extra = Math.max(0, Math.min(m.sliderMax, Number(sl.value) || 0));
      state.status = null;
      updateResults();
    });
    root.append(more);
    const timeline = el("div", "met-timeline");
    root.append(timeline);
    // Motivation question.
    const fs = el("fieldset", "met-motive");
    fs.append(el("legend", "", T.motiveTitle));
    for (const [key, text] of [
      ["fast", T.motiveFast],
      ["cheap", T.motiveCheap],
    ]) {
      const lab = el("label", "met-motive-option");
      const r = el("input");
      r.type = "radio";
      r.name = "met-motive";
      r.value = key;
      r.checked = state.motive === key;
      r.addEventListener("change", () => {
        state.motive = key;
        state.status = null;
        updateResults();
      });
      lab.append(r, " ", el("span", "", text));
      fs.append(lab);
    }
    const rec = el("p", "met-rec");
    rec.setAttribute("aria-live", "polite");
    fs.append(rec);
    root.append(fs);
    const final = el("div", "met-final actions");
    const status = el("p", "label met-status");
    status.setAttribute("role", "status");
    root.append(final, status);
    current.parts = { cards, summary, sl, val, moreText, timeline, rec, final, status };
    updateResults();
  }

  function updateResults() {
    if (!current || !current.parts) return;
    const { m, parts } = current;
    const res = run(m, state.extra);
    const base = state.extra > 0 ? run(m, 0) : res;
    const chosen = chosenMethod(m);
    const unit = m.cur === "COP" ? 1 : 0.01;
    // Cards.
    parts.cards.replaceChildren(card(m, "snowball", res.snowball, state.motive === "fast"), card(m, "avalanche", res.avalanche, state.motive === "cheap"));
    // Summary.
    parts.summary.replaceChildren(...summaryLines(m, res, unit));
    // Slider.
    parts.val.textContent = "+ " + fmt(state.extra, m.cur);
    parts.sl.setAttribute("aria-valuetext", fmt(state.extra, m.cur));
    parts.moreText.replaceChildren(...moreLine(m, base[chosen], res[chosen], chosen, unit));
    // Timeline.
    parts.timeline.replaceChildren(el("h3", "", T.timeline), timelineFor(m, "snowball", res.snowball), timelineFor(m, "avalanche", res.avalanche));
    // Recommendation and final buttons.
    parts.rec.replaceChildren();
    if (state.motive) parts.rec.append(el("span", "", state.motive === "fast" ? T.recSnow : T.recAva));
    parts.final.replaceChildren();
    const methods = chosen === "snowball" ? ["snowball", "avalanche"] : ["avalanche", "snowball"];
    for (const method of methods) {
      const recommended = state.motive ? method === chosen : false;
      if (m.plan && m.plan.method === method) {
        parts.final.append(el("p", "label met-has", method === "snowball" ? T.hasSnow : T.hasAva));
        continue;
      }
      const b = btn(method === "snowball" ? T.useSnow : T.useAva, (recommended || !state.motive ? "save" : "ghost") + " met-use", () => useMethod(method, b));
      b.dataset.method = method;
      parts.final.append(b);
    }
    parts.status.textContent = state.status || "";
  }

  function card(m, method, sim, recommended) {
    const c = el("article", "met-card" + (recommended ? " recommended" : ""));
    c.dataset.method = method;
    const h = el("h3", "", label(method));
    c.append(h, el("p", "label", method === "snowball" ? T.snowballHow : T.avalancheHow));
    if (recommended) c.append(el("span", "plan-chip", T.recommended));
    if (sim.status === "paid") {
      const p1 = el("p", "met-line met-date");
      p1.append(el("span", "", T.finishOn), " ", raw("strong", monthName(sim.payoffYm)));
      const p2 = el("p", "met-line met-interest");
      p2.append(el("span", "", T.totalInterest), " ", raw("strong", fmt(sim.totalInterest, m.cur)));
      if (m.approx) p2.append(" ", approxPill());
      c.append(p1, p2);
    } else c.append(el("p", "error met-never", T.cardNever));
    const fp = firstPaid(sim);
    const p3 = el("p", "met-line met-first");
    if (fp) p3.append(el("span", "", T.clear), " ", raw("strong", nameOf(m, fp.id)), " ", el("span", "", T.inWord), " ", raw("strong", String(fp.n)), " ", el("span", "", monthsWord(fp.n)));
    else p3.append(el("span", "", T.noneCleared));
    c.append(p3);
    return c;
  }

  function sentence(cls, parts) {
    const p = el("p", cls);
    parts.forEach((x, i) => {
      if (i) p.append(" ");
      p.append(x);
    });
    p.append(raw("span", "."));
    return p;
  }
  function summaryLines(m, res, unit) {
    const a = res.avalanche,
      s = res.snowball;
    if (a.status !== "paid" && s.status !== "paid") return [el("p", "error met-sum-never", T.neverBoth)];
    if (a.status !== "paid") return [el("p", "met-sum-only", T.onlySnow)];
    if (s.status !== "paid") return [el("p", "met-sum-only", T.onlyAva)];
    const dI = Core.round(s.totalInterest - a.totalInterest, m.cur);
    const dM = s.months - a.months;
    const fa = firstPaid(a),
      fs = firstPaid(s);
    const dF = fa && fs ? fa.n - fs.n : 0;
    const same = Math.abs(dI) < unit && dM === 0 && dF === 0;
    if (same) return [el("p", "met-sum-equal", firstTarget(m, "avalanche") === firstTarget(m, "snowball") ? T.equalSame : T.equalPlain)];
    const out = [];
    const costLine = (saves, finishes, interest, months) => {
      const parts = [];
      if (interest >= unit) parts.push(el("span", "", saves), raw("strong", fmt(interest, m.cur)));
      if (months > 0) parts.push(el("span", "", parts.length ? T.andFinish : finishes), raw("strong", String(months)), el("span", "", months === 1 ? T.monthSooner : T.monthsSooner));
      return parts.length ? sentence("met-sum-cost", parts) : null;
    };
    const ava = costLine(T.avaSaves, T.avaFinishes, dI, dM);
    const snow = costLine(T.snowSaves, T.snowFinishes, -dI, -dM);
    if (ava) out.push(ava);
    if (snow) out.push(snow);
    if (dF > 0) out.push(sentence("met-sum-first", [el("span", "", T.snowFirst), raw("strong", String(dF)), el("span", "", dF === 1 ? T.monthSooner : T.monthsSooner)]));
    if (dF < 0) out.push(sentence("met-sum-first", [el("span", "", T.avaFirst), raw("strong", String(-dF)), el("span", "", dF === -1 ? T.monthSooner : T.monthsSooner)]));
    if (!out.length) out.push(el("p", "met-sum-similar", T.similar));
    if (m.approx) out.push(el("p", "label small", T.trmNote));
    return out;
  }
  function moreLine(m, base, now, method, unit) {
    if (!(state.extra > 0)) return [el("span", "", T.moreHint)];
    const total = raw("strong", fmt(m.payment + state.extra, m.cur));
    const head = [el("strong", "", label(method)), raw("span", ":"), " ", el("span", "", T.paying), " ", total, " "];
    if (now.status !== "paid") return [...head, el("span", "", T.perMonthStillNever)];
    if (base.status !== "paid") return [...head, el("span", "", T.perMonthFreeBy), " ", raw("strong", monthName(now.payoffYm)), raw("span", ".")];
    const dm = base.months - now.months;
    const di = Core.round(base.totalInterest - now.totalInterest, m.cur);
    if (dm > 0) return [...head, el("span", "", T.perMonthFinish), " ", raw("strong", String(dm)), " ", el("span", "", dm === 1 ? T.monthSoonerSave : T.monthsSoonerSave), " ", raw("strong", fmt(Math.max(0, di), m.cur)), " ", el("span", "", T.moreInterest), raw("span", ".")];
    if (di >= unit) return [...head, el("span", "", T.perMonthSave), " ", raw("strong", fmt(di, m.cur)), " ", el("span", "", T.moreInterest), raw("span", ".")];
    return [...head, el("span", "", T.perMonthSame)];
  }
  function timelineFor(m, method, sim) {
    const box = el("div", "met-tl");
    box.dataset.method = method;
    box.append(el("h4", "", label(method)));
    const lastPaid = sim.order.length ? sim.payoffMonths[sim.order[sim.order.length - 1]] : 0;
    const unpaid = m.debts.filter((d) => !sim.payoffMonths[d.id]);
    const total = sim.status === "paid" ? Math.max(1, sim.months) : Math.max(12, Math.ceil(lastPaid * 1.25));
    // Visual bar (decorative: the list below carries the same information as text).
    const bar = el("div", "met-bar");
    bar.setAttribute("aria-hidden", "true");
    let prev = 0;
    sim.order.forEach((id, i) => {
      const n = sim.payoffMonths[id];
      const seg = el("div", "met-seg met-seg-" + (i % 5));
      seg.style.width = (Math.max(0, n - prev) / total) * 100 + "%";
      seg.append(raw("span", String(i + 1)));
      seg.title = nameOf(m, id);
      bar.append(seg);
      prev = n;
    });
    if (unpaid.length) {
      const seg = el("div", "met-seg met-seg-never");
      seg.style.width = Math.max(0, ((total - prev) / total) * 100) + "%";
      seg.append(raw("span", "…"));
      bar.append(seg);
    }
    const ol = el("ol", "met-tl-list");
    for (const id of sim.order) {
      const n = sim.payoffMonths[id];
      const li = el("li");
      li.append(raw("strong", nameOf(m, id)), " ", el("span", "", T.paidInMonth), " ", raw("span", String(n)), " ", raw("span", "(" + monthName(sim.payoffs[id]) + ")"));
      ol.append(li);
    }
    for (const d of unpaid) {
      const li = el("li");
      li.append(raw("strong", d.name), " ", el("span", "", T.neverPaid));
      ol.append(li);
    }
    box.append(bar, ol);
    return box;
  }

  async function useMethod(method, button) {
    if (!window.MPDDPlan || !window.MPDDPlan.setMethod) return;
    const signed = !!(Cloud() && Cloud().status().userId);
    if (signed && savedPlan()) {
      button.disabled = true;
      state.status = T.saving;
      if (current && current.parts) current.parts.status.textContent = T.saving;
    }
    const r = await window.MPDDPlan.setMethod(method);
    state.status = r && r.ok ? T.saved : r && r.opened ? null : T.saveError;
    if (button.isConnected) button.disabled = false;
    refresh(true);
  }

  /* Render only while the tab is visible; otherwise render when it is opened. */
  const view = document.getElementById("view-methods");
  const visible = () => !view || !view.hidden;
  let dirty = true;
  function refresh(force) {
    if (visible() || force === true) {
      dirty = false;
      render();
    } else dirty = true;
  }
  if (view && typeof MutationObserver === "function")
    new MutationObserver(() => {
      if (visible() && dirty) refresh();
    }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  if (view && !view.hidden) refresh();
  // Opening the tab always reloads the latest debts and plan.
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest && e.target.closest('[data-target="methods"]');
    if (t && visible()) refresh();
  });
  for (const ev of ["mpdd:rendered", "mpdd:planchange", "deudas:languagechange"]) document.addEventListener(ev, () => refresh());
  window.MPDDMetodos = { refresh: () => refresh(true) };
})();
