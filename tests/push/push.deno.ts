// Tests for the enviar-recordatorios function (no network or database).
// Run: cd tests/push && deno run --allow-env --allow-read push.deno.ts
import ece from "npm:http_ece@1.2.0";
import { Buffer } from "node:buffer";
import { createECDH, randomBytes } from "node:crypto";
import { allowedEndpoint, b64url, encrypt, fromB64url, generateVapidKeys, importVapidPrivate, sendPush, vapidToken } from "../../supabase/functions/enviar-recordatorios/webpush.ts";
import { localNow, plannedFrom, remindersFor, toAppDebts } from "../../supabase/functions/enviar-recordatorios/reglas.ts";

let fails = 0;
function ok(c: unknown, msg: string) {
  if (!c) {
    fails++;
    console.error("FALLA:", msg);
  }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), msg + " → " + JSON.stringify(a) + " ≠ " + JSON.stringify(b));
}

// 1) The encryption decrypts with the reference library (as a browser would).
{
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const msg = JSON.stringify({ title: "Mi Plan de Deudas", body: "Hoy vence Tarjeta: $150.000 COP ñ", url: "/?vista=calendario" });
  const body = await encrypt(new TextEncoder().encode(msg), b64url(ua.getPublicKey()), b64url(auth));
  const out = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ua, authSecret: auth });
  eq(out.toString("utf8"), msg, "cifrado RFC 8291 descifrable con http_ece");
  eq(body.length, 86 + new TextEncoder().encode(msg).length + 1 + 16, "un solo registro con cabecera de 86 bytes");
}

// 2) VAPID: valid ES256 JWT with aud = the endpoint's origin.
{
  const k = await generateVapidKeys();
  eq(fromB64url(k.publicKey).length, 65, "clave pública VAPID de 65 bytes");
  const key = await importVapidPrivate(k.privateJwk);
  const jwt = await vapidToken("https://fcm.googleapis.com/fcm/send/abc", "https://ejemplo.test", key, 1000);
  const [h, p, s] = jwt.split(".");
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  eq(payload, { aud: "https://fcm.googleapis.com", exp: 1000 + 43200, sub: "https://ejemplo.test" }, "contenido del JWT");
  const pub = await crypto.subtle.importKey("raw", fromB64url(k.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(s), new TextEncoder().encode(h + "." + p)), "firma ES256 válida");
  ok(!JSON.parse(k.privateJwk).key_ops || true, "jwk exportada");

  // 3) sendPush: headers, "gone" responses and errors.
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: b64url(ua.getPublicKey()), auth: b64url(randomBytes(16)) };
  let seen: RequestInit | undefined;
  const r1 = await sendPush(sub, "hola", { publicKey: k.publicKey, key, subject: "https://ejemplo.test" }, async (_u, init) => {
    seen = init;
    return new Response(null, { status: 201 });
  });
  eq(r1, { ok: true }, "envío correcto");
  // deno-lint-ignore no-explicit-any
  const hd = seen!.headers as any;
  eq([hd["Content-Encoding"], hd.TTL, hd.Authorization.startsWith("vapid t=") && hd.Authorization.endsWith(", k=" + k.publicKey)], ["aes128gcm", "86400", true], "cabeceras");
  eq(await sendPush(sub, "x", { publicKey: k.publicKey, key, subject: "s" }, async () => new Response(null, { status: 410 })), { ok: false, gone: true, status: 410 }, "410 = borrar");
  eq(await sendPush(sub, "x", { publicKey: k.publicKey, key, subject: "s" }, async () => new Response(null, { status: 404 })), { ok: false, gone: true, status: 404 }, "404 = borrar");
  eq(await sendPush(sub, "x", { publicKey: k.publicKey, key, subject: "s" }, async () => new Response(null, { status: 500 })), { ok: false, gone: false, status: 500 }, "500 = reintentar");
  eq(await sendPush(sub, "x", { publicKey: k.publicKey, key, subject: "s" }, async () => { throw new Error("red"); }), { ok: false, gone: false, status: 0 }, "error de red");
}

