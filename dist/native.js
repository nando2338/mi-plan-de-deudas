/* SolviPath 3.0: comportamiento propio de la app de Android (Capacitor).
   En la web este archivo no hace nada: sale de inmediato si no está dentro de la app.
   Plugins usados sin empaquetador mediante el puente de Capacitor: App, Browser, LocalNotifications. */
(function () {
  "use strict";
  const cap = window.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  window.MPDDNative = { isNative };
  if (!isNative) return;

  const doc = document;
  doc.documentElement.classList.add("native-app");
  const SITE = "https://www.solvipath.com";
  const LEGAL = ["/privacidad.html", "/terminos.html", "/eliminar-cuenta.html"];

  function plugin(name) {
    try {
      return (cap.Plugins && cap.Plugins[name]) || (cap.registerPlugin ? cap.registerPlugin(name) : null);
    } catch (_) {
      return null;
    }
  }
  const App = plugin("App");
  const Browser = plugin("Browser");
  const LN = plugin("LocalNotifications");
  const SystemBars = plugin("SystemBars");
  const lang = () => (doc.documentElement.lang === "en" ? "en" : "es");

  /* ---- Áreas seguras: el contenido se dibuja bajo las barras del sistema y native.css agrega el margen ---- */
  try {
    const m = doc.querySelector('meta[name="viewport"]');
    if (m && !/viewport-fit/.test(m.content)) m.content += ",viewport-fit=cover";
  } catch (_) {}
  try {
    if (SystemBars) {
      SystemBars.setStyle({ style: "DARK", bar: "StatusBar" }).catch(() => {}); // encabezado oscuro: íconos claros
      SystemBars.setStyle({ style: "LIGHT", bar: "NavigationBar" }).catch(() => {}); // barra inferior clara: íconos oscuros
    }
  } catch (_) {}

  /* ---- Sin service worker dentro de la app: Capacitor ya sirve los archivos locales ---- */
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches && caches.keys) caches.keys().then((ks) => ks.filter((k) => /^mpd-cache-/.test(k)).forEach((k) => caches.delete(k))).catch(() => {});
  } catch (_) {}

  /* ---- Enlaces externos: se abren en el navegador, no dentro de la app ---- */
  function externalUrl(href) {
    let u;
    try {
      u = new URL(href, location.href);
    } catch (_) {
      return null;
    }
    if (u.protocol === "mailto:" || u.protocol === "tel:") return u.href;
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.origin === location.origin) return LEGAL.includes(u.pathname) ? SITE + u.pathname + u.search + u.hash : null;
    return u.href;
  }
  function openExternal(url) {
    if (Browser && /^https?:/.test(url)) return Browser.open({ url }).catch(() => {});
    try {
      window.open(url, "_system");
    } catch (_) {}
  }
  doc.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("download") || (a.href || "").startsWith("blob:")) return;
      const url = externalUrl(a.getAttribute("href"));
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      openExternal(url);
    },
    true
  );
  const nativeOpen = window.open;
  window.open = function (url, target, features) {
    const ext = url ? externalUrl(String(url)) : null;
    if (ext) {
      openExternal(ext);
      return null;
    }
    return nativeOpen ? nativeOpen.call(window, url, target, features) : null;
  };

  /* ---- Botón «atrás»: cierra diálogos y menús; en la pantalla principal sale de la app ---- */
  function backPressed() {
    const dlg = [...doc.querySelectorAll("dialog[open]")].pop();
    if (dlg) {
      const ev = new Event("cancel", { cancelable: true });
      dlg.dispatchEvent(ev);
      if (!ev.defaultPrevented && dlg.open) {
        if (typeof dlg.close === "function") dlg.close();
        else dlg.removeAttribute("open");
      }
      return;
    }
    const menu = doc.getElementById("account-menu");
    if (menu && !menu.hidden) {
      doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (!menu.hidden) menu.hidden = true;
      return;
    }
    const home = doc.querySelector('.bottom-nav [data-target]');
    const current = doc.querySelector('.bottom-nav [aria-current="page"], .bottom-nav .active, .bottom-nav [aria-selected="true"]');
    if (home && current && current !== home && typeof window.MPDDNavigate === "function") {
      window.MPDDNavigate(home.dataset.target);
      return;
    }
    if (App && App.exitApp) App.exitApp();
  }
  if (App) {
    App.addListener("backButton", backPressed);

    /* ---- Enlaces de los correos (confirmar cuenta y recuperar contraseña) ---- */
    const onUrl = (url) => {
      const u = String(url || "");
      if (!/^com\.solvipath\.app:\/\/auth\/callback/.test(u) && !/^https:\/\/www\.solvipath\.com\/auth\/callback/.test(u)) return;
      if (Browser && Browser.close) Browser.close().catch(() => {});
      const run = () => (window.MPDDCloud && window.MPDDCloud.handleAuthUrl ? window.MPDDCloud.handleAuthUrl(u) : null);
      run();
    };
    App.addListener("appUrlOpen", (e) => onUrl(e && e.url));
    // Si la app se abrió desde el enlace (estaba cerrada), lo procesa al iniciar.
    if (App.getLaunchUrl) App.getLaunchUrl().then((r) => r && r.url && onUrl(r.url)).catch(() => {});
    App.addListener("resume", () => setTimeout(() => rescheduleSoon(), 0));
  }

  /* ---- Notificaciones locales: recordatorios de pago (funcionan con la app cerrada) ---- */
  const CHANNEL = "recordatorios-pago";
  const OPT_KEY = "mpdd-foreground-notices-enabled-v1";
  const HORIZON_DAYS = 45;
  const T = {
    es: { title: "Avisos de pago en este teléfono", intro: "SolviPath te avisa de tus pagos aunque la app esté cerrada. Se programan en el teléfono y no necesitan conexión.", enable: "Activar avisos", disable: "Desactivar avisos", time: "Hora del aviso", days: "Avisar con anticipación", d1: "1 día antes", d3: "3 días antes", d7: "7 días antes", on: "Avisos activados.", off: "Avisos desactivados.", denied: "El permiso de notificaciones está desactivado. Actívalo en los ajustes del teléfono para recibir avisos.", err: "No se pudieron programar los avisos.", channel: "Recordatorios de pago", chDesc: "Avisos de pagos y gastos fijos próximos", nTitle: "SolviPath", count: (n) => "Avisos programados: " + n + "." },
    en: { title: "Payment alerts on this phone", intro: "SolviPath alerts you about your payments even when the app is closed. They are scheduled on the phone and need no connection.", enable: "Turn on alerts", disable: "Turn off alerts", time: "Alert time", days: "Notify in advance", d1: "1 day before", d3: "3 days before", d7: "7 days before", on: "Alerts turned on.", off: "Alerts turned off.", denied: "Notification permission is off. Turn it on in the phone settings to receive alerts.", err: "Alerts could not be scheduled.", channel: "Payment reminders", chDesc: "Alerts for upcoming payments and fixed expenses", nTitle: "SolviPath", count: (n) => "Scheduled alerts: " + n + "." },
  };
  const tx = () => T[lang()];
  const S = () => window.MPDDSchedule;
  const enabled = () => {
    try {
      return localStorage.getItem(OPT_KEY) === "true";
    } catch (_) {
      return false;
    }
  };
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h) % 2000000000;
  }
  function collect() {
    const R = window.DebtReminders;
    if (!R || !window.MPDDApp || window.MPDDApp.isLocked()) return [];
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = R.dateInZone(new Date(), zone);
    let prefs = {};
    try {
      const raw = localStorage.getItem("nando-recordatorios-v1");
      prefs = raw === null ? {} : JSON.parse(raw);
      if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) prefs = {};
    } catch (_) {
      prefs = {};
    }
    const cfg = S() ? S().readAvisos(localStorage) : { time: "08:00", daysBefore: 3 };
    const out = [];
    for (const debt of window.MPDDApp.debts()) {
      const p = Object.prototype.hasOwnProperty.call(prefs, String(debt.id)) && prefs[String(debt.id)] && typeof prefs[String(debt.id)] === "object" ? prefs[String(debt.id)] : {};
      const before = Number.isInteger(p.beforeDays) ? p.beforeDays : cfg.daysBefore;
      let evs = [];
      try {
        evs = R.schedule([{ id: String(debt.id), name: String(debt.name), cutoffDay: p.cutoffDay, paymentDay: p.paymentDay ?? debt.due ?? null, cutoffEnabled: p.cutoffEnabled, paymentEnabled: p.paymentEnabled, paidThrough: p.paidThrough }], { today, offsets: p.sameDay === false ? [before] : [before, 0], daysAhead: HORIZON_DAYS, locale: lang() });
      } catch (_) {
        evs = [];
      }
      for (const e of evs) out.push({ key: e.key, date: e.notifyDate, body: R.message(e, lang()) });
    }
    // Gastos fijos: se evalúa cada día del horizonte con las mismas reglas de la app.
    try {
      if (window.MPDDGastos && window.MPDDGastosCore) {
        const list = window.MPDDGastos.list();
        for (let i = 0; i <= HORIZON_DAYS; i++) {
          const day = R.shift(today, i);
          for (const g of window.MPDDGastosCore.reminders(list, { today: day, daysBefore: cfg.daysBefore })) out.push({ key: g.key, date: day, body: window.MPDDGastosCore.reminderMessage(g, lang()) });
        }
      }
    } catch (_) {}
    return out;
  }
  function at(date, hhmm) {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = String(hhmm || "08:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }
  async function ensureChannel() {
    if (LN && LN.createChannel) await LN.createChannel({ id: CHANNEL, name: tx().channel, description: tx().chDesc, importance: 4, visibility: 1, vibration: true });
  }
  async function permission(request) {
    if (!LN) return "denied";
    let p = await LN.checkPermissions();
    if (p.display === "prompt" || p.display === "prompt-with-rationale") {
      if (!request) return p.display;
      p = await LN.requestPermissions();
    }
    return p.display;
  }
  let busy = false,
    again = false,
    lastCount = 0;
  async function reschedule() {
    if (!LN) return 0;
    if (busy) {
      again = true;
      return lastCount;
    }
    busy = true;
    try {
      const pending = await LN.getPending();
      if (pending && pending.notifications && pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      if (!enabled() || (await permission(false)) !== "granted") {
        lastCount = 0;
        return 0;
      }
      await ensureChannel();
      const cfg = S() ? S().readAvisos(localStorage) : { time: "08:00" };
      const now = Date.now();
      const seen = new Set();
      const list = [];
      for (const e of collect()) {
        if (seen.has(e.key)) continue;
        seen.add(e.key);
        const when = at(e.date, cfg.time);
        if (when.getTime() <= now) continue;
        list.push({ id: hash(e.key), title: tx().nTitle, body: e.body, channelId: CHANNEL, schedule: { at: when, allowWhileIdle: true }, smallIcon: "ic_stat_solvipath" });
      }
      list.sort((a, b) => a.schedule.at - b.schedule.at);
      const batch = list.slice(0, 60); // Android limita las alarmas por app; se reprograma al abrir la app.
      if (batch.length) await LN.schedule({ notifications: batch });
      lastCount = batch.length;
      return lastCount;
    } finally {
      busy = false;
      if (again) {
        again = false;
        rescheduleSoon();
      }
    }
  }
  let timer = null;
  function rescheduleSoon() {
    clearTimeout(timer);
    timer = setTimeout(() => reschedule().then(refreshStatus).catch(() => {}), 1500);
  }
  window.MPDDNative.reschedule = reschedule;

  /* ---- Bloque de ajustes (reemplaza al de avisos web, que no aplica dentro de la app) ---- */
  let statusEl = null;
  function refreshStatus() {
    if (statusEl && enabled()) statusEl.textContent = tx().on + " " + tx().count(lastCount);
  }
  function buildBlock() {
    const title = doc.getElementById("notificaciones-title");
    if (!title || doc.getElementById("native-reminders")) return !!doc.getElementById("native-reminders");
    const web = title.nextElementSibling;
    if (web) web.hidden = true;
    const box = doc.createElement("div");
    box.id = "native-reminders";
    box.className = "settings-block native-reminders";
    const intro = doc.createElement("p");
    intro.className = "label";
    const row1 = doc.createElement("div");
    row1.className = "row";
    const on = doc.createElement("button");
    on.type = "button";
    const off = doc.createElement("button");
    off.type = "button";
    off.className = "ghost";
    row1.append(on, off);
    const row2 = doc.createElement("div");
    row2.className = "row";
    const tl = doc.createElement("label");
    tl.htmlFor = "native-time";
    const time = doc.createElement("input");
    time.type = "time";
    time.id = "native-time";
    const dl = doc.createElement("label");
    dl.htmlFor = "native-days";
    const days = doc.createElement("select");
    days.id = "native-days";
    for (const n of [1, 3, 7]) {
      const o = doc.createElement("option");
      o.value = String(n);
      days.append(o);
    }
    row2.append(tl, time, dl, days);
    statusEl = doc.createElement("p");
    statusEl.className = "status";
    statusEl.setAttribute("role", "status");
    box.append(intro, row1, row2, statusEl);
    title.after(box);
    function text() {
      const t = tx();
      title.textContent = t.title;
      intro.textContent = t.intro;
      on.textContent = t.enable;
      off.textContent = t.disable;
      tl.textContent = t.time;
      dl.textContent = t.days;
      [t.d1, t.d3, t.d7].forEach((s, i) => (days.options[i].textContent = s));
    }
    function load() {
      const cfg = S() ? S().readAvisos(localStorage) : { time: "08:00", daysBefore: 3 };
      time.value = cfg.time;
      days.value = String(cfg.daysBefore);
    }
    function save() {
      const v = { daysBefore: Number(days.value) };
      if (time.value) v.time = time.value;
      try {
        localStorage.setItem(S().AVISOS_KEY, JSON.stringify(v));
        doc.dispatchEvent(new Event("mpdd:avisoschange"));
      } catch (_) {}
    }
    text();
    load();
    if (enabled()) rescheduleSoon();
    on.addEventListener("click", async () => {
      try {
        const p = await permission(true); // el permiso se pide solo aquí, después de que la persona toca el botón
        if (p !== "granted") {
          statusEl.textContent = tx().denied;
          return;
        }
        localStorage.setItem(OPT_KEY, "true");
        save();
        const n = await reschedule();
        statusEl.textContent = tx().on + " " + tx().count(n);
      } catch (_) {
        statusEl.textContent = tx().err;
      }
    });
    off.addEventListener("click", async () => {
      try {
        localStorage.setItem(OPT_KEY, "false");
        await reschedule();
        statusEl.textContent = tx().off;
      } catch (_) {
        statusEl.textContent = tx().err;
      }
    });
    const change = () => {
      save();
      if (enabled()) rescheduleSoon();
    };
    time.addEventListener("change", change);
    days.addEventListener("change", change);
    doc.addEventListener("deudas:languagechange", () => {
      text();
      if (enabled()) rescheduleSoon();
    });
    return true;
  }
  let tries = 0;
  const iv = setInterval(() => {
    if (buildBlock() || ++tries > 20) clearInterval(iv);
  }, 400);

  // Reprograma cuando cambian las deudas, los pagos o los gastos.
  for (const ev of ["mpdd:localchange", "mpdd:gastoschange", "mpdd:avisoschange", "storage"]) doc.addEventListener(ev, () => enabled() && rescheduleSoon());
  window.addEventListener("storage", () => enabled() && rescheduleSoon());
  if (enabled()) setTimeout(rescheduleSoon, 3000);
})();
