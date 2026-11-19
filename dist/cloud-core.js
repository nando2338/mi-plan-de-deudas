/* Pure cloud-sync helpers: normalization, hashing and merge planning.
   No browser storage, timers or network. Usable from Node for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MPDDCloudCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KNOWN = ["id", "name", "balance", "initial", "limit", "rate", "currency", "due", "source", "history"];
  const SETTINGS_KEYS = ["nando-recordatorios-v1", "deudas-lang-v1", "deudas-currency-pref-v1", "nando-deudas-sort-v1", "deudas-budget-v1"];
  const MAX = 90071992547409;
  const forbidden = new Set(["__proto__", "prototype", "constructor"]);

  function canon(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  // cyrb53: fast non-cryptographic 53-bit hash. Used only to detect changes.
  function hash(value) {
    if (value === null || value === undefined) return null;
    const str = typeof value === "string" ? "s:" + value : "o:" + canon(value);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ":" + str.length.toString(36);
  }
  const blank = (v) => v === null || v === undefined || v === "";
  const optNum = (v) => (blank(v) ? null : Number(v));
  function validDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));
    return y >= 1 && x.getUTCFullYear() === y && x.getUTCMonth() + 1 === m && x.getUTCDate() === d;
  }
  function extras(obj, known) {
    const out = {};
    for (const k of Object.keys(obj || {})) if (!known.includes(k) && !forbidden.has(k) && obj[k] !== undefined) out[k] = obj[k];
    return out;
  }

  /* Local debt record -> cloud representation (without id/timestamps). */
  function toRemote(d) {
    const dueRaw = blank(d.due) ? null : Number(d.due);
    return {
      name: typeof d.name === "string" ? d.name : String(d.name ?? ""),
      balance: Number(d.balance),
      initial: Number(d.initial),
      limit: optNum(d.limit),
      rate: optNum(d.rate),
      currency: d.currency,
      due: dueRaw,
      source: typeof d.source === "string" ? d.source : null,
      extra: extras(d, KNOWN),
      payments: (Array.isArray(d.history) ? d.history : []).map((h) => ({
        amount: Number(h && h.amount),
        paid_on: h && validDate(h.date) ? h.date : null,
        extra: extras(h, ["amount", "date"]),
      })),
    };
  }
  /* Cloud row -> local debt record, in the same shape the app writes. */
  function fromRemote(id, r) {
    const d = {
      id,
      history: (r.payments || []).map((p) => Object.assign(extras(p.extra, ["amount", "date"]), { amount: Number(p.amount), date: p.paid_on || "" })),
      name: r.name,
      balance: Number(r.balance),
      initial: Number(r.initial),
      limit: r.limit === null || r.limit === undefined ? null : Number(r.limit),
      rate: r.rate === null || r.rate === undefined ? null : Number(r.rate),
      currency: r.currency,
      due: r.due === null || r.due === undefined ? "" : String(r.due),
    };
    if (typeof r.source === "string") d.source = r.source;
    const ex = extras(r.extra, KNOWN);
    for (const k of Object.keys(ex)) d[k] = ex[k];
    return d;
  }
  /* Mirrors the CHECK constraints in supabase/schema.sql. */
  function problems(v) {
    const out = [];
    const money = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX;
    if (!v.name.trim() || v.name.length > 80) out.push("name");
    if (!money(v.balance) || !money(v.initial)) out.push("balance");
    if ((v.limit !== null && !money(v.limit)) || (v.rate !== null && !money(v.rate))) out.push("limitRate");
    if (!["USD", "COP", "EUR"].includes(v.currency)) out.push("currency");
    if (v.due !== null && !(Number.isInteger(v.due) && v.due >= 1 && v.due <= 31)) out.push("due");
    if (v.source !== null && v.source.length > 200) out.push("source");
    if (v.payments.length > 99999 || v.payments.some((p) => !(typeof p.amount === "number" && Number.isFinite(p.amount) && p.amount > 0 && p.amount <= MAX))) out.push("payments");
    try {
      if (canon(v.extra).length > 60000) out.push("extra");
    } catch (_) {
      out.push("extra");
    }
    return out;
  }
  const t = (iso) => {
    const n = Date.parse(iso || "");
    return Number.isFinite(n) ? n : 0;
  };

  /* Decide, per record, what to do.
     local:  Map id -> value (normalized) for records present on this device
     remote: Map id -> { value|null, updatedAt, deleted }
     state:  { id: { s: synced hash|null, r: remote updatedAt at last sync, l: local hash, t: local change time } }
     Returns [{ id, op, conflict, lh, rh, rt }]
       op: "sync" (already equal), "drop" (forget), "push", "pushDelete", "apply", "applyDelete" */
  function plan(local, remote, state, alive = (r) => r && !r.deleted) {
    const ids = new Set([...local.keys(), ...remote.keys(), ...Object.keys(state || {})]);
    const out = [];
    for (const id of ids) {
      const L = local.has(id) ? local.get(id) : null;
      const R = remote.get(id);
      const lh = L === null ? null : hash(L);
      const rAlive = !!alive(R);
      const rh = rAlive ? hash(R.value) : null;
      const rt = R ? R.updatedAt || null : null;
      const st = (state && state[id]) || null;
      const base = { id, lh, rh, rt, conflict: null };
      if (lh === rh) {
        out.push({ ...base, op: lh === null && !R ? "drop" : "sync" });
        continue;
      }
      const known = !!st && Object.prototype.hasOwnProperty.call(st, "s");
      // Row missing in the cloud (not a tombstone): never treat it as a delete.
      if (!R) {
        out.push({ ...base, op: lh === null ? "drop" : "push" });
        continue;
      }
      let localChanged = known ? lh !== st.s : lh !== null;
      let remoteChanged = known ? rt !== st.r : rAlive;
      if (!localChanged && !remoteChanged) localChanged = remoteChanged = true;
      let side;
      if (localChanged && !remoteChanged) side = "local";
      else if (!localChanged && remoteChanged) side = "remote";
      else {
        side = t(st && st.t) > t(rt) ? "local" : "remote";
        base.conflict = side;
      }
      if (side === "local") out.push({ ...base, op: lh === null ? "pushDelete" : "push" });
      else out.push({ ...base, op: rh === null ? "applyDelete" : "apply" });
    }
    return out;
  }
  const settingAlive = (r) => r && r.value !== null && r.value !== undefined;

  return { KNOWN, SETTINGS_KEYS, canon, hash, toRemote, fromRemote, problems, plan, settingAlive, validDate };
});
