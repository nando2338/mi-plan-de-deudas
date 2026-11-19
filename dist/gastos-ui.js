/* Sección "Gastos fijos" de Inicio (versión 1.8), debajo de las deudas.
   Usa la API común window.MPDDGastos (gastos-store.js) y la lógica pura MPDDGastosCore.
   Los datos del usuario solo se insertan con textContent; los montos solo con
   MPDDMoney.formatMoney. Los textos en español se traducen con i18n.js (un texto por nodo;
   los valores dinámicos van en nodos con data-localized-output="true"). */
(function () {
  "use strict";
  const G = window.MPDDGastos;
  const C = window.MPDDGastosCore;
  const M = window.MPDDMoney;
  if (!G || !C || !M) return;
  const JOURNAL = "nando-restore-journal-v1";
  const FREQ_LABEL = { monthly: "Mensual", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual" };
  const FREQ_OPTION = { monthly: "Mensual (cada mes)", quarterly: "Trimestral (cada 3 meses)", semiannual: "Semestral (cada 6 meses)", annual: "Anual (una vez al año)" };
  const DUE_LABEL = { overdue: "Vencido", today: "Vence hoy", tomorrow: "Vence mañana" };
  const NEW_CAT = "__new";

  const en = () => document.documentElement.lang === "en";
  const locale = () => (en() ? "en-US" : "es-CO");
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  /* A value that must not be translated (names, amounts, dates). */
  function raw(tag, text, cls) {
    const n = el(tag, cls, text);
    n.dataset.localizedOutput = "true";
    return n;
  }
  function button(text, cls) {
    const b = el("button", cls || "ghost", text);
    b.type = "button";
    return b;
  }
  function locked() {
    try {
      if (localStorage.getItem(JOURNAL) !== null) return true;
    } catch (_) {
      return true;
    }
    try {
      return !!(window.MPDDApp && window.MPDDApp.isLocked());
    } catch (_) {
      return false;
    }
  }
  function longDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  function monthName(m) {
    return new Intl.DateTimeFormat(locale(), { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, m - 1, 1)));
  }
  function addDays(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.getUTCFullYear() + "-" + String(x.getUTCMonth() + 1).padStart(2, "0") + "-" + String(x.getUTCDate()).padStart(2, "0");
  }

  /* Amount typed by the user: point or comma. "1.234,56" / "1,234.56" → 1234.56;
     "12,5" / "12.50" → 12.5; one separator followed by exactly 3 digits is a thousands
     separator ("1.200" / "1,200" → 1200). Returns NaN when it is not a number. */
  function parseAmount(text) {
    let s = String(text === null || text === undefined ? "" : text)
      .trim()
      .replace(/\s+/g, "")
      .replace(/^(US\$|\$|€)/i, "")
      .replace(/(€|USD|COP|EUR)$/i, "");
    if (!s || !/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return NaN;
    const lastDot = s.lastIndexOf("."),
      lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? "." : ",";
      const thou = dec === "." ? "," : ".";
      const [int, frac] = [s.slice(0, s.lastIndexOf(dec)), s.slice(s.lastIndexOf(dec) + 1)];
      if (int.includes(dec) || !/^\d{1,3}([.,]\d{3})*$/.test(int) || int.split(thou).length < 2 || frac.length > 2) return NaN;
      s = int.split(thou).join("") + "." + frac;
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? "." : ",";
      const parts = s.split(sep);
      if (parts.length > 2) {
        if (!/^\d{1,3}$/.test(parts[0]) || parts.slice(1).some((p) => p.length !== 3)) return NaN;
        s = parts.join("");
      } else if (parts[1].length === 3) {
        if (!/^\d{1,3}$/.test(parts[0])) return NaN;
        s = parts.join("");
      } else if (parts[1].length <= 2) s = parts[0] + "." + parts[1];
      else return NaN;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  /* ---------------- section ---------------- */
  const section = el("section", "gf-section");
  section.id = "gastos-fijos";
  section.setAttribute("aria-labelledby", "gf-title");
  const head = el("div", "section-head");
  const headText = el("div");
  const title = el("h2", "", "Gastos fijos");
  title.id = "gf-title";
  headText.append(title, el("p", "", "Agua, luz, impuestos y otros pagos que se repiten."));
  const addBtn = button("+ Agregar gasto fijo", "ghost gf-add");
  addBtn.id = "gf-add";
  head.append(headText, addBtn);
  const summary = el("div", "gf-summary");
  const status = el("p", "gf-status label");
  status.setAttribute("role", "status");
  const list = el("div", "cards gf-cards");
  list.id = "gf-cards";
  section.append(head, summary, status, list);
  const anchor = document.getElementById("cards");
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor.nextSibling);
  else (document.querySelector("main") || document.body).append(section);

  let confirmId = null;
  function say(text) {
    status.replaceChildren();
    if (text) status.append(el("span", "", text));
  }

  /* State of one expense today: current payment, last paid one before it, highlight. */
  function cardState(g, t) {
    const cur = C.currentOccurrence(g, t);
    const from = addDays(t.slice(0, 8) + "01", -62).slice(0, 8) + "01";
    const occ = C.occurrences([g], { from, to: addDays(t, 400), today: t });
    const before = cur ? occ.filter((o) => o.dueDate < cur.dueDate) : occ;
    const last = before.length ? before[before.length - 1] : null;
    const level = cur ? C.dueLevel(cur.dueDate, t, false) : null;
    // Paid recently and the next one is not close yet: show "Pagado" (with undo).
    const paid = last && last.payment && !level ? last : null;
    return { cur, level, paid };
  }
  function dueLabel(level) {
    const box = el("span", "gf-due gf-due-" + level.level);
    if (level.kind === "soon") box.append(el("span", "", "Vence en"), " ", raw("span", String(level.days)), " ", el("span", "", "días"));
    // Same text as the debt cards: "Vencido hace N días" (1.8).
    else if (level.kind === "overdue") box.append(el("span", "", "Vencido hace"), " ", raw("span", String(-level.days)), " ", el("span", "", -level.days === 1 ? "día" : "días"));
    else box.append(el("span", "", DUE_LABEL[level.kind]));
    return box;
  }
  function moneyLines(totals, cls) {
    const box = el("div", "money-lines " + (cls || ""));
    for (const c of M.ordered(totals)) box.append(raw("div", M.formatMoney(totals[c], c), "money-line"));
    return box;
  }

  function render() {
    const t = G.today();
    const items = G.list();
    const isLocked = locked();
    addBtn.disabled = isLocked;
    summary.replaceChildren();
    list.replaceChildren();
    if (!items.length) {
      summary.hidden = true;
      const empty = el("div", "empty gf-empty");
      empty.append(el("p", "", "Aún no tienes gastos fijos registrados."), el("p", "label", "Agrega pagos que se repiten, como agua, luz, HOA o impuestos, para verlos junto a tus deudas."));
      const b = button("+ Agregar gasto fijo", "ghost gf-add");
      b.disabled = isLocked;
      b.addEventListener("click", () => openForm(null, b));
      empty.append(b);
      list.append(empty);
      return;
    }
    summary.hidden = false;
    const tot = el("div", "gf-total");
    tot.append(el("div", "label", "Total mensual de gastos fijos"), moneyLines(G.monthlyTotals(), "gf-monthly"));
    summary.append(tot);
    const y = +t.slice(0, 4),
      m = +t.slice(5, 7);
    const nonMonthly = items.some((g) => g.frequency !== "monthly");
    if (nonMonthly) {
      summary.append(el("p", "label gf-note", "Los gastos trimestrales, semestrales y anuales se cuentan como su parte mensual."));
      const due = C.dueInMonthTotals(items, y, m);
      const box = el("div", "gf-thismonth");
      box.append(el("div", "label", "Este mes pagas:"), Object.keys(due).length ? moneyLines(due, "gf-due-month") : el("div", "money-line muted", "Nada este mes"));
      summary.append(box);
    }
    const rows = items.map((g) => ({ g, st: cardState(g, t) }));
    rows.sort((a, b) => (a.st.cur ? a.st.cur.dueDate : "9999").localeCompare(b.st.cur ? b.st.cur.dueDate : "9999") || a.g.name.localeCompare(b.g.name));
    for (const { g, st } of rows) list.append(card(g, st, t, y, m, isLocked));
    if (isLocked) list.append(el("p", "label", "Hay una recuperación pendiente: no se pueden cambiar los gastos fijos hasta revisarla."));
  }

  function card(g, st, t, y, m, isLocked) {
    const info = G.categoryInfo(g.category, en() ? "en" : "es");
    const art = el("article", "card gf-card" + (st.level ? " gf-" + st.level.level : "") + (st.paid ? " gf-paid" : ""));
    art.dataset.gastoId = g.id;
    const top = el("div", "cardtop");
    const left = el("div", "gf-head");
    const icon = el("span", "gf-icon", info.icon);
    icon.setAttribute("aria-hidden", "true");
    const names = el("div");
    names.append(raw("div", info.label, "tag gf-cat"), raw("h3", g.name));
    left.append(icon, names);
    const right = el("div", "balance");
    right.append(raw("div", M.formatMoney(g.amount, g.currency), "gf-amount"), el("div", "sub", FREQ_LABEL[g.frequency] || FREQ_LABEL.monthly));
    if (g.frequency !== "monthly") {
      const eq = el("div", "sub gf-equiv");
      eq.append(el("span", "", "Equivale a"), " ", raw("span", M.formatMoney(C.monthlyEquivalent(g), g.currency)), " ", el("span", "", "al mes"));
      right.append(eq);
    }
    top.append(left, right);
    art.append(top);
    const meta = el("div", "meta gf-meta");
    const next = el("span", "gf-next");
    if (st.cur) next.append(el("span", "", "Próximo pago:"), " ", raw("span", longDate(st.cur.dueDate)));
    meta.append(next);
    const marks = el("span", "gf-marks");
    if (st.level) marks.append(dueLabel(st.level));
    if (g.frequency !== "monthly" && C.isDueMonth(g, y, m)) marks.append(el("span", "gf-badge-month", "Se paga este mes"));
    if (st.paid) marks.append(el("span", "status-chip st-paid gf-paid-chip", "Pagado"));
    meta.append(marks);
    art.append(meta);
    if (g.note) art.append(raw("p", g.note, "label gf-note-text"));
    const actions = el("div", "actions");
    if (st.paid) {
      const undo = button("Deshacer", "ghost gf-undo");
      undo.dataset.period = st.paid.period;
      undo.disabled = isLocked;
      undo.addEventListener("click", () => {
        if (locked()) return;
        G.unmarkPaid(g.id, st.paid.period);
        say("Pago deshecho.");
      });
      actions.append(undo);
    }
    if (st.cur && !st.paid) {
      const pay = button("Registrar pago", "pay gf-pay");
      pay.dataset.period = st.cur.period;
      pay.disabled = isLocked;
      pay.addEventListener("click", () => {
        if (locked()) return;
        G.markPaid(g.id, st.cur.period);
        say("Pago registrado.");
      });
      actions.append(pay);
    }
    const edit = button("Editar", "ghost gf-edit");
    edit.disabled = isLocked;
    edit.addEventListener("click", () => openForm(g.id, edit));
    const del = button("Eliminar", "ghost gf-delete");
    del.disabled = isLocked;
    del.addEventListener("click", () => {
      confirmId = g.id;
      render();
      const yes = list.querySelector(".gf-confirm-delete");
      if (yes) yes.focus();
    });
    actions.append(edit, del);
    art.append(actions);
    if (confirmId === g.id) {
      const box = el("div", "notice gf-confirm");
      box.setAttribute("role", "alert");
      const q = el("p");
      q.append(el("span", "", "¿Eliminar este gasto fijo y sus pagos registrados?"), " ", raw("strong", g.name));
      const row = el("div", "actions");
      const yes = button("Sí, eliminar", "ghost gf-confirm-delete");
      yes.disabled = isLocked;
      yes.addEventListener("click", () => {
        if (locked()) return;
        confirmId = null;
        G.remove(g.id);
        say("Gasto fijo eliminado.");
        addBtn.focus();
      });
      const no = button("Cancelar", "ghost gf-cancel-delete");
      no.addEventListener("click", () => {
        confirmId = null;
        render();
      });
      row.append(yes, no);
      box.append(q, row);
      art.append(box);
    }
    return art;
  }

  /* ---------------- add / edit form ---------------- */
  const dialog = document.createElement("dialog");
  dialog.id = "gf-dialog";
  dialog.setAttribute("aria-labelledby", "gf-form-title");
  const form = el("form", "modal gf-form");
  form.noValidate = true;
  const formTitle = el("h2");
  formTitle.id = "gf-form-title";
  const formDesc = el("p", "", "Este registro solo organiza tus pagos. No paga ni transfiere dinero.");
  function fieldBox(labelText, id, control, helpText) {
    const box = el("div", "field");
    const lab = el("div", "field-label");
    const l = el("label", "", labelText);
    l.htmlFor = id;
    lab.append(l);
    box.append(lab, control);
    if (helpText) {
      const h = el("p", "help", helpText);
      h.id = id + "-help";
      control.setAttribute("aria-describedby", h.id);
      box.append(h);
    }
    control.id = id;
    return box;
  }
  function input(type, name, attrs) {
    const i = document.createElement("input");
    i.type = type;
    i.name = name;
    for (const [k, v] of Object.entries(attrs || {})) i.setAttribute(k, v);
    return i;
  }
  function select(name, options) {
    const s = document.createElement("select");
    s.name = name;
    for (const [value, text] of options) {
      const o = el("option", "", text);
      o.value = value;
      s.append(o);
    }
    return s;
  }
  const fName = input("text", "name", { maxlength: "80", autocomplete: "off", required: "" });
  const fAmount = input("text", "amount", { inputmode: "decimal", autocomplete: "off", maxlength: "20", required: "" });
  const fCurrency = select("currency", C.CURRENCIES.map((c) => [c, c]));
  const fFreq = select("frequency", Object.keys(C.FREQUENCIES).map((k) => [k, FREQ_OPTION[k]]));
  const fDay = input("number", "day", { min: "1", max: "31", step: "1", inputmode: "numeric", required: "" });
  const fMonth = document.createElement("select");
  fMonth.name = "month";
  const fCat = document.createElement("select");
  fCat.name = "category";
  const fNote = document.createElement("textarea");
  fNote.name = "note";
  fNote.maxLength = 300;
  fNote.rows = 2;
  const newCatName = input("text", "newCategory", { maxlength: "30", autocomplete: "off" });
  const iconSet = el("fieldset", "gf-icons");
  const iconLegend = el("legend", "", "Ícono");
  iconSet.append(iconLegend);
  C.CUSTOM_ICONS.forEach((ic, i) => {
    const lab = el("label", "gf-icon-choice");
    const r = input("radio", "icon", { value: ic });
    if (i === 0) r.checked = true;
    lab.append(r, raw("span", ic));
    iconSet.append(lab);
  });
  const newCatBox = el("div", "gf-newcat");
  newCatBox.append(fieldBox("Nombre de la categoría", "gf-newcat-name", newCatName), iconSet);
  newCatBox.hidden = true;
  const monthBox = fieldBox("Mes de pago", "gf-month", fMonth, "El mes de uno de los pagos. Ejemplo: si el impuesto se paga cada año en marzo, elige marzo.");
  const grid1 = el("div", "formgrid");
  grid1.append(fieldBox("Monto", "gf-amount", fAmount, "Puedes usar punto o coma para los decimales."), fieldBox("Moneda", "gf-currency", fCurrency));
  const grid2 = el("div", "formgrid");
  grid2.append(fieldBox("Frecuencia", "gf-frequency", fFreq), fieldBox("Día de pago", "gf-day", fDay, "Si el mes tiene menos días, se usa el último día del mes."));
  const formError = el("p", "error gf-error");
  formError.setAttribute("role", "alert");
  const btns = el("div", "modalbuttons");
  const cancel = button("Cancelar", "cancel");
  const save = el("button", "save", "Guardar");
  save.type = "submit";
  btns.append(cancel, save);
  form.append(formTitle, formDesc, fieldBox("Nombre", "gf-name", fName), grid1, grid2, monthBox, fieldBox("Categoría", "gf-category", fCat), newCatBox, fieldBox("Nota (opcional)", "gf-note", fNote), formError, btns);
  dialog.append(form);
  document.body.append(dialog);

  let editing = null,
    opener = null;
  function fillMonths(selected) {
    fMonth.replaceChildren();
    for (let i = 1; i <= 12; i++) {
      const o = raw("option", monthName(i));
      o.value = String(i);
      fMonth.append(o);
    }
    fMonth.value = String(selected || +G.today().slice(5, 7));
  }
  function fillCategories(selected) {
    fCat.replaceChildren();
    const none = el("option", "", "Sin categoría");
    none.value = "";
    fCat.append(none);
    const lang = en() ? "en" : "es";
    for (const [key] of C.CATEGORIES) {
      const info = C.categoryInfo(key, [], lang);
      const o = raw("option", info.icon + " " + info.label);
      o.value = key;
      fCat.append(o);
    }
    for (const c of G.categories()) {
      const o = raw("option", c.icon + " " + c.label);
      o.value = c.key;
      fCat.append(o);
    }
    const add = el("option", "", "+ Nueva categoría");
    add.value = NEW_CAT;
    fCat.append(add);
    fCat.value = [...fCat.options].some((o) => o.value === selected) ? selected : "";
  }
  function syncVisibility() {
    monthBox.hidden = fFreq.value === "monthly";
    newCatBox.hidden = fCat.value !== NEW_CAT;
  }
  fFreq.addEventListener("change", syncVisibility);
  fCat.addEventListener("change", () => {
    syncVisibility();
    if (fCat.value === NEW_CAT) newCatName.focus();
  });
  function defaultCurrency() {
    try {
      const p = localStorage.getItem("deudas-currency-pref-v1");
      if (C.CURRENCIES.includes(p)) return p;
    } catch (_) {}
    return "USD";
  }
  function amountText(g) {
    // Shown as the user would type it (no thousands separator).
    return en() || g.currency === "COP" ? String(g.amount) : String(g.amount).replace(".", ",");
  }
  function openForm(id, from) {
    if (locked()) {
      say("Hay una recuperación pendiente: no se pueden cambiar los gastos fijos hasta revisarla.");
      return false;
    }
    const g = id ? G.get(id) : null;
    editing = g;
    opener = from || null;
    formTitle.textContent = g ? "Editar gasto fijo" : "Agregar gasto fijo";
    formError.textContent = "";
    fName.value = g ? g.name : "";
    fAmount.value = g ? amountText(g) : "";
    fCurrency.value = g ? g.currency : defaultCurrency();
    fFreq.value = g ? g.frequency : "monthly";
    fDay.value = g ? String(g.day) : "";
    fillMonths(g && g.month);
    fillCategories(g ? g.category : "");
    fNote.value = g ? g.note || "" : "";
    newCatName.value = "";
    syncVisibility();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    try {
      fName.focus();
    } catch (_) {}
    return true;
  }
  function closeForm() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }
  dialog.addEventListener("close", () => {
    editing = null;
    if (opener && opener.isConnected) {
      try {
        opener.focus();
      } catch (_) {}
    }
    opener = null;
  });
  cancel.addEventListener("click", closeForm);
  function fail(text, field) {
    formError.textContent = text;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      try {
        field.focus();
      } catch (_) {}
    }
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    for (const f of [fName, fAmount, fDay, fMonth, newCatName, fNote]) f.removeAttribute("aria-invalid");
    formError.textContent = "";
    if (locked()) return fail("Hay una recuperación pendiente: no se pueden cambiar los gastos fijos hasta revisarla.");
    const name = fName.value.trim();
    if (!name) return fail("Escribe un nombre para el gasto.", fName);
    const amount = parseAmount(fAmount.value);
    if (!(amount > 0) || amount > 1e12) return fail("Escribe un monto mayor que cero. Puedes usar punto o coma para los decimales.", fAmount);
    const day = Number(fDay.value);
    if (!Number.isInteger(day) || day < 1 || day > 31) return fail("Elige un día de pago entre 1 y 31.", fDay);
    const frequency = C.FREQUENCIES[fFreq.value] ? fFreq.value : "monthly";
    const month = frequency === "monthly" ? null : Number(fMonth.value);
    if (frequency !== "monthly" && !(month >= 1 && month <= 12)) return fail("Elige el mes de pago.", fMonth);
    if (fNote.value.length > 300) return fail("Revisa la nota (máximo 300 caracteres).", fNote);
    let category = fCat.value;
    if (category === NEW_CAT) {
      const label = newCatName.value.trim();
      if (!label || label.length > 30) return fail("Escribe un nombre para la nueva categoría (máximo 30 caracteres).", newCatName);
      const picked = form.querySelector('input[name="icon"]:checked');
      const cat = G.addCategory(label, picked ? picked.value : "⭐");
      if (!cat) return fail("No se pudo guardar. Intenta de nuevo.");
      category = cat.key;
    }
    const data = { name, amount: M.roundTo(amount, fCurrency.value), currency: fCurrency.value, frequency, day, month, category, note: fNote.value.trim() };
    if (editing) Object.assign(data, { id: editing.id, createdAt: editing.createdAt, payments: editing.payments });
    let r;
    try {
      r = G.save(data);
    } catch (_) {
      r = { ok: false, errors: ["storage"] };
    }
    if (!r.ok) return fail("No se pudo guardar. Intenta de nuevo.");
    closeForm();
    say("Gasto fijo guardado.");
  });
  addBtn.addEventListener("click", () => openForm(null, addBtn));

  /* ---------------- refresh ---------------- */
  function safeRender() {
    try {
      render();
    } catch (_) {
      // Never break the rest of the app because of this section.
    }
  }
  document.addEventListener("mpdd:gastoschange", safeRender);
  document.addEventListener("deudas:languagechange", () => {
    safeRender();
    if (dialog.open) {
      fillMonths(fMonth.value);
      const v = fCat.value;
      fillCategories(v === NEW_CAT ? "" : v);
      if (v === NEW_CAT) fCat.value = NEW_CAT;
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") safeRender();
  });
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key === C.KEY || e.key === C.CATS_KEY) safeRender();
  });
  // The day changes at midnight: the highlight and "Este mes pagas" move with it.
  let midnight = null;
  function armMidnight() {
    clearTimeout(midnight);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    midnight = setTimeout(() => {
      safeRender();
      armMidnight();
    }, Math.max(1000, next - now));
  }
  armMidnight();
  window.MPDDGastosUI = { render: safeRender, parseAmount, openAdd: () => openForm(null, addBtn), openEdit: (id) => openForm(id, null) };
  safeRender();
})();
