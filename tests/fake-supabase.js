/* In-memory stand-in for supabase-js + the RPCs in supabase/schema.sql.
   Mirrors the server rules (versions, tombstones, per-key settings, CHECK constraints)
   so the client sync logic can be tested without any network. */
"use strict";

const ALLOWED = ["nando-recordatorios-v1", "deudas-lang-v1", "deudas-currency-pref-v1", "nando-deudas-sort-v1", "deudas-budget-v1", "mpdd-gastos-categorias-v1"];
const MAX = 90071992547409;
const ms = (iso) => Date.parse(iso);
const ts = (n) => new Date(n).toISOString();

class FakeServer {
  constructor() {
    this.users = new Map(); // email -> { id, password, confirmed }
    this.debts = new Map(); // `${uid}|${id}` -> row
    this.settings = new Map(); // uid -> data
    this.offline = false;
    this.calls = [];
    this.functionDeployed = true;
    this.memberships = new Map();
    this.plans = new Map(); // uid -> debt_plans row (RLS: own row only)
    this.gastos = new Map(); // uid -> Map(id -> gastos_fijos row) (RLS: own rows only)
    this.trm = { status: 200, body: { fecha: "2026-11-15", valor: 4000, fuente: "Superintendencia Financiera de Colombia", desactualizada: false } };
    this.trmCalls = 0;
    // 1.8: "tasa-euro" function (European Central Bank, dollars per 1 euro).
    this.eur = { status: 200, body: { fecha: "2026-11-15", usdPorEur: 1.05, fuente: "Banco Central Europeo", desactualizada: false } };
    this.eurCalls = 0;
    this.seq = 0;
    // 1.4 push: tables push_subscriptions / push_settings and the "enviar-recordatorios" function.
    this.pushSubs = []; // rows { id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at }
    this.pushSettings = new Map(); // uid -> row
    this.pushPublicKey = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    this.pushCalls = [];
    this.pushFunctionStatus = null; // force a status for POST (e.g. 500)
    // 1.8 sugerencias: insert-only table; user_id comes from the token (auth.uid()).
    this.suggestions = []; // stored rows
    this.suggestionCalls = []; // every request { url, method, headers, body }
    this.suggestionReply = null; // null = normal; 0 = network error; number = HTTP status; "rate" = demasiadas_sugerencias
  }
  suggestion(url, init) {
    const method = String(init.method || "GET").toUpperCase();
    const headers = Object.assign({}, init.headers || {});
    this.suggestionCalls.push({ url, method, headers, body: init.body === undefined ? undefined : String(init.body) });
    const reply = (status, text) => Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => text, json: async () => (text ? JSON.parse(text) : null) });
    if (this.offline || this.suggestionReply === 0) return Promise.reject(new TypeError("Failed to fetch"));
    if (method !== "POST") return reply(401, JSON.stringify({ code: "42501", message: "permission denied for table sugerencias" }));
    if (!headers.apikey) return reply(401, JSON.stringify({ message: "No API key found in request" }));
    if (this.suggestionReply === "rate") return reply(400, JSON.stringify({ code: "P0001", message: "demasiadas_sugerencias" }));
    if (typeof this.suggestionReply === "number") return reply(this.suggestionReply, JSON.stringify({ message: "error" }));
    let row = null;
    try {
      row = JSON.parse(init.body);
    } catch (_) {}
    const uid = this.tokenUser(headers.Authorization);
    if (!row || typeof row !== "object") return reply(400, JSON.stringify({ code: "22P02" }));
    if ("user_id" in row) return reply(403, JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }));
    if (!["sugerencia", "error", "gusto"].includes(row.tipo) || typeof row.texto !== "string" || !row.texto.trim() || row.texto.length > 1000) return reply(400, JSON.stringify({ code: "23514" }));
    this.suggestions.push(Object.assign({ user_id: uid }, row));
    return reply(201, "");
  }
  tokenUser(token) {
    for (const u of this.users.values()) if (token === "Bearer fake-token-" + u.id) return u.id;
    return null;
  }
  pushFunction(init) {
    const method = String(init.method || "GET").toUpperCase();
    const headers = init.headers || {};
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) });
    this.pushCalls.push({ method, headers: Object.assign({}, headers), body: init.body === undefined ? undefined : String(init.body) });
    if (this.offline) return Promise.reject(new TypeError("Failed to fetch"));
    if (!headers.apikey) return reply(401, { error: "sin_apikey" });
    if (method === "GET") return reply(200, { publicKey: this.pushPublicKey });
    if (this.pushFunctionStatus) return reply(this.pushFunctionStatus, { error: "error" });
    const uid = this.tokenUser(headers.Authorization);
    if (!uid) return reply(401, { error: "no_autorizado" });
    let body = null;
    try {
      body = JSON.parse(init.body);
    } catch (_) {}
    if (!body || body.accion !== "prueba") return reply(400, { error: "accion" });
    const n = this.pushSubs.filter((r) => r.user_id === uid).length;
    if (!n) return reply(404, { error: "sin_suscripciones" });
    return reply(200, { ok: true, enviadas: n, borradas: 0 });
  }
  /* 1.8: table gastos_fijos. Checks like the real database: own rows, complete active expense,
     valid currency and frequency. */
  gastosTable(op, row, filters, me) {
    const mine = this.gastos.get(me) || new Map();
    this.gastos.set(me, mine);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    if (op === "upsert") {
      const rows = Array.isArray(row) ? row : [row];
      for (const r of rows) {
        if (r.user_id !== undefined && r.user_id !== me) return { data: null, error: { code: "42501", message: "new row violates row-level security" } };
        const okActive = r.borrado || (r.nombre && r.monto > 0 && ["USD", "COP", "EUR"].includes(r.moneda) && ["mensual", "trimestral", "semestral", "anual"].includes(r.frecuencia) && r.dia >= 1 && r.dia <= 31 && (r.frecuencia === "mensual" || (r.mes >= 1 && r.mes <= 12)));
        if (!okActive || typeof r.id !== "string" || !r.id) return { data: null, error: { code: "23514", message: "check violation" } };
      }
      for (const r of rows) mine.set(r.id, Object.assign(clone(r), { user_id: me }));
      return { data: rows.map((r) => clone(mine.get(r.id))), error: null };
    }
    if (op === "delete") {
      const id = (filters.find((f) => f[0] === "id") || [])[1];
      const owner = (filters.find((f) => f[0] === "user_id") || [])[1];
      if (id !== undefined) mine.delete(id);
      else if (owner === me) mine.clear();
      return { data: null, error: null };
    }
    return { data: [...mine.values()].map(clone), error: null };
  }
  pushTable(table, op, row, filters, me) {
    const match = (r) => r.user_id === me && filters.every(([c, v]) => r[c] === v);
    const now = new Date().toISOString();
    if (table === "push_subscriptions") {
      if (op === "upsert") {
        if (row.user_id !== me) return { data: null, error: { code: "42501", message: "new row violates row-level security" } };
        if (typeof row.endpoint !== "string" || typeof row.p256dh !== "string" || typeof row.auth !== "string" || (row.user_agent && row.user_agent.length > 300)) return { data: null, error: { code: "23514", message: "check violation" } };
        const cur = this.pushSubs.find((r) => r.user_id === me && r.endpoint === row.endpoint);
        if (cur) Object.assign(cur, row, { updated_at: now });
        else this.pushSubs.push(Object.assign({ id: "sub-" + ++this.seq, created_at: now }, row, { updated_at: now }));
        return { data: null, error: null };
      }
      if (op === "delete") {
        this.pushSubs = this.pushSubs.filter((r) => !match(r));
        return { data: null, error: null };
      }
      return { data: this.pushSubs.filter(match).map((r) => Object.assign({}, r)), error: null };
    }
    if (op === "upsert") {
      if (row.user_id !== me) return { data: null, error: { code: "42501", message: "new row violates row-level security" } };
      if (typeof row.enabled !== "boolean" || ![1, 3, 7].includes(row.days_before) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.send_time) || typeof row.tz !== "string" || row.tz.length > 64 || !["es", "en"].includes(row.lang)) return { data: null, error: { code: "23514", message: "check violation" } };
      this.pushSettings.set(me, Object.assign({}, row, { updated_at: now }));
      return { data: null, error: null };
    }
    if (op === "delete") {
      this.pushSettings.delete(me);
      return { data: null, error: null };
    }
    const r = this.pushSettings.get(me);
    return { data: r ? [Object.assign({}, r)] : [], error: null };
  }
  addUser(email, password) {
    const id = "00000000-0000-4000-8000-" + String(++this.seq).padStart(12, "0");
    this.users.set(email, { id, password, confirmed: true });
    return id;
  }
  rowsFor(uid) {
    return [...this.debts.values()].filter((r) => r.user_id === uid).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  }
  check(d) {
    const money = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX;
    if (typeof d.name !== "string" || d.name.length > 80 || !d.name.trim()) return false;
    if (!money(d.balance) || !money(d.initial)) return false;
    if (d.limit != null && !money(d.limit)) return false;
    if (d.rate != null && !money(d.rate)) return false;
    if (!["USD", "COP", "EUR"].includes(d.currency)) return false;
    if (d.due != null && !(Number.isInteger(d.due) && d.due >= 1 && d.due <= 31)) return false;
    for (const p of d.payments || []) if (!(p.amount > 0 && p.amount <= MAX)) return false;
    return true;
  }
  pull(uid) {
    return {
      debts: this.rowsFor(uid).map((r) => ({
        id: r.id, name: r.name, balance: r.balance, initial: r.initial, limit: r.limit, rate: r.rate,
        currency: r.currency, due: r.due, source: r.source, extra: r.extra, deleted: !!r.deleted_at,
        updated_at: ts(r.updated_at), payments: r.payments.map((p) => ({ ...p })),
      })),
      settings: JSON.parse(JSON.stringify(this.settings.get(uid) || {})),
      server_time: ts(Date.now()),
    };
  }
  push(uid, p_debts, p_settings) {
    const now = Date.now();
    for (const d of p_debts) if (!d.deleted && !this.check(d)) return { error: { code: "23514", message: "check violation" } };
    const accepted = [], rejected = [], settings = {};
    for (const d of p_debts) {
      const key = uid + "|" + d.id;
      const cur = this.debts.get(key);
      const vts = Math.min(d.updated_at ? ms(d.updated_at) : now, now + 300000);
      if (cur && !((d.base != null && ts(cur.updated_at) === d.base) || vts > cur.updated_at)) {
        rejected.push(d.id);
        continue;
      }
      const vnew = cur ? Math.max(vts, cur.updated_at + 1) : vts;
      if (d.deleted) {
        if (cur) {
          Object.assign(cur, { name: "eliminada", balance: 0, initial: 0, limit: null, rate: null, due: null, source: null, extra: {}, payments: [], deleted_at: vnew, updated_at: vnew });
          accepted.push({ id: d.id, updated_at: ts(vnew) });
        } else accepted.push({ id: d.id, updated_at: null });
        continue;
      }
      const row = {
        user_id: uid, id: d.id, name: d.name, balance: d.balance, initial: d.initial, limit: d.limit ?? null, rate: d.rate ?? null,
        currency: d.currency, due: d.due ?? null, source: d.source ?? null, extra: d.extra || {}, deleted_at: null, updated_at: vnew,
        created: cur ? cur.created : ++this.seq,
        payments: (d.payments || []).map((p) => ({ amount: p.amount, paid_on: p.paid_on ?? null, extra: p.extra || {} })),
      };
      this.debts.set(key, row);
      accepted.push({ id: d.id, updated_at: ts(vnew) });
    }
    const data = this.settings.get(uid) || {};
    for (const [k, s] of Object.entries(p_settings || {})) {
      if (!ALLOWED.includes(k)) return { error: { code: "22023", message: "setting not allowed" } };
      const e = data[k];
      const vts = Math.min(s.updatedAt ? ms(s.updatedAt) : now, now + 300000);
      if (e && !((s.base != null && e.updatedAt === s.base) || vts > ms(e.updatedAt))) {
        settings[k] = { accepted: false };
        continue;
      }
      const vnew = e ? Math.max(vts, ms(e.updatedAt) + 1) : vts;
      data[k] = { value: s.value ?? null, updatedAt: ts(vnew) };
      settings[k] = { accepted: true, updatedAt: ts(vnew) };
    }
    if (Object.keys(p_settings || {}).length) this.settings.set(uid, data);
    return { data: { accepted, rejected, settings, server_time: ts(now) } };
  }
  deleteAll(uid) {
    let n = 0;
    for (const [k, r] of this.debts) if (r.user_id === uid) {
      this.debts.delete(k);
      n++;
    }
    this.settings.delete(uid);
    return { deleted_debts: n };
  }
}

