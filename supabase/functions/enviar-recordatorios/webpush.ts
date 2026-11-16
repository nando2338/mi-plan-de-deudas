// Web Push with WebCrypto only (no external libraries):
//  * RFC 8291: message encryption (aes128gcm) for the device's push service.
//  * RFC 8292: VAPID signature (ES256 JWT) that identifies our server.
// Works with Chrome/Android (FCM), Firefox (Mozilla) and Safari/iPhone (Apple).

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Bytes {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface VapidKeys {
  publicKey: string; // base64url of the uncompressed point (65 bytes): the browser's applicationServerKey
  privateJwk: string; // JWK JSON of the private key (kept in Supabase Vault only)
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64url(raw), privateJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) };
}

export async function importVapidPrivate(privateJwk: string): Promise<CryptoKey> {
  const jwk = JSON.parse(privateJwk);
  return await crypto.subtle.importKey("jwk", { ...jwk, ext: false, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/* VAPID JWT (RFC 8292). WebCrypto returns the ES256 signature as r||s, which is what JWT uses. */
export async function vapidToken(endpoint: string, subject: string, key: CryptoKey, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const data = enc.encode(header + "." + payload);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return header + "." + payload + "." + b64url(sig);
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/* RFC 8291 encryption, a single aes128gcm record. `testing` (optional) fixes the ephemeral
   key and the salt so tests are repeatable. */
export async function encrypt(
  plaintext: Bytes,
  p256dh: string,
  authSecret: string,
  testing?: { asKeys: CryptoKeyPair; salt: Bytes },
): Promise<Bytes> {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("p256dh inválida");
  if (auth.length !== 16) throw new Error("auth inválida");
  const as = testing?.asKeys ?? (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(plaintext, new Uint8Array([2])); // 0x02 = last (and only) record
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, padded));
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, ct);
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; status: number };

export async function sendPush(
  sub: Subscription,
  payload: string,
  vapid: { publicKey: string; key: CryptoKey; subject: string },
  fetchFn: typeof fetch = fetch,
): Promise<SendResult> {
  const body = await encrypt(enc.encode(payload), sub.p256dh, sub.auth);
  const jwt = await vapidToken(sub.endpoint, vapid.subject, vapid.key);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetchFn(sub.endpoint, {
      method: "POST",
      redirect: "manual",
      signal: ctl.signal,
      headers: {
        TTL: "86400",
        Urgency: "normal",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      },
      body,
    });
    await res.body?.cancel();
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status };
  } catch (_) {
    return { ok: false, gone: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/* Only real push services: avoids using the function to call arbitrary addresses. */
export function allowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port) return false;
    const h = u.hostname;
    return (
      h === "fcm.googleapis.com" ||
      h === "android.googleapis.com" ||
      h === "updates.push.services.mozilla.com" ||
      h.endsWith(".push.services.mozilla.com") ||
      h === "web.push.apple.com" ||
      h.endsWith(".push.apple.com") ||
      h.endsWith(".notify.windows.com")
    );
  } catch (_) {
    return false;
  }
}
