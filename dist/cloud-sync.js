/* Optional Supabase account + local-first sync.
   - Without a configured project, or without a session, this file makes NO
     network request and never loads supabase-js.
   - localStorage stays the working copy. Cloud changes are applied through
     window.MPDDApp so the existing validation and recovery copies are used.
   - Never logs financial data or tokens. */
(function () {
  "use strict";
  const CFG = window.MPDD_CONFIG || {};
  const Core = window.MPDDCloudCore;
  const LIB_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";
  const LIB_SRI = "sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK";
  const KEY = "nando-deudas-v1",
    JOURNAL = "nando-restore-journal-v1",
    STATE_KEY = "mpdd-cloud-state-v1",
    RESET_KEY = "mpdd-cloud-reset-v1",
    ACTIVE_KEY = "mpdd-cloud-active-v1",
    PREBACKUP_KEY = "mpdd-cloud-prebackup-v1";
  const PREFIXES_TO_WIPE = ["nando-deudas-recovery-v1:", "nando-prefs-recovery-v1:", "mpdd-cloud-", "sb-"];
  const BAD_DATA_CODES = new Set(["23514", "22P02", "22023", "22003", "23502", "22007", "22008", "54000"]);
  const nowISO = () => new Date().toISOString();
  const BAD_IDS = new Set(["__proto__", "prototype", "constructor"]);
  const ls = window.localStorage;

  /* ---------------- configuration ---------------- */
  function configStatus() {
    const url = String(CFG.supabaseUrl || ""),
      key = String(CFG.supabaseKey || "");
    if (!url || !key || /TU-PROYECTO|TU_CLAVE/i.test(url + key)) return "placeholder";
    if (/^sb_secret_/i.test(key)) return "secret";
    const parts = key.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload && payload.role && payload.role !== "anon") return "secret";
      } catch (_) {
        return "invalid";
      }
    }
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.pathname.replace(/\/$/, "") !== "") return "invalid";
    } catch (_) {
      return "invalid";
    }
    return "ok";
  }

  /* ---------------- status + events ---------------- */
  const status = {
    state: "disabled", // disabled | signedOut | starting | syncing | synced | offline | error | paused | needsChoice
    config: configStatus(),
    email: null,
    userId: null,
    pending: 0,
    lastSync: null,
    error: null,
    recovery: false,
    choice: null,
    notices: [],
    settingsChanged: false,
    unsyncable: [],
  };
  const listeners = new Set();
  function emit() {
    for (const fn of listeners) {
      try {
        fn(status);
      } catch (_) {}
    }
  }
  function setState(state, extra) {
    status.state = state;
    if (extra) Object.assign(status, extra);
    emit();
  }

  /* ---------------- local state ---------------- */
  function readState() {
    try {
      const s = JSON.parse(ls.getItem(STATE_KEY) || "null");
      if (s && typeof s === "object" && s.debts && s.settings) return s;
    } catch (_) {}
    return null;
  }
  function writeState(s) {
    try {
      ls.setItem(STATE_KEY, JSON.stringify(s));
      return true;
    } catch (_) {
      return false;
    }
  }
  function locked() {
    try {
      if (ls.getItem(JOURNAL) !== null) return true;
    } catch (_) {
      return true;
    }
    return !window.MPDDApp || window.MPDDApp.isLocked();
  }
  function readLocalDebts() {
    const saved = window.DebtStorage.read(ls);
    if (!saved.ok) throw codeError("localData");
    return saved;
  }
  function codeError(code, cause) {
    const e = new Error(code);
    e.code = code;
    if (cause) e.cause = cause;
    return e;
  }

  /* Detect local edits by comparing normalized hashes with what was last seen. */
  function scan(state) {
    const saved = readLocalDebts();
    const now = nowISO();
    const seen = new Set();
    for (const d of saved.debts) {
      const id = String(d.id);
      if (BAD_IDS.has(id)) continue;
      seen.add(id);
      const h = Core.hash(Core.toRemote(d));
      const st = (state.debts[id] = state.debts[id] || {});
      if (st.l !== h) {
        st.l = h;
        st.t = now;
      }
    }
    for (const [id, st] of Object.entries(state.debts))
      if (!seen.has(id) && st.l !== null) {
        st.l = null;
        st.t = now;
      }
    for (const k of Core.SETTINGS_KEYS) {
      const v = ls.getItem(k);
      const h = v === null ? null : Core.hash(v);
      const st = (state.settings[k] = state.settings[k] || {});
      if (st.l !== h) {
        st.l = h;
        st.t = now;
      }
    }
    return saved;
  }
  function pendingCount(state) {
    if (!state) return 0;
    let n = 0;
    for (const group of [state.debts, state.settings])
      for (const st of Object.values(group)) {
        const synced = Object.prototype.hasOwnProperty.call(st, "s") ? st.s : null;
        if ((st.l ?? null) !== synced) n++;
      }
    return n;
  }

  /* ---------------- supabase client (lazy) ---------------- */
  let libPromise = null,
    client = null,
    clientPromise = null;
  function loadLibrary() {
    if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve(window.supabase);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = LIB_URL;
      s.integrity = LIB_SRI;
      s.crossOrigin = "anonymous";
      s.referrerPolicy = "no-referrer";
      s.async = true;
      s.onload = () => (window.supabase && window.supabase.createClient ? resolve(window.supabase) : reject(codeError("network")));
      s.onerror = () => {
        libPromise = null;
        s.remove();
        reject(codeError("network"));
      };
      document.head.append(s);
    });
    return libPromise;
  }
  function getClient() {
    if (status.config !== "ok") return Promise.reject(codeError("config"));
    if (client) return Promise.resolve(client);
    if (clientPromise) return clientPromise;
    clientPromise = loadLibrary()
      .then((lib) => {
        client = lib.createClient(String(CFG.supabaseUrl).replace(/\/$/, ""), CFG.supabaseKey, {
          auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        client.auth.onAuthStateChange((event, session) => setTimeout(() => onAuth(event, session), 0));
        return client;
      })
      .catch((e) => {
        clientPromise = null;
        throw e;
      });
    return clientPromise;
  }

  /* ---------------- auth ---------------- */
  function cleanUrl() {
    try {
      const u = new URL(location.href);
      let changed = false;
      for (const p of ["code", "mpdd", "error", "error_code", "error_description"])
        if (u.searchParams.has(p)) {
          u.searchParams.delete(p);
          changed = true;
        }
      if (/access_token=|error_description=|refresh_token=/.test(u.hash)) {
        u.hash = "";
        changed = true;
      }
      if (changed) history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (_) {}
  }
  function urlHasAuth() {
    return /[?&](code|error_description)=/.test(location.search) || /(access_token|error_description)=/.test(location.hash) || /[?&]mpdd=recovery/.test(location.search);
  }
  function urlAuthError() {
    return /[?&#](error|error_description)=/.test(location.search + location.hash);
  }
  function redirectUrl(kind) {
    return location.origin + location.pathname + (kind ? "?mpdd=" + kind : "");
  }
  function onAuth(event, session) {
    if (event === "PASSWORD_RECOVERY") {
      status.recovery = true;
      cleanUrl();
    }
    if (session && session.user) {
      const changedUser = status.userId !== session.user.id;
      status.userId = session.user.id;
      status.email = session.user.email || null;
      try {
        ls.setItem(ACTIVE_KEY, "1");
      } catch (_) {}
      cleanUrl();
      // Same user again (late INITIAL_SESSION, SIGNED_IN on tab focus, token refresh): nothing to link.
      if (changedUser) afterSignIn();
      else emit();
    } else if (event === "INITIAL_SESSION" && hasActiveMarker()) {
      // The stored session may only need a refresh (offline, captive portal, server error):
      // boot() decides with getSession() whether it is really gone.
      if (navigator.onLine === false) setState("offline", { pending: pendingCount(readState()) });
    } else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION" || event === "NO_SESSION") {
      const wasSignedIn = !!status.userId;
      status.userId = status.email = null;
      status.recovery = false;
      status.choice = null;
      try {
        ls.removeItem(ACTIVE_KEY);
      } catch (_) {}
      cleanUrl();
      setState("signedOut", { error: wasSignedIn && !signingOut ? "sessionExpired" : status.error, pending: pendingCount(readState()) });
    }
  }
  let signingOut = false;
  function hasActiveMarker() {
    try {
      return ls.getItem(ACTIVE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function mapAuthError(e) {
    if (!e) return null;
    const code = String(e.code || ""),
      st = Number(e.status || 0),
      name = String(e.name || "");
    if (name === "AuthRetryableFetchError" || st === 0 || e.code === "network" || e instanceof TypeError) return "network";
    if (st === 429 || /rate_limit/.test(code)) return "rateLimit";
    if (code === "weak_password") return "weakPassword";
    if (code === "same_password") return "samePassword";
    return "generic";
  }
  function validEmail(email) {
    return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  async function authCall(fn) {
    if (status.config !== "ok") return { ok: false, error: "config" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    try {
      const c = await getClient();
      const res = await fn(c);
      if (res && res.error) return { ok: false, error: mapAuthError(res.error), data: res.data };
      return { ok: true, data: res && res.data };
    } catch (e) {
      return { ok: false, error: e.code === "network" ? "network" : mapAuthError(e) };
    }
  }
  const api = {};
  api.signUp = async (email, password, accepted) => {
    email = String(email || "").trim();
    if (!validEmail(email)) return { ok: false, error: "email" };
    if (String(password || "").length < 8) return { ok: false, error: "passwordLength" };
    if (accepted !== true) return { ok: false, error: "terms" };
    const r = await authCall((c) =>
      c.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl(), data: { terms_accepted_at: nowISO(), terms_version: "2026-11-14" } },
      }),
    );
    // Never reveal whether the email was already registered.
    if (!r.ok && r.error === "generic") return { ok: true, result: "checkEmail" };
    if (r.ok) return { ok: true, result: r.data && r.data.session ? "signedIn" : "checkEmail" };
    return r;
  };
  api.signIn = async (email, password) => {
    email = String(email || "").trim();
    if (!validEmail(email) || !password) return { ok: false, error: "credentials" };
    const r = await authCall((c) => c.auth.signInWithPassword({ email, password }));
    if (!r.ok && r.error === "generic") return { ok: false, error: "credentials" };
    return r;
  };
  api.magicLink = async (email) => {
    email = String(email || "").trim();
    if (!validEmail(email)) return { ok: false, error: "email" };
    const r = await authCall((c) => c.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectUrl() } }));
    if (!r.ok && r.error === "generic") return { ok: true, result: "checkEmail" };
    return r.ok ? { ok: true, result: "checkEmail" } : r;
  };
  api.resetPassword = async (email) => {
    email = String(email || "").trim();
    if (!validEmail(email)) return { ok: false, error: "email" };
    const r = await authCall((c) => c.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl("recovery") }));
    if (!r.ok && r.error === "generic") return { ok: true, result: "checkEmail" };
    return r.ok ? { ok: true, result: "checkEmail" } : r;
  };
  api.updatePassword = async (password) => {
    if (String(password || "").length < 8) return { ok: false, error: "passwordLength" };
    const r = await authCall((c) => c.auth.updateUser({ password }));
    if (r.ok) {
      status.recovery = false;
      emit();
    }
    return r;
  };
  api.google = async () => {
    if (CFG.googleEnabled !== true) return { ok: false, error: "googleDisabled" };
    return authCall((c) => c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl() } }));
  };

  /* ---------------- linking a device to an account ---------------- */
  function aliveRemoteDebts(pull) {
    return (pull.debts || []).filter((r) => r && !r.deleted);
  }
  function settingsMap(pull) {
    const m = new Map();
    const data = pull.settings && typeof pull.settings === "object" ? pull.settings : {};
    for (const k of Core.SETTINGS_KEYS)
      if (data[k] && typeof data[k] === "object") m.set(k, { value: typeof data[k].value === "string" ? data[k].value : null, updatedAt: data[k].updatedAt || null });
    return m;
  }
  let lastPull = null,
    linking = false;
  async function afterSignIn() {
    if (deleting) return;
    if (status.recovery) {
      emit();
      return;
    }
    const state = readState();
    if (state && state.userId === status.userId) {
      setState("syncing");
      return sync();
    }
    if (linking || status.state === "needsChoice") return;
    if (locked()) return setState("paused");
    linking = true;
    setState("starting");
    try {
      const pull = await rpc("mpdd_pull");
      lastPull = pull;
      const local = readLocalDebts().debts;
      const localSettings = ["deudas-budget-v1", "nando-recordatorios-v1"].filter((k) => ls.getItem(k) !== null).length;
      const remoteDebts = aliveRemoteDebts(pull).length;
      const rs = settingsMap(pull);
      const remoteSettings = ["deudas-budget-v1", "nando-recordatorios-v1"].filter((k) => rs.get(k) && rs.get(k).value !== null).length;
      if (!local.length && !localSettings) return resolveLink("cloud", true);
      const otherUser = !!(state && state.userId && state.userId !== status.userId);
      // The user deleted this account's cloud data from another device: ask before re-uploading.
      let afterReset = false;
      try {
        afterReset = ls.getItem(RESET_KEY) === String(status.userId);
      } catch (_) {}
      // 1.4: new or empty account + data on this device: upload without asking.
      // Nothing in the cloud is replaced, records are keyed by id (no duplicates),
      // and a pre-sync copy is still stored. Data last used with ANOTHER account
      // keeps the question so it is never uploaded to the wrong account silently.
      if (!remoteDebts && !remoteSettings && !otherUser && !afterReset) return resolveLink("upload", false);
      status.choice = {
        kind: remoteDebts || remoteSettings ? "both" : "upload",
        localDebts: local.length,
        localSettings,
        remoteDebts,
        remoteSettings,
        otherUser,
      };
      setState("needsChoice");
    } catch (e) {
      failure(e);
    } finally {
      linking = false;
    }
  }
  function storePreBackup(reason, pull) {
    let localText = null;
    try {
      const saved = readLocalDebts();
      localText = window.DebtBackupPlus.create(ls, saved.debts);
    } catch (_) {
      localText = ls.getItem(KEY);
    }
    const cloud = pull ? { version: 2, debts: aliveRemoteDebts(pull).map((r) => Core.fromRemote(r.id, r)), preferences: {} } : null;
    if (pull) for (const [k, v] of settingsMap(pull)) if (v.value !== null) cloud.preferences[k] = v.value;
    let list = [];
    try {
      list = JSON.parse(ls.getItem(PREBACKUP_KEY) || "[]");
      if (!Array.isArray(list)) list = [];
    } catch (_) {
      list = [];
    }
    list.unshift({ at: nowISO(), reason, local: localText, cloud: cloud ? JSON.stringify(cloud, null, 2) : null });
    list = list.slice(0, 3);
    try {
      ls.setItem(PREBACKUP_KEY, JSON.stringify(list));
    } catch (_) {
      // Not enough space: keep only the newest copy.
      try {
        ls.setItem(PREBACKUP_KEY, JSON.stringify(list.slice(0, 1)));
      } catch (__) {
        throw codeError("prebackup");
      }
    }
    status.hasPreBackup = true;
  }
  api.preBackups = () => {
    try {
      const list = JSON.parse(ls.getItem(PREBACKUP_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  };
  async function resolveLink(choice, automatic) {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    if (choice === "cancel") {
      status.choice = null;
      await api.signOut({ keepLocal: true });
      return { ok: true };
    }
    if (locked()) {
      setState("paused");
      return { ok: false, error: "locked" };
    }
    try {
      setState("syncing", { choice: null });
      const pull = await rpc("mpdd_pull");
      if (!automatic) storePreBackup(choice, pull);
      const state = { userId: status.userId, linkedAt: nowISO(), debts: {}, settings: {} };
      const saved = readLocalDebts();
      if (choice === "cloud") {
        const next = aliveRemoteDebts(pull).map((r) => Core.fromRemote(r.id, r));
        if (saved.debts.length || next.length) {
          if (!window.MPDDApp.replaceDebts(next)) throw codeError("apply");
        }
        const remote = settingsMap(pull);
        applySettings(remote, [...new Set([...remote.keys(), "deudas-budget-v1", "nando-recordatorios-v1"])]);
        if (!automatic) gastosReplace = true; // 1.8: "use the cloud copy" also for fixed expenses
      } else if (choice === "local") {
        if (!automatic) gastosKeepLocal = true; // 1.8: "keep this device's copy" also for fixed expenses
        const t = nowISO();
        for (const r of pull.debts || []) {
          const v = r.deleted ? null : Core.toRemote(Core.fromRemote(r.id, r));
          state.debts[r.id] = { s: v ? Core.hash(v) : null, r: r.updated_at, t };
        }
        for (const [k, v] of settingsMap(pull)) state.settings[k] = { s: v.value === null ? null : Core.hash(v.value), r: v.updatedAt, t };
      } else if (choice === "merge" || choice === "upload") {
        // Same id on both sides with different content: the cloud copy wins
        // (local edit time is unknown) and the local one stays in the pre-backup.
        for (const d of saved.debts) state.debts[String(d.id)] = { l: Core.hash(Core.toRemote(d)), t: null };
        for (const k of Core.SETTINGS_KEYS) {
          const v = ls.getItem(k);
          state.settings[k] = { l: v === null ? null : Core.hash(v), t: null };
        }
      } else return { ok: false, error: "choice" };
      writeState(state);
      try {
        ls.removeItem(RESET_KEY);
      } catch (_) {}
      await sync({ pulled: pull });
      return { ok: true };
    } catch (e) {
      failure(e);
      return { ok: false, error: e.code || "generic" };
    }
  }
  api.resolveLink = (choice) => resolveLink(choice, false);

  /* ---------------- RPC helpers ---------------- */
  async function rpc(name, args) {
    const c = await getClient();
    if (navigator.onLine === false) throw codeError("offline");
    let res;
    try {
      res = await c.rpc(name, args || {});
    } catch (e) {
      throw codeError("network", e);
    }
    if (res.error) {
      const code = String(res.error.code || "");
      if (code === "PGRST301" || code === "42501" || res.status === 401) throw codeError("auth");
      if (BAD_DATA_CODES.has(code)) throw codeError("badData");
      if (!code || res.status === 0 || /fetch/i.test(String(res.error.message || ""))) throw codeError("network");
      throw codeError("server");
    }
    return res.data;
  }

  /* ---------------- apply remote data locally ---------------- */
  function applySettings(remoteSettings, keys) {
    let changed = false;
    for (const k of keys) {
      const r = remoteSettings.get(k);
      const value = r ? r.value : null;
      if (value === null) {
        if (ls.getItem(k) !== null) {
          ls.removeItem(k);
          changed = true;
        }
        continue;
      }
      // Reuse the backup validator so the cloud can never inject an invalid preference.
      if (k === "mpdd-gastos-categorias-v1") {
        // 1.8: custom categories: list of { key: "c-…", label ≤ 30, icon from the list }.
        if (!validCategories(value)) continue;
        // Merge by key with this device's categories: two devices that create one at the same
        // time keep both (the merged list is uploaded on the next sync).
        const merged = mergeCategories(ls.getItem(k), value);
        if (ls.getItem(k) !== merged) {
          ls.setItem(k, merged);
          changed = true;
        }
        continue;
      } else {
        const fake = { getItem: (key) => (key === k ? value : null) };
        window.DebtBackupPlus.readPrefs(fake);
      }
      if (ls.getItem(k) !== value) {
        ls.setItem(k, value);
        if (ls.getItem(k) !== value) throw codeError("apply");
        changed = true;
      }
    }
    if (changed) status.settingsChanged = true;
    if (changed && keys.includes("mpdd-gastos-categorias-v1")) {
      try {
        document.dispatchEvent(new CustomEvent("mpdd:gastoschange", { detail: { source: "categories" } }));
      } catch (_) {}
    }
    return changed;
  }
  function mergeCategories(localValue, remoteValue) {
    let a = [],
      b = [];
    try {
      a = validCategories(localValue) ? JSON.parse(localValue) : [];
    } catch (_) {}
    try {
      b = JSON.parse(remoteValue);
    } catch (_) {}
    const byKey = new Map();
    for (const c of b.concat(a)) if (!byKey.has(c.key)) byKey.set(c.key, c);
    return JSON.stringify([...byKey.values()].slice(-40));
  }
  function validCategories(value) {
    try {
      const v = JSON.parse(value);
      const icons = (window.MPDDGastosCore && window.MPDDGastosCore.CUSTOM_ICONS) || [];
      return Array.isArray(v) && v.length <= 40 && v.every((c) => c && typeof c.key === "string" && /^c-[a-z0-9-]{1,36}$/.test(c.key) && typeof c.label === "string" && c.label.trim() && c.label.length <= 30 && icons.includes(c.icon));
    } catch (_) {
      return false;
    }
  }
  function editingOpen() {
    const d = document.getElementById("dialog");
    return !!(d && d.open);
  }

  /* ---------------- main sync cycle ---------------- */
  let running = null,
    deleting = false,
    again = false,
    retryTimer = null,
    backoff = 0;
  function sync(opts) {
    if (running) {
      again = true;
      return running;
    }
    const job = () => runSync(opts || {});
    running = (navigator.locks && navigator.locks.request ? navigator.locks.request("mpdd-cloud-sync", job) : job())
      .catch(failure)
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          schedule(800);
        }
      });
    return running;
  }
  function schedule(ms) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => sync(), ms);
  }
  function failure(e) {
    const code = (e && e.code) || "generic";
    const state = readState();
    status.pending = pendingCount(state);
    if (code === "offline" || code === "network") {
      setState("offline", { error: null });
      backoff = Math.min(backoff ? backoff * 2 : 15000, 300000);
      schedule(backoff);
      return;
    }
    if (code === "locked" || code === "localData") return setState("paused", { error: code });
    setState("error", { error: code });
    if (code === "server") {
      backoff = Math.min(backoff ? backoff * 2 : 30000, 600000);
      schedule(backoff);
    }
  }
  async function runSync(opts) {
    if (!status.userId || deleting) return;
    let state = readState();
    if (!state || state.userId !== status.userId) return;
    if (locked()) return setState("paused", { error: "locked" });
    scan(state);
    writeState(state);
    status.pending = pendingCount(state);
    if (navigator.onLine === false) throw codeError("offline");
    setState("syncing");

    const pull = opts.pulled || (await rpc("mpdd_pull"));
    lastPull = pull;
    if (deleting) return;
    // The whole cloud copy disappeared (account data deleted from another device,
    // or the project was reset): keep this device's data and stop syncing.
    const cloudEmpty = !(pull.debts || []).length && !Object.keys(pull.settings || {}).length;
    const wasSynced = Object.values(state.debts).concat(Object.values(state.settings)).some((st) => st && st.s);
    if (cloudEmpty && wasSynced) {
      try {
        ls.removeItem(STATE_KEY);
        ls.setItem(RESET_KEY, String(status.userId));
      } catch (_) {}
      await api.signOut({ keepLocal: true, reload: false });
      setState("signedOut", { error: "remoteReset", pending: 0 });
      return;
    }
    // Re-read: the user may have edited while the request was in flight.
    state = readState();
    if (!state || state.userId !== status.userId) return;
    if (locked()) return setState("paused", { error: "locked" });
    const saved = scan(state);

    const localDebts = new Map();
    const byId = new Map();
    const unsyncable = [];
    for (const d of saved.debts) {
      if (BAD_IDS.has(String(d.id))) {
        unsyncable.push({ name: String(d.name || ""), problems: ["id"] });
        continue;
      }
      localDebts.set(String(d.id), Core.toRemote(d));
      byId.set(String(d.id), d);
    }
    const remoteDebts = new Map();
    for (const r of pull.debts || []) {
      if (!r || typeof r.id !== "string" || BAD_IDS.has(r.id)) continue;
      remoteDebts.set(r.id, { value: r.deleted ? null : Core.toRemote(Core.fromRemote(r.id, r)), updatedAt: r.updated_at, deleted: !!r.deleted, row: r });
    }
    const localSettings = new Map();
    for (const k of Core.SETTINGS_KEYS) {
      const v = ls.getItem(k);
      if (v !== null) localSettings.set(k, v);
    }
    const remoteSettings = settingsMap(pull);

    const debtPlan = Core.plan(localDebts, remoteDebts, state.debts);
    const setPlan = Core.plan(localSettings, remoteSettings, state.settings, Core.settingAlive);
    const notices = [];
    const deferApply = editingOpen();
    let deferred = false;

    // 1) Apply cloud changes to the local copy (one validated write).
    const applies = debtPlan.filter((p) => p.op === "apply" || p.op === "applyDelete");
    if (applies.length && deferApply) deferred = true;
    else if (applies.length) {
      const list = saved.debts.slice();
      const index = new Map(list.map((d, i) => [String(d.id), i]));
      const removed = new Set();
      for (const p of applies) {
        const old = byId.get(p.id);
        if (p.op === "applyDelete") {
          if (old) {
            removed.add(p.id);
            notices.push({ kind: p.conflict ? "conflictDeleted" : "deletedRemotely", name: old.name });
          }
        } else {
          const rec = Core.fromRemote(p.id, remoteDebts.get(p.id).row);
          if (index.has(p.id)) list[index.get(p.id)] = rec;
          else list.push(rec);
          if (p.conflict) notices.push({ kind: "conflictRemote", name: rec.name });
        }
      }
      const next = list.filter((d) => !removed.has(String(d.id)));
      if (ls.getItem(KEY) !== saved.raw) throw codeError("otherTab");
      if (!window.MPDDApp.replaceDebts(next)) throw codeError("apply");
    }
    const setApplies = setPlan.filter((p) => p.op === "apply" || p.op === "applyDelete");
    if (setApplies.length && deferApply) deferred = true;
    else if (setApplies.length) {
      applySettings(
        remoteSettings,
        setApplies.map((p) => p.id),
      );
      if (setApplies.some((p) => p.conflict)) notices.push({ kind: "conflictSettings" });
    }
    if (!deferApply) {
      for (const p of debtPlan) {
        if (p.op === "apply" || p.op === "applyDelete") state.debts[p.id] = { s: p.rh, r: p.rt, l: p.rh, t: state.debts[p.id] && state.debts[p.id].t };
      }
      for (const p of setPlan) {
        if (p.op === "apply" || p.op === "applyDelete") state.settings[p.id] = { s: p.rh, r: p.rt, l: p.rh, t: state.settings[p.id] && state.settings[p.id].t };
      }
    }
    for (const [plans, group] of [
      [debtPlan, state.debts],
      [setPlan, state.settings],
    ])
      for (const p of plans) {
        if (p.op === "drop") delete group[p.id];
        else if (p.op === "sync") group[p.id] = Object.assign(group[p.id] || {}, { s: p.lh, r: p.rt, l: p.lh });
      }

    // 2) Send local changes.
    const pushes = [];
    for (const p of debtPlan) {
      if (p.op !== "push" && p.op !== "pushDelete") continue;
      const st = state.debts[p.id] || {};
      const item = { id: p.id, base: Object.prototype.hasOwnProperty.call(st, "s") ? st.r ?? null : null, updated_at: st.t || nowISO() };
      if (p.op === "pushDelete") {
        item.deleted = true;
      } else {
        const v = localDebts.get(p.id);
        const bad = Core.problems(v);
        if (bad.length) {
          unsyncable.push({ name: v.name, problems: bad });
          continue;
        }
        Object.assign(item, v);
      }
      if (p.conflict) {
        const remoteValue = remoteDebts.get(p.id) && remoteDebts.get(p.id).value;
        notices.push({ kind: p.op === "push" ? "conflictLocal" : "conflictLocalDeleted", name: p.op === "push" ? localDebts.get(p.id).name : remoteValue ? remoteValue.name : "" });
      }
      pushes.push({ item, hash: p.lh });
    }
    const setPushes = {};
    for (const p of setPlan) {
      if (p.op !== "push" && p.op !== "pushDelete") continue;
      const st = state.settings[p.id] || {};
      setPushes[p.id] = { value: localSettings.has(p.id) ? localSettings.get(p.id) : null, updatedAt: st.t || nowISO(), base: Object.prototype.hasOwnProperty.call(st, "s") ? st.r ?? null : null, hash: p.lh };
    }
    let rejected = false;
    const chunks = [];
    for (let i = 0; i < pushes.length; i += 200) chunks.push(pushes.slice(i, i + 200));
    if (!chunks.length && Object.keys(setPushes).length) chunks.push([]);
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const settingsArg = ci === 0 ? Object.fromEntries(Object.entries(setPushes).map(([k, v]) => [k, { value: v.value, updatedAt: v.updatedAt, base: v.base }])) : {};
      let result;
      try {
        result = await rpc("mpdd_push", { p_debts: chunk.map((x) => x.item), p_settings: settingsArg });
      } catch (e) {
        if (e.code !== "badData") throw e;
        // Isolate the record the server refused; send the rest one by one.
        result = { accepted: [], rejected: [], settings: {} };
        for (const x of chunk) {
          try {
            const r = await rpc("mpdd_push", { p_debts: [x.item], p_settings: {} });
            result.accepted.push(...(r.accepted || []));
            result.rejected.push(...(r.rejected || []));
          } catch (e2) {
            if (e2.code !== "badData") throw e2;
            unsyncable.push({ name: x.item.name || "", problems: ["server"] });
          }
        }
        if (ci === 0 && Object.keys(settingsArg).length) {
          try {
            const r = await rpc("mpdd_push", { p_debts: [], p_settings: settingsArg });
            result.settings = r.settings || {};
          } catch (e3) {
            if (e3.code !== "badData") throw e3;
          }
        }
      }
      const hashById = new Map(chunk.map((x) => [x.item.id, x.hash]));
      for (const a of result.accepted || []) {
        const st = state.debts[a.id] || (state.debts[a.id] = {});
        if (a.updated_at === null) delete state.debts[a.id];
        else Object.assign(st, { s: hashById.get(a.id) ?? null, r: a.updated_at });
      }
      if ((result.rejected || []).length) rejected = true;
      for (const [k, r] of Object.entries(result.settings || {})) {
        if (r && r.accepted) Object.assign(state.settings[k] || (state.settings[k] = {}), { s: setPushes[k].hash, r: r.updatedAt });
        else rejected = true;
      }
    }
    await gastosSync(); // 1.8: fixed expenses (never fails the debt sync)
    writeState(state);
    backoff = 0;
    lastPendingSig = pendingSignature(state);
    status.unsyncable = unsyncable;
    status.pending = pendingCount(state);
    status.lastSync = nowISO();
    if (notices.length) status.notices = status.notices.concat(notices).slice(-20);
    setState("synced", { error: unsyncable.length ? "unsyncable" : null });
    if (rejected) schedule(1500);
    else if (deferred) schedule(5000);
  }

  /* ---------------- sign out / delete ---------------- */
  function wipeLocal() {
    if (locked()) return false;
    const keep = new Set(["deudas-lang-v1"]);
    const exact = new Set([KEY, ...window.DebtBackupPlus.PREFS, "mpdd-foreground-notices-sent-v1", "mpdd-plan-draft-v1", "mpdd-account-prompts-v1", "mpdd-push-device-v1", "mpdd-gastos-fijos-v1", "mpdd-gastos-categorias-v1"]);
    const keys = [];
    for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
    for (const k of keys) {
      if (k === null || keep.has(k)) continue;
      if (exact.has(k) || PREFIXES_TO_WIPE.some((p) => k.startsWith(p))) ls.removeItem(k);
    }
    return true;
  }
  api.signOut = async ({ keepLocal = true, reload = true } = {}) => {
    signingOut = true;
    clearTimeout(retryTimer);
    try {
      if (client) await client.auth.signOut({ scope: "local" });
    } catch (_) {}
    try {
      ls.removeItem(ACTIVE_KEY);
    } catch (_) {}
    status.userId = status.email = null;
    status.choice = null;
    status.recovery = false;
    deleting = false;
    lastPendingSig = null;
    let wiped = false;
    if (!keepLocal) wiped = wipeLocal();
    setState("signedOut", { error: !keepLocal && !wiped ? "wipeLocked" : null, pending: pendingCount(readState()) });
    signingOut = false;
    if (wiped && reload) setTimeout(() => location.reload(), 50);
    return { ok: true, wiped };
  };
  api.deleteAccount = async () => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    // Stop the sync engine first so no in-flight cycle re-uploads deleted data.
    deleting = true;
    clearTimeout(retryTimer);
    clearTimeout(scanTimer);
    try {
      if (running) await running;
      if (gastosJob) await gastosJob; // 1.8
    } catch (_) {}
    try {
      // The plan lives in its own table (1.3): remove it first (own row via RLS).
      const c = await getClient();
      const del = await c.from("debt_plans").delete().eq("user_id", status.userId);
      if (del && del.error) throw codeError(navigator.onLine === false ? "network" : "server");
      try {
        ls.removeItem(PLAN_CACHE);
      } catch (_) {}
      // 1.4: notification devices and settings (own rows via RLS).
      // 1.8: fixed expenses (gastos_fijos) too.
      for (const table of ["push_subscriptions", "push_settings", "gastos_fijos"]) {
        const r = await c.from(table).delete().eq("user_id", status.userId);
        if (r && r.error) throw codeError(navigator.onLine === false ? "network" : "server");
      }
      await rpc("mpdd_delete_my_data");
    } catch (e) {
      deleting = false;
      return { ok: false, error: e.code || "generic" };
    }
    let accountDeleted = false;
    try {
      const c = await getClient();
      const r = await c.functions.invoke("delete-account", { method: "POST", body: { confirm: true } });
      accountDeleted = !r.error && !!(r.data && r.data.deleted);
    } catch (_) {}
    try {
      ls.removeItem(STATE_KEY);
      ls.removeItem("mpdd-push-device-v1");
    } catch (_) {}
    return { ok: true, dataDeleted: true, accountDeleted };
  };
  /* ---------------- plan (1.3) ---------------- */
  // TRM: always through the "trm" Edge Function (never the open-data API directly).
  // It is public data, so it works without a session; only the publishable key is sent.
  const TRM_CACHE = "mpdd-trm-cache-v1";
  let trmMemo = null;
  api.fetchTRM = async ({ force = false } = {}) => {
    if (status.config !== "ok") return { ok: false, error: "config" };
    if (!force && trmMemo && Date.now() - trmMemo.at < 10 * 60 * 1000) return trmMemo.value;
    const cached = () => {
      try {
        const c = JSON.parse(ls.getItem(TRM_CACHE) || "null");
        if (c && typeof c.valor === "number" && c.valor >= 100 && c.valor <= 100000 && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) return { ok: true, valor: c.valor, fecha: c.fecha, fuente: String(c.fuente || ""), desactualizada: true };
      } catch (_) {}
      return { ok: false, error: "network" };
    };
    if (navigator.onLine === false) return cached();
    try {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
      const res = await fetch(String(CFG.supabaseUrl).replace(/\/$/, "") + "/functions/v1/trm", { headers: { apikey: CFG.supabaseKey }, cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (!res.ok) return cached();
      const d = await res.json();
      const valor = Number(d && d.valor);
      if (!(valor >= 100 && valor <= 100000) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) return cached();
      const value = { ok: true, valor, fecha: d.fecha, fuente: String(d.fuente || ""), desactualizada: !!d.desactualizada };
      trmMemo = { at: Date.now(), value };
      try {
        ls.setItem(TRM_CACHE, JSON.stringify({ valor, fecha: d.fecha, fuente: value.fuente }));
      } catch (_) {}
      return value;
    } catch (_) {
      return cached();
    }
  };
  /* 1.8: euro reference rate (dollars per 1 euro), European Central Bank, through the
     "tasa-euro" function. Same as the TRM: 10-minute memo, and offline the last saved one
     (marked desactualizada, with its date). */
  let eurMemo = null;
  const EUR_CACHE = "mpdd-eur-cache-v1";
  api.fetchEUR = async ({ force = false } = {}) => {
    if (status.config !== "ok") return { ok: false, error: "config" };
    if (!force && eurMemo && Date.now() - eurMemo.at < 10 * 60 * 1000) return eurMemo.value;
    const valid = (v, f) => typeof v === "number" && v >= 0.2 && v <= 5 && /^\d{4}-\d{2}-\d{2}$/.test(String(f));
    const cached = () => {
      try {
        const c = JSON.parse(ls.getItem(EUR_CACHE) || "null");
        if (c && valid(c.usdPorEur, c.fecha)) return { ok: true, usdPorEur: c.usdPorEur, fecha: c.fecha, fuente: String(c.fuente || ""), desactualizada: true };
      } catch (_) {}
      return { ok: false, error: "network" };
    };
    if (navigator.onLine === false) return cached();
    try {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
      const res = await fetch(String(CFG.supabaseUrl).replace(/\/$/, "") + "/functions/v1/tasa-euro", { headers: { apikey: CFG.supabaseKey }, cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (!res.ok) return cached();
      const d = await res.json();
      const usdPorEur = Number(d && d.usdPorEur);
      if (!valid(usdPorEur, d && d.fecha)) return cached();
      const value = { ok: true, usdPorEur, fecha: d.fecha, fuente: String(d.fuente || ""), desactualizada: !!d.desactualizada };
      eurMemo = { at: Date.now(), value };
      try {
        ls.setItem(EUR_CACHE, JSON.stringify({ usdPorEur, fecha: d.fecha, fuente: value.fuente }));
      } catch (_) {}
      return value;
    } catch (_) {
      return cached();
    }
  };
  // Saved plan: Supabase table debt_plans (RLS: own row only). Requires a session.
  const PLAN_CACHE = "mpdd-cloud-plan-v1";
  api.loadPlan = async () => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    try {
      const c = await getClient();
      const { data, error } = await c.from("debt_plans").select("*").eq("user_id", status.userId).maybeSingle();
      if (error) throw error;
      try {
        if (data) ls.setItem(PLAN_CACHE, JSON.stringify({ userId: status.userId, plan: data }));
        else ls.removeItem(PLAN_CACHE);
      } catch (_) {}
      return { ok: true, plan: data || null };
    } catch (_) {
      return { ok: false, error: navigator.onLine === false ? "network" : "server", plan: api.cachedPlan() };
    }
  };
  api.cachedPlan = () => {
    try {
      const c = JSON.parse(ls.getItem(PLAN_CACHE) || "null");
      return c && c.userId === status.userId && status.userId ? c.plan : null;
    } catch (_) {
      return null;
    }
  };
  api.savePlan = async (row) => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    try {
      const c = await getClient();
      const { data, error } = await c.from("debt_plans").upsert(Object.assign({}, row, { user_id: status.userId }), { onConflict: "user_id" }).select().single();
      if (error) return { ok: false, error: /check|violat|invalid/i.test(String(error.message || error.code)) ? "badData" : "server" };
      try {
        ls.setItem(PLAN_CACHE, JSON.stringify({ userId: status.userId, plan: data }));
      } catch (_) {}
      return { ok: true, plan: data };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  api.syncNow = () => {
    if (!status.userId) return Promise.resolve();
    backoff = 0;
    return sync();
  };
  api.dismissNotices = () => {
    status.notices = [];
    status.settingsChanged = false;
    emit();
  };
  api.onChange = (fn) => {
    listeners.add(fn);
    fn(status);
    return () => listeners.delete(fn);
  };
  api.status = () => status;
  api.configStatus = configStatus;
  api.pendingCount = () => pendingCount(readState());
  api._internals = { scan, readState, writeState, LIB_URL, LIB_SRI, STATE_KEY, ACTIVE_KEY, PREBACKUP_KEY };

  /* ================= 1.4 Notificaciones push (api.push*) =================
     Tables push_subscriptions / push_settings (RLS: own rows) and the Edge Function
     "enviar-recordatorios". Only the publishable key and the user's own session token
     are sent. Endpoints, keys and tokens are never logged. */
  const PUSH_FN = "/functions/v1/enviar-recordatorios";
  const PUSH_DEVICE_KEY = "mpdd-push-device-v1";
  const pushUrl = () => String(CFG.supabaseUrl).replace(/\/$/, "") + PUSH_FN;
  function pushTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
  }
  api.pushPublicKey = async () => {
    if (status.config !== "ok") return { ok: false, error: "config" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    try {
      const res = await fetch(pushUrl(), { method: "GET", headers: { apikey: CFG.supabaseKey }, cache: "no-store" });
      if (!res.ok) return { ok: false, error: "server" };
      const d = await res.json();
      const key = d && typeof d.publicKey === "string" ? d.publicKey : "";
      if (!/^[A-Za-z0-9_-]{40,200}={0,2}$/.test(key)) return { ok: false, error: "server" };
      return { ok: true, publicKey: key };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  api.pushSaveSubscription = async (subscription) => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    let json;
    try {
      json = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
    } catch (_) {
      json = null;
    }
    const keys = (json && json.keys) || {};
    if (!json || typeof json.endpoint !== "string" || !/^https:\/\//.test(json.endpoint) || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return { ok: false, error: "subscribe" };
    const row = { user_id: status.userId, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: String(navigator.userAgent || "").slice(0, 300), updated_at: nowISO() };
    try {
      const c = await getClient();
      const { error } = await c.from("push_subscriptions").upsert(row, { onConflict: "user_id,endpoint" });
      return error ? { ok: false, error: "server" } : { ok: true };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  api.pushDeleteSubscription = async (endpoint) => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    if (typeof endpoint !== "string" || !endpoint) return { ok: false, error: "subscribe" };
    try {
      const c = await getClient();
      const { error } = await c.from("push_subscriptions").delete().eq("user_id", status.userId).eq("endpoint", endpoint);
      return error ? { ok: false, error: "server" } : { ok: true };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  api.pushSaveSettings = async (s) => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    const valid = s && typeof s.enabled === "boolean" && [1, 3, 7].includes(s.days_before) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.send_time)) && typeof s.tz === "string" && s.tz.length <= 64 && ["es", "en"].includes(s.lang);
    if (!valid) return { ok: false, error: "badData" };
    const row = { user_id: status.userId, enabled: s.enabled, days_before: s.days_before, send_time: s.send_time, tz: s.tz, lang: s.lang, updated_at: nowISO() };
    try {
      const c = await getClient();
      const { error } = await c.from("push_settings").upsert(row, { onConflict: "user_id" });
      return error ? { ok: false, error: "server" } : { ok: true };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  api.pushTest = async () => {
    if (!status.userId) return { ok: false, error: "notSignedIn" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    try {
      const c = await getClient();
      const { data } = await c.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) return { ok: false, error: "auth" };
      const res = await fetch(pushUrl(), { method: "POST", headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ accion: "prueba" }), cache: "no-store" });
      let d = null;
      try {
        d = await res.json();
      } catch (_) {}
      if (res.ok && d && d.ok) return { ok: true, enviadas: Number(d.enviadas) || 0, borradas: Number(d.borradas) || 0 };
      if (res.status === 404 && d && d.error === "sin_suscripciones") return { ok: false, error: "sin_suscripciones" };
      if (res.status === 401) return { ok: false, error: "auth" };
      return { ok: false, error: "server" };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  /* 1.8 "Enviar sugerencia": the table is insert-only (never read back). user_id is never sent:
     the database takes it from the token (auth.uid()) when signed in. Nothing is logged. */
  api.sendSuggestion = async (s) => {
    if (status.config !== "ok") return { ok: false, error: "config" };
    if (navigator.onLine === false) return { ok: false, error: "network" };
    const body = JSON.stringify({ tipo: s.tipo, texto: s.texto, contacto: s.contacto || null, idioma: s.idioma === "en" ? "en" : "es", version: String(s.version || "") });
    let token = null;
    if (status.userId) {
      try {
        const c = await getClient();
        const { data } = await c.auth.getSession();
        token = (data && data.session && data.session.access_token) || null;
      } catch (_) {}
    }
    const post = (bearer) =>
      fetch(String(CFG.supabaseUrl).replace(/\/$/, "") + "/rest/v1/sugerencias", {
        method: "POST",
        headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json", Prefer: "return=minimal", Authorization: "Bearer " + bearer },
        body,
        cache: "no-store",
      });
    try {
      let res = await post(token || CFG.supabaseKey);
      // An expired session must not lose the suggestion: send it without the account.
      if (res.status === 401 && token) res = await post(CFG.supabaseKey);
      if (res.status === 201) return { ok: true };
      let text = "";
      try {
        text = await res.text();
      } catch (_) {}
      if (/demasiadas_sugerencias/.test(text)) return { ok: false, error: "rateLimit" };
      return { ok: false, error: "server" };
    } catch (_) {
      return { ok: false, error: "network" };
    }
  };
  /* Best effort, before signing out: forget this device so the account stops sending to it. */
  async function pushForgetDevice() {
    try {
      const sw = navigator.serviceWorker;
      const reg = sw && typeof sw.getRegistration === "function" ? await sw.getRegistration() : null;
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        if (status.userId) await api.pushDeleteSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (_) {}
    try {
      ls.removeItem(PUSH_DEVICE_KEY);
    } catch (_) {}
  }
  const signOutWithoutPush = api.signOut;
  api.signOut = async (opts) => {
    if (status.userId) await pushTimeout(pushForgetDevice(), 4000);
    return signOutWithoutPush(opts);
  };
  /* ================= fin 1.4 Notificaciones push ================= */

  /* ================= 1.8 Gastos fijos (tabla gastos_fijos) =================
     MPDDGastos (this device) is the working copy. Each sync pulls the user's own rows
     (RLS), merges them with MPDDGastosCore.merge (last write wins by updatedAt; deletion
     marks are kept so a deletion reaches every device), pushes what is newer here or missing
     in the cloud, and saves the result here with replaceAll(list, "sync").
     Offline or on any error nothing is shown: the next sync tries again. Never logs data. */
  let gastosJob = null,
    gastosAgain = false,
    gastosTimer = null,
    gastosReplace = false,
    gastosKeepLocal = false;
  const gastosTime = (g) => Date.parse(g && g.updatedAt) || 0;
  const gastosText = (list) => JSON.stringify(list.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  async function gastosUpsert(c, rows) {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const r = await c.from("gastos_fijos").upsert(chunk, { onConflict: "user_id,id" });
      if (!r || !r.error) continue;
      if (!BAD_DATA_CODES.has(String(r.error.code || ""))) throw codeError(navigator.onLine === false ? "network" : "server");
      // One row refused by the database: send the others one by one.
      for (const row of chunk) {
        const one = await c.from("gastos_fijos").upsert(row, { onConflict: "user_id,id" });
        if (one && one.error && !BAD_DATA_CODES.has(String(one.error.code || ""))) throw codeError("server");
      }
    }
  }
  async function gastosRun() {
    const G = window.MPDDGastos,
      GC = window.MPDDGastosCore;
    if (!G || !GC || !status.userId || deleting) return;
    const state = readState();
    // Only once this device is linked to the account (after the first-sign-in choice).
    if (!state || state.userId !== status.userId) return;
    if (ls.getItem(JOURNAL) !== null) return;
    if (navigator.onLine === false) return;
    const uid = status.userId;
    const c = await getClient();
    const res = await c.from("gastos_fijos").select("*");
    if (!res || res.error) throw codeError("server");
    if (deleting || status.userId !== uid) return;
    const remote = (Array.isArray(res.data) ? res.data : []).map(GC.fromRow).filter(Boolean);
    const remoteById = new Map(remote.map((g) => [g.id, g]));
    const local = G.all();
    const replace = gastosReplace;
    gastosReplace = false;
    const keepLocal = gastosKeepLocal;
    gastosKeepLocal = false;
    let merged;
    if (replace) merged = GC.sanitize(remote);
    else if (keepLocal) {
      // Like the debts: this device's copy replaces the cloud one. Whatever exists only in
      // the cloud is marked as deleted, and everything gets a new date so it wins.
      const now = new Date().toISOString();
      const localIds = new Set(local.map((g) => g.id));
      merged = local
        .map((g) => Object.assign({}, g, { updatedAt: now }))
        .concat(remote.filter((r) => !localIds.has(r.id) && !r.deleted).map((r) => ({ id: r.id, deleted: true, updatedAt: now })));
    } else merged = GC.merge(local, remote);
    const push = merged.filter((g) => {
      const r = remoteById.get(g.id);
      return !r || gastosTime(g) > gastosTime(r);
    });
    await gastosUpsert(
      c,
      push.map((g) => Object.assign(GC.toRow(g), { user_id: uid })),
    );
    if (deleting || status.userId !== uid) return;
    // Edited here while the request was in flight: merge again on the next run.
    if (gastosText(G.all()) !== gastosText(local)) {
      gastosAgain = true;
      return;
    }
    if (gastosText(merged) !== gastosText(local)) G.replaceAll(merged, "sync");
  }
  function gastosSync() {
    if (gastosJob) {
      gastosAgain = true;
      return gastosJob;
    }
    gastosJob = gastosRun()
      .catch(() => {})
      .finally(() => {
        gastosJob = null;
        if (gastosAgain) {
          gastosAgain = false;
          clearTimeout(gastosTimer);
          gastosTimer = setTimeout(gastosSync, 800);
        }
      });
    return gastosJob;
  }
  document.addEventListener("mpdd:gastoschange", (e) => {
    const source = e && e.detail && e.detail.source;
    if ((source !== "local" && source !== "restore") || !status.userId) return;
    clearTimeout(gastosTimer);
    gastosTimer = setTimeout(gastosSync, 1200);
  });
  api.syncGastos = () => gastosSync();
  /* ================= fin 1.8 Gastos fijos ================= */

  /* ---------------- boot ---------------- */
  let bootTimer = null;
  function boot() {
    if (status.config !== "ok") {
      setState("disabled");
      return;
    }
    let active = false;
    try {
      active = ls.getItem(ACTIVE_KEY) === "1";
    } catch (_) {}
    if (urlAuthError() && !active) {
      // Expired or invalid email link: no need to contact the server.
      cleanUrl();
      setState("signedOut", { pending: 0, error: "linkInvalid" });
      return;
    }
    if (!active && !urlHasAuth()) {
      setState("signedOut", { pending: 0 });
      return;
    }
    setState("starting");
    getClient()
      .then((c) => c.auth.getSession())
      .then((r) => {
        const session = r && r.data && r.data.session;
        if (session) {
          if (!status.userId) onAuth("SIGNED_IN", session);
          return;
        }
        const err = r && r.error;
        const retryable = navigator.onLine === false || (err && (err.name === "AuthRetryableFetchError" || Number(err.status || 0) === 0 || Number(err.status) >= 500));
        if (active && retryable) {
          setState("offline", { pending: pendingCount(readState()) });
          clearTimeout(bootTimer);
          bootTimer = setTimeout(boot, 30000);
          return;
        }
        onAuth("NO_SESSION", null);
      })
      .catch((e) => {
        // Offline at startup with a stored session: keep working locally.
        status.pending = pendingCount(readState());
        setState(active ? "offline" : "signedOut", { error: e.code === "network" ? null : "generic" });
        if (active) schedule(15000);
      });
  }
  // Lightweight change detection while signed in (no network unless something changed).
  let scanTimer = null,
    lastPendingSig = null;
  function pendingSignature(state) {
    const parts = [];
    for (const [group, map] of [
      ["d", state.debts],
      ["s", state.settings],
    ])
      for (const [id, st] of Object.entries(map)) {
        const synced = Object.prototype.hasOwnProperty.call(st, "s") ? st.s : null;
        if ((st.l ?? null) !== synced) parts.push(group + id + "=" + st.l);
      }
    return parts.sort().join("|");
  }
  function quickScan() {
    if (!status.userId || status.state === "needsChoice" || locked()) return;
    const state = readState();
    if (!state || state.userId !== status.userId) return;
    try {
      scan(state);
    } catch (_) {
      return;
    }
    writeState(state);
    const n = pendingCount(state);
    if (n !== status.pending) {
      status.pending = n;
      emit();
    }
    // Only a NEW local change triggers a sync; retries of failures follow the backoff
    // in failure(), and records that cannot be synced do not cause polling.
    const sig = pendingSignature(state);
    const changed = sig !== lastPendingSig;
    lastPendingSig = sig;
    if (n && changed && navigator.onLine !== false && status.state !== "offline") {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => sync(), 1200);
    }
  }
  document.addEventListener("mpdd:localchange", () => setTimeout(quickScan, 0));
  setInterval(quickScan, 3000);
  window.addEventListener("online", () => {
    if (status.userId) {
      backoff = 0;
      sync();
    } else if (status.state === "offline") boot();
  });
  window.addEventListener("offline", () => {
    if (status.userId) setState("offline", { pending: pendingCount(readState()) });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && status.userId && status.state !== "needsChoice") sync();
  });
  setInterval(() => {
    if (document.visibilityState === "visible" && status.userId && status.state === "synced") sync();
  }, 300000);

  window.MPDDCloud = api;
  boot();
})();
