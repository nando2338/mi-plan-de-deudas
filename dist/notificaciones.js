/* Notificaciones push (versión 1.4) y archivo de calendario (.ics).
   - El permiso del navegador se pide SOLO desde el botón "Activar notificaciones".
   - Los recordatorios en segundo plano los envía el servidor a partir de las deudas
     sincronizadas con la cuenta: requieren una cuenta con sesión iniciada.
   - Nunca escribe en la consola datos financieros, suscripciones ni claves. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MPDDPush = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  // "1" while this device has a push subscription saved in the account.
  const DEVICE_KEY = "mpdd-push-device-v1";
  const AVISOS_OPT = "mpdd-foreground-notices-enabled-v1";
  // 1.9: "1" si en este navegador se activaron las notificaciones; sobrevive al cierre de sesión.
  const WANTED_KEY = "mpdd-push-wanted-v1";
  const JOURNAL = "nando-restore-journal-v1";

  /* ---------------- environment ---------------- */
  function isIOS(win) {
    const nav = (win && win.navigator) || {};
    const ua = String(nav.userAgent || "");
    // iPadOS 13+ reports itself as a Mac with touch.
    return /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && Number(nav.maxTouchPoints) > 1);
  }
  function isStandalone(win) {
    try {
      if (win.navigator && win.navigator.standalone === true) return true;
      return !!(win.matchMedia && win.matchMedia("(display-mode: standalone)").matches);
    } catch (_) {
      return false;
    }
  }
  /* "iosInstall" | "unsupported" | "denied" | "ok" */
  function detect(win) {
    win = win || root;
    if (isIOS(win) && !isStandalone(win)) return "iosInstall";
    const nav = win.navigator || {};
    if (!win.isSecureContext || !nav.serviceWorker || !win.PushManager || !win.Notification || typeof win.Notification.requestPermission !== "function") return "unsupported";
    if (win.Notification.permission === "denied") return "denied";
    return "ok";
  }
  function locked(win) {
    try {
      return win.localStorage.getItem(JOURNAL) !== null;
    } catch (_) {
      return true;
    }
  }
  function signedIn(win) {
    try {
      return !!(win.MPDDCloud && win.MPDDCloud.status().userId);
    } catch (_) {
      return false;
    }
  }
  function deviceActive(win) {
    win = win || root;
    try {
      return win.localStorage.getItem(DEVICE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function setDevice(win, on) {
    try {
      if (on) win.localStorage.setItem(DEVICE_KEY, "1");
      else win.localStorage.removeItem(DEVICE_KEY);
    } catch (_) {}
  }
  function askAccount(win) {
    win = win || root;
    if (win.MPDDAccount && typeof win.MPDDAccount.ask === "function") {
      try {
        // ask() returns false when it doesn't open anything (accounts off): go to Más.
        if (win.MPDDAccount.ask("notifications") !== false) return;
      } catch (_) {}
    }
    if (typeof win.MPDDNavigate === "function") win.MPDDNavigate("more");
    const a = win.document && win.document.getElementById("account-title");
    if (a && a.scrollIntoView) a.scrollIntoView({ block: "start" });
  }
  function b64ToBytes(s) {
    const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function sameKey(a, b) {
    if (!a || !b) return false;
    const x = new Uint8Array(a),
      y = b;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  function requestPermission(win) {
    // Older Safari only supports the callback form.
    return new Promise((resolve) => {
      let done = false;
      const finish = (p) => {
        if (!done) {
          done = true;
          resolve(p);
        }
      };
      try {
        const p = win.Notification.requestPermission(finish);
        if (p && typeof p.then === "function") p.then(finish, () => finish("default"));
      } catch (_) {
        finish("default");
      }
    });
  }
  async function registration(win) {
    const sw = win.navigator.serviceWorker;
    let reg = null;
    try {
      reg = await sw.getRegistration();
    } catch (_) {}
    if (reg && reg.pushManager) return reg;
    try {
      reg = await Promise.race([sw.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
    } catch (_) {
      reg = null;
    }
    return reg && reg.pushManager ? reg : null;
  }
  function timeZone() {
    try {
      return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC").slice(0, 64);
    } catch (_) {
      return "UTC";
    }
  }
  function readAvisos(win) {
    const S = win.MPDDSchedule;
    return S ? S.readAvisos(win.localStorage) : { enabled: false, time: "08:00", timeSet: false, daysBefore: 3 };
  }

  /* ---------------- actions ---------------- */
  /* Settings row for push_settings, from the local preferences. */
  function settingsRow(win, overrides) {
    const cfg = readAvisos(win);
    const o = overrides || {};
    return {
      enabled: typeof o.enabled === "boolean" ? o.enabled : cfg.enabled,
      days_before: cfg.daysBefore,
      send_time: cfg.time,
      tz: timeZone(),
      lang: win.document && win.document.documentElement.lang === "en" ? "en" : "es",
    };
  }
  async function syncSettings(win, overrides) {
    win = win || root;
    if (!signedIn(win) || !win.MPDDCloud.pushSaveSettings) return { ok: false, error: "account" };
    return win.MPDDCloud.pushSaveSettings(settingsRow(win, overrides));
  }
  async function activate(win) {
    win = win || root;
    const state = detect(win);
    if (state !== "ok") return { ok: false, reason: state };
    if (!signedIn(win)) {
      askAccount(win);
      return { ok: false, reason: "account" };
    }
    if (locked(win)) return { ok: false, reason: "locked" };
    let permission = win.Notification.permission;
    if (permission !== "granted") permission = await requestPermission(win);
    if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
    const cloud = win.MPDDCloud;
    const reg = await registration(win);
    if (!reg) return { ok: false, reason: "noWorker" };
    const key = await cloud.pushPublicKey();
    if (!key.ok) return { ok: false, reason: key.error || "server" };
    let sub = null;
    try {
      const appKey = b64ToBytes(key.publicKey);
      sub = await reg.pushManager.getSubscription();
      // A subscription made with another server key cannot receive our messages.
      const old = sub && sub.options && sub.options.applicationServerKey;
      if (sub && old && !sameKey(old, appKey)) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
    } catch (e) {
      return { ok: false, reason: win.Notification.permission === "denied" ? "denied" : "subscribe" };
    }
    const saved = await cloud.pushSaveSubscription(sub);
    if (!saved.ok) return { ok: false, reason: saved.error || "server" };
    setDevice(win, true);
    setWanted(win, true);
    try {
      win.localStorage.setItem(AVISOS_OPT, "true");
    } catch (_) {}
    const s = await syncSettings(win, { enabled: true });
    return { ok: true, settingsSaved: !!s.ok };
  }
  function setWanted(win, on) {
    try {
      if (on) win.localStorage.setItem(WANTED_KEY, "1");
      else win.localStorage.removeItem(WANTED_KEY);
    } catch (_) {}
  }
  function wanted(win) {
    try {
      return (win || root).localStorage.getItem(WANTED_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  /* 1.9: al iniciar sesión o abrir la app con sesión, vuelve a asociar la suscripción de este
     navegador a la cuenta activa. No pide permiso: solo actúa si el permiso ya está concedido y
     existe una suscripción (o si el usuario la había activado y el navegador la perdió). */
  let restoring = false;
  async function restore(win) {
    win = win || root;
    if (restoring) return { ok: false, reason: "busy" };
    restoring = true;
    {
      try {
        if (detect(win) !== "ok" || !signedIn(win) || locked(win)) return { ok: false, reason: "skip" };
        if (win.Notification.permission !== "granted") return { ok: false, reason: "permission" };
        const reg = await registration(win);
        if (!reg) return { ok: false, reason: "noWorker" };
        let sub = await reg.pushManager.getSubscription();
        if (!sub && !wanted(win)) return { ok: false, reason: "noSubscription" };
        const cloud = win.MPDDCloud;
        if (!sub) {
          const key = await cloud.pushPublicKey();
          if (!key.ok) return { ok: false, reason: key.error || "server" };
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key.publicKey) });
        }
        const saved = await cloud.pushSaveSubscription(sub);
        if (!saved.ok) return { ok: false, reason: saved.error || "server" };
        setDevice(win, true);
        setWanted(win, true);
        try {
          win.localStorage.setItem(AVISOS_OPT, "true");
        } catch (_) {}
        const st = await syncSettings(win, { enabled: true });
        return { ok: true, restored: true, settingsSaved: !!st.ok };
      } catch (_) {
        return { ok: false, reason: "error" };
      } finally {
        restoring = false;
      }
    }
  }
  /* Stops push on this device: removes its row, then the browser subscription. */
  async function deactivate(win) {
    win = win || root;
    let ok = true;
    try {
      const nav = win.navigator || {};
      const reg = nav.serviceWorker ? await nav.serviceWorker.getRegistration() : null;
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        if (signedIn(win) && win.MPDDCloud.pushDeleteSubscription) {
          const r = await win.MPDDCloud.pushDeleteSubscription(sub.endpoint);
          ok = !!r.ok;
        }
        await sub.unsubscribe();
      }
    } catch (_) {
      ok = false;
    }
    setDevice(win, false);
    setWanted(win, false);
    return { ok };
  }
  async function sendTest(win) {
    win = win || root;
    if (!signedIn(win)) {
      askAccount(win);
      return { ok: false, error: "account" };
    }
    return win.MPDDCloud.pushTest();
  }

  /* ---------------- calendar file (.ics, RFC 5545) ---------------- */
  const pad = (n) => String(n).padStart(2, "0");
  function ymd(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function monthDue(y, m, day) {
    const max = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y + "-" + pad(m) + "-" + pad(Math.min(day, max));
  }
  function addDays(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.getUTCFullYear() + "-" + pad(x.getUTCMonth() + 1) + "-" + pad(x.getUTCDate());
  }
  function dueDay(debt) {
    const n = Number(debt && debt.due);
    return debt && debt.due !== "" && debt.due !== null && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  }
  function minPayment(debt) {
    const n = Number(debt && debt.minPayment);
    return debt && debt.minPayment !== "" && debt.minPayment !== null && Number.isFinite(n) && n > 0 ? n : null;
  }
  /* First due date on or after today (the day is clamped to short months). */
  function firstDue(day, today) {
    const [y, m] = today.split("-").map(Number);
    const d = monthDue(y, m, day);
    if (d >= today) return d;
    return m === 12 ? monthDue(y + 1, 1, day) : monthDue(y, m + 1, day);
  }
  /* Days 29–31 must still fall in months that lack them (on the last day). */
  function rrule(day) {
    if (day <= 28) return "FREQ=MONTHLY;BYMONTHDAY=" + day;
    if (day === 31) return "FREQ=MONTHLY;BYMONTHDAY=-1";
    const days = [];
    for (let d = 28; d <= day; d++) days.push(d);
    return "FREQ=MONTHLY;BYMONTHDAY=" + days.join(",") + ";BYSETPOS=-1";
  }
  function icsEscape(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }
  function octets(ch) {
    const cp = ch.codePointAt(0);
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  /* Lines longer than 75 octets continue on the next line after one space (never splits a character). */
  function fold(line) {
    const parts = [];
    let cur = "",
      size = 0;
    for (const ch of line) {
      const n = octets(ch);
      if (size + n > 75) {
        parts.push(cur);
        cur = " ";
        size = 1;
      }
      cur += ch;
      size += n;
    }
    parts.push(cur);
    return parts.join("\r\n");
  }
  function stamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  function fallbackMoney(amount, currency) {
    return String(amount) + " " + String(currency || "");
  }
  /* options: { today: "YYYY-MM-DD", now: Date, lang: "es"|"en", format(amount, currency) } */
  function buildICS(debts, options) {
    const o = options || {};
    const now = o.now instanceof Date ? o.now : new Date();
    const today = o.today || ymd(now);
    const en = o.lang === "en";
    const format = typeof o.format === "function" ? o.format : typeof root.formatMoney === "function" ? root.formatMoney : fallbackMoney;
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SolviPath//Pagos 1.9//" + (en ? "EN" : "ES"), "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsEscape(en ? "My payments" : "Mis pagos")];
    const used = new Set();
    let count = 0;
    (Array.isArray(debts) ? debts : []).forEach((debt, i) => {
      const day = dueDay(debt);
      if (!day) return;
      const balance = Number(debt.balance);
      if (Number.isFinite(balance) && balance <= 0) return; // already paid off
      const name = String(debt.name || "").trim() || (en ? "Debt" : "Deuda");
      let id = String(debt.id == null ? "" : debt.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "deuda-" + (i + 1);
      while (used.has(id)) id += "-" + (i + 1);
      used.add(id);
      const start = firstDue(day, today);
      const min = minPayment(debt);
      const amount = min === null ? (en ? "to be defined" : "por definir") : format(min, debt.currency);
      const description = (en ? "Minimum payment: " : "Pago mínimo: ") + amount + "\n" + (en ? "Confirm the date with your lender." : "Confirma la fecha con tu entidad.");
      lines.push(
        "BEGIN:VEVENT",
        "UID:pago-" + id + "@solvipath.com",
        "DTSTAMP:" + stamp(now),
        "DTSTART;VALUE=DATE:" + start.replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + addDays(start, 1).replace(/-/g, ""),
        "RRULE:" + rrule(day),
        "SUMMARY:" + icsEscape((en ? "Payment: " : "Pago: ") + name),
        "DESCRIPTION:" + icsEscape(description),
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:" + icsEscape((en ? "Payment tomorrow: " : "Mañana vence: ") + name),
        "TRIGGER:-P1D",
        "END:VALARM",
        "END:VEVENT"
      );
      count++;
    });
    count += gastoEvents(lines, o, { now, today, en, format, used });
    lines.push("END:VCALENDAR");
    return { text: lines.map(fold).join("\r\n") + "\r\n", count };
  }
  /* ---------- 1.8 Gastos fijos: one recurring event per expense ----------
     Monthly / quarterly / semiannual / annual = RRULE FREQ=MONTHLY with INTERVAL 1/3/6/12,
     starting on the next due date (days 29–31 handled like the debts), alarm the day before.
     options.gastos: list to use; by default the active ones of MPDDGastos. */
  const GASTO_STEP = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const GASTO_FREQ = { monthly: ["Mensual", "Monthly"], quarterly: ["Trimestral", "Quarterly"], semiannual: ["Semestral", "Every 6 months"], annual: ["Anual", "Yearly"] };
  function gastoFirstDue(g, today) {
    const step = GASTO_STEP[g.frequency] || 1;
    const anchor = Number(g.month);
    const [y, m] = today.split("-").map(Number);
    for (let k = 0; k <= 12; k++) {
      const n = y * 12 + m - 1 + k;
      const year = Math.floor(n / 12),
        month = (n % 12) + 1;
      if (step > 1 && (((month - anchor) % step) + step) % step !== 0) continue;
      const d = monthDue(year, month, Number(g.day));
      if (d >= today) return d;
    }
    return null;
  }
  function gastoEvents(lines, o, ctx) {
    let list = o.gastos;
    if (list === undefined) {
      try {
        list = root.MPDDGastos ? root.MPDDGastos.list() : [];
      } catch (_) {
        list = [];
      }
    }
    let count = 0;
    (Array.isArray(list) ? list : []).forEach((g, i) => {
      if (!g || g.deleted) return;
      const step = GASTO_STEP[g.frequency];
      const day = Number(g.day);
      if (!step || !Number.isInteger(day) || day < 1 || day > 31) return;
      if (step > 1 && !(Number(g.month) >= 1 && Number(g.month) <= 12)) return;
      const start = gastoFirstDue(g, ctx.today);
      if (!start) return;
      const name = String(g.name || "").trim() || (ctx.en ? "Fixed expense" : "Gasto fijo");
      let id = "gasto-" + (String(g.id == null ? "" : g.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || String(i + 1));
      while (ctx.used.has(id)) id += "-" + (i + 1);
      ctx.used.add(id);
      const freq = GASTO_FREQ[g.frequency][ctx.en ? 1 : 0];
      const description = (ctx.en ? "Amount: " : "Monto: ") + ctx.format(g.amount, g.currency) + "\n" + (ctx.en ? "Frequency: " : "Frecuencia: ") + freq;
      lines.push(
        "BEGIN:VEVENT",
        "UID:" + id + "@solvipath.com",
        "DTSTAMP:" + stamp(ctx.now),
        "DTSTART;VALUE=DATE:" + start.replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + addDays(start, 1).replace(/-/g, ""),
        "RRULE:" + rrule(day).replace(/^FREQ=MONTHLY/, "FREQ=MONTHLY;INTERVAL=" + step),
        "SUMMARY:" + icsEscape((ctx.en ? "Fixed expense: " : "Gasto fijo: ") + name),
        "DESCRIPTION:" + icsEscape(description),
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:" + icsEscape((ctx.en ? "Due tomorrow: " : "Mañana vence: ") + name),
        "TRIGGER:-P1D",
        "END:VALARM",
        "END:VEVENT"
      );
      count++;
    });
    return count;
  }
  /* ---------- fin 1.8 ---------- */
  /* Downloads mis-pagos.ics (on iPhone, text/calendar opens the Calendar app). */
  function downloadICS(win, text) {
    win = win || root;
    const blob = new win.Blob([text], { type: "text/calendar;charset=utf-8" });
    const url = win.URL.createObjectURL(blob);
    const a = win.document.createElement("a");
    a.href = url;
    a.download = "mis-pagos.ics";
    a.rel = "noopener";
    a.hidden = true;
    win.document.body.append(a);
    a.click();
    setTimeout(() => {
      a.remove();
      win.URL.revokeObjectURL(url);
    }, 30000);
  }

  return { DEVICE_KEY, WANTED_KEY, restore, wanted, setWanted, detect, isIOS, isStandalone, deviceActive, setDevice, askAccount, activate, deactivate, sendTest, syncSettings, settingsRow, b64ToBytes, buildICS, downloadICS, icsEscape, fold, rrule, firstDue };
});
