(function () {
  "use strict";
  const get = (id) => document.getElementById(id),
    en = () => document.documentElement.lang === "en";
  // 1.3: the monthly-capacity budget moved to the new Plan assistant (plan-ui.js);
  // this file keeps only the strategy comparator of the "Métodos" tab.
  let scenario = [],
    lastSimulation = null;
  const money = (n, c) =>
    formatMoney(n, c || (scenario.length ? scenario[0].currency : currency));
  function outputStrategy(r, label) {
    if (r.status === "insufficient_minimums")
      return en()
        ? `${label}: the monthly payment is below the required minimums.`
        : `${label}: el pago mensual no alcanza para los mínimos.`;
    if (r.status !== "paid")
      return en()
        ? `${label}: not paid off within the projection horizon.`
        : `${label}: no se cancela dentro del horizonte de cálculo.`;
    const names = r.debts
      .slice()
      .filter((d) => d.payoffDate)
      .sort((a, b) => a.payoffDate.localeCompare(b.payoffDate))
      .map((d) => d.name)
      .join(", ");
    return en()
      ? `${label}: ${r.months} months, estimated interest ${money(r.totalInterest)}, date ${r.payoffDate}. Payoff order: ${names}.`
      : `${label}: ${r.months} meses, interés estimado ${money(r.totalInterest)}, fecha ${r.payoffDate}. Orden de cancelación: ${names}.`;
  }
  function renderSimulation() {
    if (!lastSimulation) return;
    get("sim-output").dataset.localizedOutput = "true";
    get("sim-output").textContent =
      outputStrategy(
        lastSimulation.snowball,
        en() ? "Snowball" : "Bola de nieve",
      ) +
      " " +
      outputStrategy(
        lastSimulation.avalanche,
        en() ? "Avalanche" : "Avalancha",
      );
    renderVisual();
  }
  function renderVisual() {
    const output = get("sim-output");
    if (typeof output.after !== "function") return;
    let box = get("sim-visual");
    if (!box) {
      box = document.createElement("div");
      box.id = "sim-visual";
      output.after(box);
    }
    let snow = lastSimulation.snowball,
      ava = lastSimulation.avalanche;
    if (snow.status !== "paid" || ava.status !== "paid") {
      box.replaceChildren();
      return;
    }
    const lang = en(),
      labels = lang
        ? [
            "Projected interest",
            "Snowball",
            "Avalanche",
            "View monthly amortization",
            "Month",
            "Payment",
            "Minimums",
            "Extra",
            "Interest",
            "Remaining",
          ]
        : [
            "Intereses proyectados",
            "Bola de nieve",
            "Avalancha",
            "Ver amortización mensual",
            "Mes",
            "Pago",
            "Mínimos",
            "Extra",
            "Interés",
            "Saldo pendiente",
          ];
    const max = Math.max(snow.totalInterest, ava.totalInterest);
    const bar = (name, r) =>
      `<div style="margin:.55rem 0"><div style="display:flex;justify-content:space-between;gap:1rem"><strong>${name}</strong><span>${money(r.totalInterest)}</span></div><div style="height:.7rem;background:#e4ece6;border-radius:1rem;overflow:hidden" role="img" aria-label="${name}: ${money(r.totalInterest)}"><div style="height:100%;width:${max ? Math.round((100 * r.totalInterest) / max) : 0}%;background:#1b684d"></div></div></div>`;
    const table = (name, r) =>
      `<h4>${name}</h4><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:.9rem"><thead><tr>${labels
        .slice(4)
        .map((x) => `<th style="padding:.4rem">${x}</th>`)
        .join(
          "",
        )}</tr></thead><tbody>${r.periods.map((p) => `<tr><td>${p.date}</td><td>${money(p.payment)}</td><td>${money(p.minimums)}</td><td>${money(p.extra)}</td><td>${money(p.interest)}</td><td>${money(p.balance)}</td></tr>`).join("")}</tbody></table></div>`;
    box.innerHTML = `<h3>${labels[0]}</h3>${bar(labels[1], snow)}${bar(labels[2], ava)}<details><summary>${labels[3]}</summary>${table(labels[1], snow)}${table(labels[2], ava)}</details>`;
  }
  const today = new Date();
  get("sim-date").value = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  get("sim-load").onclick = () => {
    scenario = debts
      .filter((d) => d.currency === currency && d.balance > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        currency: d.currency,
        balance: d.balance,
      }));
    lastSimulation = null;
    get("sim-output").textContent = "";
    let box = get("simulation-rows");
    box.replaceChildren();
    get("sim-visual")?.replaceChildren();
    if (!scenario.length) {
      box.textContent = "No hay deudas con saldo en esta moneda.";
      return;
    }
    scenario.forEach((d, i) => {
      let row = document.createElement("div");
      row.className = "card";
      let title = document.createElement("strong");
      title.textContent = d.name + " — " + money(d.balance, d.currency);
      row.append(title);
      let inputs = document.createElement("div");
      inputs.className = "formgrid";
      inputs.innerHTML = `<div class="field"><label for="min-${i}">Pago mínimo mensual</label><input id="min-${i}" type="number" min="0" step="0.01"></div><div class="field"><label for="rate-${i}">Tasa anual confirmada (%)</label><input id="rate-${i}" type="number" min="0" step="0.01"></div><div class="field"><label for="kind-${i}">Tipo de tasa</label><select id="kind-${i}"><option value="">Seleccionar</option><option value="APR">APR nominal</option><option value="EA">Efectiva anual (E.A.)</option></select></div>`;
      row.append(inputs);
      box.append(row);
    });
  };
  get("sim-calc").onclick = () => {
    try {
      if (!scenario.length) throw Error("Carga tus deudas primero.");
      let current = debts.filter(
        (d) => d.currency === currency && d.balance > 0,
      );
      if (
        current.length !== scenario.length ||
        current.some(
          (d, i) =>
            d.id !== scenario[i].id ||
            d.balance !== scenario[i].balance ||
            d.currency !== scenario[i].currency,
        )
      )
        throw Error(
          "Tus deudas cambiaron. Vuelve a cargarlas antes de comparar.",
        );
      let v = scenario.map((d, i) => {
        let mn = get("min-" + i),
          rate = get("rate-" + i),
          kind = get("kind-" + i);
        if (!mn.value || !rate.value || !kind.value)
          throw Error("Completa mínimo, tasa y tipo de tasa para cada deuda.");
        return {
          ...d,
          minimum: Number(mn.value),
          rate: Number(rate.value),
          rateType: kind.value,
        };
      });
      let amount = get("sim-budget").value,
        date = get("sim-date").value;
      if (!amount || !date)
        throw Error("Completa el pago mensual y la fecha de inicio.");
      lastSimulation = DebtEngine.compare(v, Number(amount), date);
      renderSimulation();
    } catch (e) {
      lastSimulation = null;
      get("sim-visual")?.replaceChildren();
      delete get("sim-output").dataset.localizedOutput;
      get("sim-output").textContent = e.message;
    }
  };
  document.addEventListener("deudas:languagechange", () => {
    renderSimulation();
  });
})();
