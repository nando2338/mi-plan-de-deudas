/* Ajustes de la versión 1.2: moneda por defecto, recordatorios (activar, hora,
   días de anticipación) y exportación de pagos a CSV. */
(function () {
  "use strict";
  const more = document.querySelector("#view-more .more-settings");
  const S = window.MPDDSchedule;
  if (!more || !S) return;
  const T = {
    currencyNote: "La moneda elegida se usa por defecto al crear deudas nuevas. Cada deuda conserva su propia moneda y los totales nunca se mezclan.",
    remTitle: "Recordatorios",
    remEnable: "Activar avisos",
    remTime: "Hora del aviso",
    remDays: "Avisar con anticipación",
    day1: "1 día antes",
    day3: "3 días antes",
    day7: "7 días antes",
    remNote: "Los avisos se muestran en este dispositivo mientras la aplicación está abierta, a partir de la hora elegida. El contador rojo de Inicio cuenta los pagos vencidos y los que vencen dentro de los días elegidos.",
    remOn: "Avisos activados.",
    remOff: "Avisos desactivados.",
    remSaved: "Preferencia guardada.",
    remDenied: "El navegador no concedió permiso para avisos.",
    remError: "No se pudo guardar la preferencia.",
    remLocked: "Hay una recuperación pendiente; no se guardó la preferencia.",
    csvTitle: "Exportar pagos (CSV)",
    csvFrom: "Desde",
    csvTo: "Hasta",
    csvButton: "Exportar CSV",
    csvReady: "Archivo listo:",
    csvDownload: "Descargar CSV",
    csvEmpty: "No hay pagos entre esas fechas.",
    csvBad: "Revisa las fechas: «Desde» debe ser anterior o igual a «Hasta».",
    csvNote: "Incluye fecha de pago, fecha de vencimiento, deuda, categoría, monto (número sin símbolo), moneda y estado. Contiene información financiera sin cifrar.",
  };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { ajustes: T });
  const en = () => document.documentElement.lang === "en";
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const locked = () => {
    try {
      return localStorage.getItem("nando-restore-journal-v1") !== null;
    } catch (_) {
      return true;
    }
  };
  const appDebts = () => {
    try {
      return Array.isArray(debts) ? debts : [];
    } catch (_) {
      return [];
    }
  };

  /* Currency: default for new debts. */
  const sw = more.querySelector(".switch");
  if (sw) sw.after(el("p", "label currency-note", T.currencyNote));

  /* Reminders. */
  const backupTitle = [...more.querySelectorAll("h3")].find((h) => h.dataset.localLabel === "backups");
  const rem = el("div", "settings-block");
  const cfg = S.readAvisos(localStorage);
  const enableWrap = el("label", "check-row");
  const enable = el("input");
  enable.type = "checkbox";
  enable.id = "avisos-enabled";
  enable.checked = cfg.enabled;
  enableWrap.append(enable, " ", el("span", "", T.remEnable));
  const timeField = el("div", "field");
  const timeLabel = el("label", "", T.remTime);
  const time = el("input");
  time.type = "time";
  time.id = "avisos-time";
  time.value = cfg.time;
  timeLabel.htmlFor = time.id;
  timeField.append(timeLabel, time);
  const daysField = el("div", "field");
  const daysLabel = el("label", "", T.remDays);
  const days = el("select");
  days.id = "avisos-days";
  for (const [v, l] of [
    [1, T.day1],
    [3, T.day3],
    [7, T.day7],
  ]) {
    const o = el("option", "", l);
    o.value = String(v);
    days.append(o);
  }
  days.value = String(cfg.daysBefore);
  daysLabel.htmlFor = days.id;
  daysField.append(daysLabel, days);
  const remStatus = el("p", "label");
  remStatus.setAttribute("role", "status");
  const grid = el("div", "formgrid");
  grid.append(timeField, daysField);
  rem.append(enableWrap, grid, el("p", "label", T.remNote), remStatus);
  function saveAvisos() {
    if (locked()) {
      remStatus.textContent = T.remLocked;
      return false;
    }
    // The time is saved only once the user chooses one; until then alerts are not limited by time.
    const v = { daysBefore: Number(days.value) };
    if (timeChosen) v.time = time.value;
    if (!S.validAvisos(v)) {
      remStatus.textContent = T.remError;
      return false;
    }
    try {
      localStorage.setItem(S.AVISOS_KEY, JSON.stringify(v));
      document.dispatchEvent(new Event("mpdd:avisoschange"));
      return true;
    } catch (_) {
      remStatus.textContent = T.remError;
      return false;
    }
  }
  let timeChosen = cfg.timeSet;
  time.addEventListener("change", () => {
    timeChosen = true;
    if (saveAvisos()) remStatus.textContent = T.remSaved;
  });
  days.addEventListener("change", () => {
    if (saveAvisos()) remStatus.textContent = T.remSaved;
  });
  enable.addEventListener("change", async () => {
    const N = window.DebtForegroundNotices;
    if (locked()) {
      enable.checked = !enable.checked;
      remStatus.textContent = T.remLocked;
      return;
    }
    try {
      if (enable.checked) {
        const state = N ? await N.enable(window) : { enabled: false };
        if (!state.enabled) {
          enable.checked = false;
          remStatus.textContent = state.reason === "denied" ? T.remDenied : T.remError;
          return;
        }
        saveAvisos();
        remStatus.textContent = T.remOn;
      } else {
        if (N) N.disable(window);
        remStatus.textContent = T.remOff;
      }
      document.dispatchEvent(new Event("mpdd:avisoschange"));
    } catch (e) {
      enable.checked = S.readAvisos(localStorage).enabled;
      remStatus.textContent = (e && e.message) || T.remError;
    }
  });

  /* CSV export. */
  const csv = el("div", "settings-block");
  const t0 = new Date().toLocaleDateString("en-CA");
  const mk = (id, label, value) => {
    const f = el("div", "field");
    const l = el("label", "", label);
    const i = el("input");
    i.type = "date";
    i.id = id;
    i.value = value;
    l.htmlFor = id;
    f.append(l, i);
    return [f, i];
  };
  const [fFrom, from] = mk("csv-from", T.csvFrom, t0.slice(0, 8) + "01");
  const [fTo, to] = mk("csv-to", T.csvTo, S.monthEnd(+t0.slice(0, 4), +t0.slice(5, 7)));
  const g2 = el("div", "formgrid");
  g2.append(fFrom, fTo);
  const go = el("button", "ghost", T.csvButton);
  go.type = "button";
  go.id = "csv-export";
  const out = el("div", "csv-out");
  out.setAttribute("role", "status");
  let url = null;
  go.addEventListener("click", () => {
    out.replaceChildren();
    if (!S.validDate(from.value) || !S.validDate(to.value) || from.value > to.value) {
      out.append(el("p", "label", T.csvBad));
      return;
    }
    const rows = S.payments(appDebts(), { from: from.value, to: to.value })
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) {
      out.append(el("p", "label", T.csvEmpty));
      return;
    }
    const english = en();
    const headers = english ? ["Payment date", "Due date", "Debt", "Category", "Amount", "Currency", "Status"] : undefined;
    const labels = english ? { onTime: "Paid on time", late: "Paid late", paid: "Paid" } : null;
    const text = S.toCSV(rows.map((r) => (labels ? Object.assign({}, r, { statusLabel: labels[r.status] }) : r)), headers);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = el("a", "ghost", T.csvDownload);
    a.href = url;
    a.download = "pagos-" + from.value + "_" + to.value + ".csv";
    const p = el("p", "label");
    p.append(el("span", "", T.csvReady), " ");
    out.append(p, a);
    window.MPDDLastCSV = text; // used by automated tests only; no network.
  });
  csv.append(g2, el("div", "actions", undefined), el("p", "label", T.csvNote), out);
  csv.querySelector(".actions").append(go);

  const remTitle = el("h3", "", T.remTitle);
  const csvTitle = el("h3", "", T.csvTitle);
  if (backupTitle) backupTitle.before(remTitle, rem, csvTitle, csv);
  else more.append(remTitle, rem, csvTitle, csv);
})();