function createFakeLib(server, win) {
  const created = [];
  function createClient(url, key, options) {
    const storageKey = "sb-fake-auth-token";
    const listeners = new Set();
    const ls = win.localStorage;
    const getSession = () => {
      try {
        return JSON.parse(ls.getItem(storageKey) || "null");
      } catch (_) {
        return null;
      }
    };
    const emit = (event, session) => win.setTimeout(() => listeners.forEach((fn) => fn(event, session)), 0);
    const net = () => (server.offline ? { data: null, error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } } : null);
    server.emitAuth = (event, session) => emit(event, session);
    const client = {
      url, key, options,
      auth: {
        onAuthStateChange(fn) {
          listeners.add(fn);
          emit("INITIAL_SESSION", getSession());
          return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
        },
        async getSession() {
          return { data: { session: getSession() }, error: null };
        },
        async signInWithPassword({ email, password }) {
          server.calls.push(["signIn", email]);
          const off = net();
          if (off) return off;
          const u = server.users.get(email);
          if (!u || u.password !== password) return { data: {}, error: { name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
          if (u.confirmed === false) return { data: {}, error: { name: "AuthApiError", status: 400, code: "email_not_confirmed", message: "Email not confirmed" } };
          const session = { access_token: "fake-token-" + u.id, user: { id: u.id, email } };
          ls.setItem(storageKey, JSON.stringify(session));
          emit("SIGNED_IN", session);
          return { data: { session, user: session.user }, error: null };
        },
        async signUp({ email, password, options: o }) {
          server.calls.push(["signUp", email, o && o.data]);
          const off = net();
          if (off) return off;
          if (server.signupError) return { data: {}, error: server.signupError === true ? { name: "AuthApiError", status: 500, code: "unexpected_failure", message: "Error sending confirmation email" } : server.signupError };
          if (!server.users.has(email)) {
            const id = server.addUser(email, password);
            server.users.get(email).confirmed = false;
            return { data: { user: { id, email, identities: [{}] }, session: null }, error: null };
          }
          return { data: { user: { id: "obfuscated", identities: [] }, session: null }, error: null };
        },
        async signInWithOtp({ email, options: o }) {
          server.calls.push(["otp", email, o]);
          const off = net();
          if (off) return off;
          if (!server.users.has(email)) return { data: {}, error: { status: 422, code: "otp_disabled", message: "Signups not allowed for otp" } };
          return { data: {}, error: null };
        },
        async resetPasswordForEmail(email, o) {
          server.calls.push(["reset", email, o]);
          return net() || { data: {}, error: null };
        },
        async updateUser(attrs) {
          server.calls.push(["updateUser"]);
          return net() || { data: { user: getSession() && getSession().user }, error: null };
        },
        async signInWithOAuth() {
          server.calls.push(["oauth"]);
          return { data: {}, error: null };
        },
        async resend(args) {
          server.calls.push(["resend", args && args.email, args && args.options]);
          return net() || (server.resendError ? { data: {}, error: server.resendError } : { data: {}, error: null });
        },
        async signOut() {
          server.calls.push(["signOut"]);
          ls.removeItem(storageKey);
          emit("SIGNED_OUT", null);
          return { error: null };
        },
      },
      async rpc(name, args) {
        server.calls.push(["rpc", name, args]);
        if (server.offline) return { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
        const s = getSession();
        if (!s) return { data: null, error: { code: "42501", message: "not authenticated" }, status: 401 };
        const uid = s.user.id;
        if (name === "mpdd_pull") return { data: server.pull(uid), error: null, status: 200 };
        if (name === "mpdd_push") {
          const r = server.push(uid, args.p_debts || [], args.p_settings || {});
          return r.error ? { data: null, error: r.error, status: 400 } : { data: r.data, error: null, status: 200 };
        }
        if (name === "mpdd_delete_my_data") return { data: server.deleteAll(uid), error: null, status: 200 };
        return { data: null, error: { code: "PGRST202", message: "not found" }, status: 404 };
      },
      from(table) {
        const uid = () => (getSession() ? getSession().user.id : null);
        const q = { table, filter: null, filters: [], op: "select", row: null, upsertOptions: null };
        const done = (result) => Promise.resolve(result);
        const b = {
          select() {
            return b;
          },
          eq(col, v) {
            q.filter = [col, v];
            q.filters.push([col, v]);
            return b;
          },
          upsert(row, opts) {
            q.op = "upsert";
            q.row = row;
            q.upsertOptions = opts || null;
            return b;
          },
          delete() {
            q.op = "delete";
            return b;
          },
          run() {
            server.calls.push(["table", table, q.op, q.upsertOptions]);
            if (server.offline) return { data: null, error: { message: "Failed to fetch" } };
            if (table === "push_subscriptions" || table === "push_settings") {
              const me = uid();
              if (!me) return { data: null, error: { code: "42501", message: "rls" } };
              return server.pushTable(table, q.op, q.row, q.filters, me);
            }
            if (table === "membresias") {
              // 2.1: solo lectura de la fila propia (RLS); nada se escribe desde el navegador.
              const me = uid();
              if (!me) return { data: null, error: { code: "42501", message: "rls" } };
              if (q.op !== "select") return { data: null, error: { code: "42501", message: "new row violates row-level security" } };
              const r = server.memberships.get(me);
              return { data: r ? JSON.parse(JSON.stringify(r)) : null, error: null };
            }
            if (table === "gastos_fijos") {
              const me = uid();
              if (!me) return { data: null, error: { code: "42501", message: "rls" } };
              return server.gastosTable(q.op, q.row, q.filters, me);
            }
            if (table !== "debt_plans") return { data: null, error: { code: "42P01", message: "no table" } };
            const me = uid();
            if (!me) return { data: null, error: { code: "42501", message: "rls" } };
            if (q.op === "upsert") {
              if (q.row.user_id !== me) return { data: null, error: { code: "42501", message: "new row violates row-level security" } };
              const r = q.row;
              const okCur = (c) => c === "USD" || c === "COP" || c === "EUR";
              if (!okCur(r.income_currency) || !okCur(r.plan_currency) || !["avalanche", "snowball"].includes(r.method) || (r.fx_rate === null) !== (r.fx_type === null) || (r.fx_type !== null && !["oficial", "personalizada"].includes(r.fx_type)) || !(r.income >= 0) || !(r.extra >= 0)) return { data: null, error: { code: "23514", message: "check violation" } };
              const prev = server.plans.get(me);
              const row = Object.assign({}, r, { created_at: prev ? prev.created_at : new Date().toISOString(), updated_at: new Date().toISOString() });
              server.plans.set(me, JSON.parse(JSON.stringify(row)));
              return { data: JSON.parse(JSON.stringify(row)), error: null };
            }
            if (q.op === "delete") {
              if (q.filter && q.filter[1] === me) server.plans.delete(me);
              return { data: null, error: null };
            }
            const row = q.filter && q.filter[1] === me ? server.plans.get(me) : null;
            return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
          },
          maybeSingle() {
            return done(b.run());
          },
          single() {
            return done(b.run());
          },
          then(res, rej) {
            return done(b.run()).then(res, rej);
          },
        };
        return b;
      },
      functions: {
        async invoke(name, o) {
          server.calls.push(["fn", name, o]);
          if (!server.functionDeployed) return { data: null, error: { message: "not found" } };
          const s = getSession();
          if (!s) return { data: null, error: { message: "unauthorized" } };
          for (const [email, u] of server.users) if (u.id === s.user.id) server.users.delete(email);
          return { data: { deleted: true }, error: null };
        },
      },
    };
    created.push(client);
    return client;
  }
  return { createClient, created };
}

module.exports = { FakeServer, createFakeLib };