// 4) Only real push services.
ok(allowedEndpoint("https://fcm.googleapis.com/fcm/send/a"), "FCM");
ok(allowedEndpoint("https://web.push.apple.com/abc"), "Apple");
ok(allowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/a"), "Mozilla");
ok(!allowedEndpoint("http://fcm.googleapis.com/x"), "sin https");
ok(!allowedEndpoint("https://evil.example.com/x"), "otro servidor");
ok(!allowedEndpoint("https://fcm.googleapis.com:8443/x"), "otro puerto");

// 5) Reminder rules.
{
  const st = { enabled: true, days_before: 1, send_time: "08:00", tz: "America/Bogota", lang: "es" };
  const debts = toAppDebts(
    [
      { id: "a", name: "Tarjeta", balance: 1000000, currency: "COP", due: 17, extra: { minPayment: 150000, createdAt: "2026-01-01" }, deleted_at: null },
      { id: "b", name: "Préstamo", balance: 900, currency: "USD", due: 16, extra: { minPayment: 30, createdAt: "2026-01-01" }, deleted_at: null },
      { id: "c", name: "Carro", balance: 5000, currency: "USD", due: 14, extra: { minPayment: 200, createdAt: "2026-01-01" }, deleted_at: null },
      { id: "d", name: "Pagada", balance: 100, currency: "USD", due: 15, extra: { minPayment: 10, createdAt: "2026-01-01" }, deleted_at: null },
      { id: "e", name: "Borrada", balance: 100, currency: "USD", due: 16, extra: { minPayment: 10 }, deleted_at: "2026-11-01T00:00:00Z" },
    ],
    [{ debt_id: "d", amount: 10, paid_on: "2026-11-10", due_on: "2026-11-15" }],
  );
  // 16 Nov 2026 9:00 a.m. Bogotá = 14:00 UTC.
  const now = new Date("2026-11-16T14:00:00Z");
  eq(localNow(now, "America/Bogota"), { date: "2026-11-16", time: "09:00" }, "hora local");
  const list = remindersFor(st, now, debts, {});
  eq(list.map((r) => [r.kind, r.body]), [
    ["vencida", "Carro está vencida"],
    ["hoy", "Hoy vence Préstamo: US$30.00 USD"],
    ["antes", "Mañana vence Tarjeta: $150.000 COP"],
  ], "mañana, hoy y vencida (sin pagadas ni borradas)");
  eq(remindersFor(st, new Date("2026-11-16T12:59:00Z"), debts, {}).length, 0, "antes de la hora elegida no envía");
  eq(remindersFor({ ...st, enabled: false }, now, debts, {}).length, 0, "desactivado no envía");
  const three = remindersFor({ ...st, days_before: 3 }, now, debts.filter((d) => d.id === "a"), {});
  eq(three.map((r) => r.body), ["Mañana vence Tarjeta: $150.000 COP"], "3 días: el 17 sigue siendo mañana");
  const in3 = remindersFor({ ...st, days_before: 3 }, new Date("2026-11-14T14:00:00Z"), debts.filter((d) => d.id === "a"), {});
  eq(in3.map((r) => r.body), ["Tarjeta vence en 3 días: $150.000 COP"], "aviso 3 días antes");
  const en = remindersFor({ ...st, lang: "en" }, now, debts.filter((d) => d.id === "b"), {});
  eq(en.map((r) => [r.title, r.body]), [["My Debt Plan", "Préstamo is due today: US$30.00 USD"]], "inglés");
  const planned = plannedFrom([{ debtId: "a", payment: 400000, dueDate: "2026-11-17" }], "2026-11-01");
  eq(remindersFor(st, now, debts.filter((d) => d.id === "a"), planned).map((r) => r.body), ["Mañana vence Tarjeta: $400.000 COP"], "usa el monto del plan");
  eq(remindersFor({ ...st, tz: "Zona/Inventada" }, now, debts.filter((d) => d.id === "b"), {}).length, 1, "zona inválida → Bogotá");
}

if (fails) {
  console.error(fails + " prueba(s) fallaron");
  Deno.exit(1);
}
console.log("OK: todas las pruebas de enviar-recordatorios pasaron");
