/* Ajustes de la versión 1.2: moneda por defecto, recordatorios (activar, hora,
   días de anticipación) y exportación de pagos a CSV.
   1.4: la sección "Notificaciones" (web push, prueba y archivo de calendario .ics). */
(function () {
  "use strict";
  const more = document.querySelector("#view-more .more-settings");
  const S = window.MPDDSchedule;
  if (!more || !S) return;
  const T = {
    currencyNote: "La moneda elegida se usa por defecto al crear deudas nuevas. Cada deuda conserva su propia moneda y los totales nunca se mezclan.",
    remTitle: "Notificaciones",
    remEnable: "Recordarme mis pagos",
    remTime: "Hora del aviso",
    remDays: "Avisar con anticipación",
    day1: "1 día antes",
    day3: "3 días antes",
    day7: "7 días antes",
    remNote: "Recibirás un aviso los días elegidos antes de cada pago, el día del vencimiento y si un pago queda vencido, a partir de la hora elegida. El contador rojo de Inicio cuenta los pagos vencidos y los que vencen dentro de los días elegidos.",
    pushIntro: "Recibe un aviso en este teléfono o computador antes de cada pago, aunque la app esté cerrada.",
    pushAccount: "Los avisos los envía tu cuenta con las deudas sincronizadas: necesitas iniciar sesión. Actívalos en cada dispositivo donde quieras recibirlos.",
    pushEnable: "Activar notificaciones",
    pushDisable: "Desactivar en este dispositivo",
    pushTest: "Enviar notificación de prueba",
    deviceOn: "Este dispositivo recibe notificaciones.",
    deviceOff: "Este dispositivo no recibe notificaciones.",
    pushOn: "¡Listo! Te avisaremos antes de cada pago en este dispositivo.",
    pushOnNoSettings: "Notificaciones activadas. No se pudieron guardar tus preferencias en la cuenta; se intentará de nuevo.",
    pushOff: "Notificaciones desactivadas en este dispositivo.",
    pushOffPartial: "Se desactivaron en este dispositivo, pero no se pudo avisar a tu cuenta. Inténtalo de nuevo con conexión.",
    pushNeedAccount: "Para recibir notificaciones necesitas una cuenta con tus deudas sincronizadas.",
    pushGoAccount: "Crear cuenta o iniciar sesión",
    pushUnsupported: "Este navegador no admite notificaciones. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.",
    pushError: "No se pudieron activar las notificaciones. Inténtalo de nuevo más tarde.",
    iosIntro: "En iPhone y iPad, las notificaciones solo funcionan con la app instalada:",
    ios1: "Abre esta página en Safari y toca Compartir.",
    ios2: "Elige «Agregar a pantalla de inicio» y luego «Agregar».",
    ios3: "Abre la app desde el ícono nuevo y toca «Activar notificaciones».",
    deniedIntro: "El navegador bloqueó las notificaciones de esta app. Para permitirlas:",
    denied1: "En el computador: toca el ícono junto a la dirección de la página, busca «Notificaciones» y elige «Permitir».",
    denied2: "En Android: abre Chrome, ve a Configuración → Configuración de sitios → Notificaciones y permite esta app.",
    denied3: "En iPhone o iPad: abre Configuración → Notificaciones → SolviPath y activa «Permitir notificaciones».",
    denied4: "Luego vuelve aquí y toca «Activar notificaciones».",
    err_dismissed: "No diste permiso para las notificaciones. Puedes intentarlo de nuevo cuando quieras.",
    err_locked: "Hay una recuperación pendiente; no se guardó la preferencia.",
    err_noWorker: "La app aún no está lista para notificaciones. Recarga la página e inténtalo de nuevo.",
    err_network: "Sin conexión. Inténtalo de nuevo cuando tengas internet.",
    err_auth: "Tu sesión expiró. Inicia sesión de nuevo.",
    err_noDevices: "Ningún dispositivo tiene las notificaciones activadas. Toca «Activar notificaciones» primero.",
    testSending: "Enviando notificación de prueba…",
    testSent: "Notificación de prueba enviada. Debería llegar en unos segundos.",
    remNeedButton: "Primero toca «Activar notificaciones» para dar permiso en este dispositivo.",
    remSavedLocal: "Preferencia guardada en este dispositivo. No se pudo actualizar en tu cuenta; se intentará de nuevo.",
    icsTitle: "Agregar mis pagos a mi calendario",
    icsNote: "Descarga un archivo con tus fechas de pago para Google Calendar, Calendario de Apple u Outlook. Cada pago se repite cada mes y te avisa un día antes.",
    icsUpdate: "Si cambias tus deudas, descarga el archivo de nuevo.",
    icsButton: "Agregar mis pagos a mi calendario",
    icsReady: "Archivo mis-pagos.ics listo. Ábrelo para agregar los pagos a tu calendario.",
    icsEmpty: "Agrega el día de pago a tus deudas para crear el calendario.",
    icsError: "No se pudo crear el archivo del calendario.",
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

  /* Notificaciones (1.4): web push from the account's server, the in-app notices,
     reminder time and lead days (same local keys as 1.2, synced to push_settings),
     a test notification and the calendar file (.ics). */
  const P = window.MPDDPush;
  const backupTitle = [...more.querySelectorAll("h3")].find((h) => h.dataset.localLabel === "backups");
  const rem = el("div", "settings-block notifications-block");
  const cfg = S.readAvisos(localStorage);
  const remStatus = el("p", "label");
  remStatus.setAttribute("role", "status");
  remStatus.id = "push-status";
  const help = el("div", "push-help");
  help.id = "push-help";
  help.setAttribute("aria-live", "polite");
  const deviceState = el("p", "label push-device");
  deviceState.id = "push-device";
  const actions = el("div", "actions");
  const mkButton = (id, label, cls) => {
    const b = el("button", cls, label);
    b.type = "button";
    b.id = id;
    return b;
  };
  const pushOn = mkButton("push-enable", T.pushEnable);
  const pushOff = mkButton("push-disable", T.pushDisable, "ghost");
  const pushTest = mkButton("push-test", T.pushTest, "ghost");
  actions.append(pushOn, pushOff, pushTest);
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
  // The server checks every 15 minutes: offer quarter-hour times.
  time.step = "900";
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
  const grid = el("div", "formgrid");
  grid.append(timeField, daysField);
  rem.append(el("p", "label", T.pushIntro), el("p", "label", T.pushAccount), remStatus, deviceState, actions, help, enableWrap, grid, el("p", "label", T.remNote));

  const signedIn = () => {
    try {
      return !!(window.MPDDCloud && window.MPDDCloud.status().userId);
    } catch (_) {
      return false;
    }
  };
  function list(items) {
    const ol = el("ol", "push-steps");
    for (const t of items) ol.append(el("li", "", t));
    return ol;
  }
  /* Explains why notifications cannot be turned on, with the steps for each case. */
  function explain(reason) {
    help.replaceChildren();
    if (reason === "iosInstall") {
      remStatus.textContent = T.iosIntro;
      help.append(list([T.ios1, T.ios2, T.ios3]));
    } else if (reason === "denied") {
      remStatus.textContent = T.deniedIntro;
      help.append(list([T.denied1, T.denied2, T.denied3, T.denied4]));
    } else if (reason === "unsupported") remStatus.textContent = T.pushUnsupported;
    else if (reason === "account") {
      remStatus.textContent = T.pushNeedAccount;
      const go = el("button", "ghost", T.pushGoAccount);
      go.type = "button";
      go.addEventListener("click", () => P && P.askAccount(window));
      help.append(go);
    } else remStatus.textContent = T["err_" + reason] || T.pushError;
  }
  function refresh() {
    const active = !!(P && P.deviceActive(window));
    deviceState.textContent = active ? T.deviceOn : T.deviceOff;
    pushOn.hidden = active;
    pushOff.hidden = !active;
  }
  /* Server copy of the settings (only when signed in). Retried after sign-in / reconnection. */
  let pendingSync = false;
  async function syncSettings(overrides) {
    if (!P || !signedIn()) return null;
    const r = await P.syncSettings(window, overrides);
    pendingSync = !r.ok;
    return r;
  }
  let busy = false;
  async function run(fn) {
    if (busy) return;
    busy = true;
    for (const b of [pushOn, pushOff, pushTest]) b.disabled = true;
    try {
      await fn();
    } catch (_) {
      remStatus.textContent = T.pushError;
    } finally {
      busy = false;
      for (const b of [pushOn, pushOff, pushTest]) b.disabled = false;
      refresh();
    }
  }
  pushOn.addEventListener("click", () =>
    run(async () => {
      help.replaceChildren();
      if (!P) return explain("unsupported");
      if (locked()) return explain("locked");
      // The browser permission is requested only here, after this tap.
      const r = await P.activate(window);
      if (!r.ok) return explain(r.reason);
      enable.checked = true;
      remStatus.textContent = r.settingsSaved ? T.pushOn : T.pushOnNoSettings;
      pendingSync = !r.settingsSaved;
      document.dispatchEvent(new Event("mpdd:avisoschange"));
    })
  );
  pushOff.addEventListener("click", () =>
    run(async () => {
      help.replaceChildren();
      const r = await P.deactivate(window);
      remStatus.textContent = r.ok ? T.pushOff : T.pushOffPartial;
    })
  );
  pushTest.addEventListener("click", () =>
    run(async () => {
      help.replaceChildren();
      if (!P || !signedIn()) return explain("account");
      remStatus.textContent = T.testSending;
      const r = await P.sendTest(window);
      if (r.ok) remStatus.textContent = T.testSent;
      else explain(r.error === "sin_suscripciones" ? "noDevices" : r.error);
    })
  );
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
  async function savedAndSynced() {
    remStatus.textContent = T.remSaved;
    const r = await syncSettings();
    if (r && !r.ok) remStatus.textContent = T.remSavedLocal;
  }
  let timeChosen = cfg.timeSet;
  time.addEventListener("change", () => {
    timeChosen = true;
    if (saveAvisos()) savedAndSynced();
  });
  days.addEventListener("change", () => {
    if (saveAvisos()) savedAndSynced();
  });
  /* On/off for this account's reminders. Never asks for permission: that is the button's job. */
  enable.addEventListener("change", async () => {
    const N = window.DebtForegroundNotices;
    help.replaceChildren();
    if (locked()) {
      enable.checked = !enable.checked;
      remStatus.textContent = T.remLocked;
      return;
    }
    try {
      if (enable.checked) {
        const state = P ? P.detect(window) : "unsupported";
        if (state !== "ok") {
          enable.checked = false;
          explain(state);
          return;
        }
        if (window.Notification.permission !== "granted") {
          enable.checked = false;
          remStatus.textContent = T.remNeedButton;
          return;
        }
        // Permission is already granted: just store the preference (no new prompt).
        localStorage.setItem(S.AVISOS_OPT, "true");
        if (localStorage.getItem(S.AVISOS_OPT) !== "true") throw new Error(T.remError);
        saveAvisos();
        remStatus.textContent = T.remOn;
      } else {
        if (N) N.disable(window);
        remStatus.textContent = T.remOff;
      }
      document.dispatchEvent(new Event("mpdd:avisoschange"));
      const r = await syncSettings({ enabled: enable.checked });
      if (r && !r.ok) remStatus.textContent = T.remSavedLocal;
    } catch (e) {
      enable.checked = S.readAvisos(localStorage).enabled;
      remStatus.textContent = (e && e.message) || T.remError;
    }
  });
  // After signing in (or reconnecting), send this device's settings if it receives notifications.
  let lastUser = null;
  if (window.MPDDCloud && typeof window.MPDDCloud.onChange === "function")
    window.MPDDCloud.onChange((st) => {
      const uid = st && st.userId;
      if (!uid) {
        lastUser = null;
        setTimeout(refresh, 0);
        return;
      }
      if (uid !== lastUser && st.state === "synced") {
        lastUser = uid;
        // 1.9: re-asocia la suscripción de este navegador a la cuenta activa (sin pedir permiso).
        if (P && P.restore) P.restore(window).then((r) => {
          refresh();
          if (r && r.ok) enable.checked = true;
        });
        else if (pendingSync || (P && P.deviceActive(window))) syncSettings();
      }
    });
  window.addEventListener("online", () => {
    if (pendingSync) syncSettings();
  });
  // Language or time zone may have changed: the server writes the reminders in that language.
  document.addEventListener("deudas:languagechange", () => {
    if (P && P.deviceActive(window)) syncSettings();
  });
  // If the browser no longer has the subscription (removed by the browser, the server or
  // another device), do not keep saying "este dispositivo recibe notificaciones".
  if (P && P.deviceActive(window)) {
    try {
      const sw = navigator.serviceWorker;
      const perm = window.Notification && window.Notification.permission;
      if (perm && perm !== "granted") {
        P.setDevice(window, false);
      } else if (sw && sw.getRegistration) {
        sw.getRegistration()
          .then((reg) => (reg && reg.pushManager ? reg.pushManager.getSubscription() : undefined))
          .then((sub) => {
            if (sub === null) {
              P.setDevice(window, false);
              refresh();
            }
          })
          .catch(() => {});
      }
    } catch (_) {}
  }
  refresh();
  // 1.9: si el navegador bloqueó las notificaciones, explica cómo activarlas.
  try {
    if (P && P.detect(window) === "denied") explain("denied");
  } catch (_) {}

  /* Calendar file: one monthly all-day event per debt with a due day. */
  const cal = el("div", "settings-block");
  const icsButton = mkButton("ics-download", T.icsButton, "ghost");
  const icsStatus = el("p", "label");
  icsStatus.setAttribute("role", "status");
  const icsActions = el("div", "actions");
  icsActions.append(icsButton);
  cal.append(el("p", "label", T.icsNote), icsActions, el("p", "label", T.icsUpdate), icsStatus);
  icsButton.addEventListener("click", () => {
    if (!P) return;
    const r = P.buildICS(appDebts(), { lang: en() ? "en" : "es" });
    if (!r.count) {
      icsStatus.textContent = T.icsEmpty;
      return;
    }
    window.MPDDLastICS = r.text; // used by automated tests only; no network.
    try {
      P.downloadICS(window, r.text);
      icsStatus.textContent = T.icsReady;
    } catch (_) {
      icsStatus.textContent = T.icsError;
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
  remTitle.id = "notificaciones-title";
  const calTitle = el("h3", "", T.icsTitle);
  const csvTitle = el("h3", "", T.csvTitle);
  if (backupTitle) backupTitle.before(remTitle, rem, calTitle, cal, csvTitle, csv);
  else more.append(remTitle, rem, calTitle, cal, csvTitle, csv);
})();
