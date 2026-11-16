/* In-memory stand-in for supabase-js + the RPCs in supabase/schema.sql.
   Mirrors the server rules (versions, tombstones, per-key settings, CHECK constraints)
   so the client sync logic can be tested without any network. */
"use strict";

const ALLOWED = ["nando-recordatorios-v1", "deudas-lang-v1", "deudas-currency-pref-v1", "nando-deudas-sort-v1", "deudas-budget-v1"];
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
    this.plans = new Map(); // uid -> debt_plans row (RLS: own row only)
    this.trm = { status: 200, body: { fecha: "2026-11-15", valor: 4000, fuente: "Superintendencia Financiera de Colombia", desactualizada: false } };
    this.trmCalls = 0;
    this.seq = 0;
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
    if (!["USD", "COP"].includes(d.currency)) return false;
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
          const session = { access_token: "fake-token-" + u.id, user: { id: u.id, email } };
          ls.setItem(storageKey, JSON.stringify(session));
          emit("SIGNED_IN", session);
          return { data: { session, user: session.user }, error: null };
        },
        async signUp({ email, password, options: o }) {
          server.calls.push(["signUp", email, o && o.data]);
          const off = net();
          if (off) return off;
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
        const q = { table, filter: null, op: "select", row: null };
        const done = (result) => Promise.resolve(result);
        const b = {
          select() {
            return b;
          },
          eq(col, v) {
            q.filter = [col, v];
            return b;
          },
          upsert(row) {
            q.op = "upsert";
            q.row = row;
            return b;
          },
          delete() {
            q.op = "delete";
            return b;
          },
          run() {
            server.calls.push(["table", table, q.op]);
            if (server.offline) return { data: null, error: { message: "Failed to fetch" } };
            if (table !== "debt_plans") return { data: null, error: { code: "42P01", message: "no table" } };
            const me = uid();
            if (!me) return { data: null, error: { code: "42501", message: "rls" } };
            if (q.op === "upsert") {
              if (q.row.user_id !== me) return { data: null, error: { code: "42501", message: "new row violates row-level security" } };
              const r = q.row;
              const okCur = (c) => c === "USD" || c === "COP";
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
