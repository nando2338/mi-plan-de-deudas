// Supabase Edge Function: enviar-recordatorios (version 1.4)
//
//  GET                                  → { publicKey } VAPID public key for the browser.
//  POST {"accion":"prueba"}  + user JWT → test notification to all of the user's devices.
//  POST {"accion":"programado"} + header x-cron-secret → scheduled send (pg_cron every 15 min):
//     "Mañana vence [deuda]: [monto]", "Hoy vence [deuda]: [monto]", "[Deuda] está vencida",
//     from the time each user chose (in their time zone) and only once per installment.
//
// Security:
//  * Deployed with verify_jwt = false because pg_cron calls it without a user session. It does its
//    own checks: the cron secret lives in Vault (public.mpdd_push_cron_ok) and the test send
//    validates the user's token with Auth.
//  * The private VAPID key is generated here the first time and saved ONLY in Supabase Vault
//    (public.mpdd_push_store_keys). It is never in the code or the repository.
//  * Subscriptions that no longer work (404/410) are deleted.
//  * It does not log personal or financial data. It does not send email.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { allowedEndpoint, generateVapidKeys, importVapidPrivate, sendPush } from "./webpush.ts";
import { plannedFrom, remindersFor, texts, toAppDebts } from "./reglas.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://glistening-youtiao-b5f1d2.netlify.app";
const MAX_PER_USER = 6;

function json(body: unknown, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let vapidCache: { publicKey: string; key: CryptoKey; subject: string } | null = null;
async function vapid() {
  if (vapidCache) return vapidCache;
  let { data, error } = await admin.rpc("mpdd_push_keys");
  if (error) throw new Error("keys");
  if (!data?.private || !data?.public) {
    const fresh = await generateVapidKeys();
    ({ data, error } = await admin.rpc("mpdd_push_store_keys", { p_public: fresh.publicKey, p_private: fresh.privateJwk }));
    if (error || !data?.private) throw new Error("keys");
  }
  vapidCache = { publicKey: data.public, key: await importVapidPrivate(data.private), subject: SUBJECT };
  return vapidCache;
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/* Sends a message to all of a user's devices. Deletes the ones that no longer exist. */
async function sendToUser(subs: SubRow[], payload: string) {
  const v = await vapid();
  let sent = 0,
    removed = 0;
  for (const s of subs) {
    if (!allowedEndpoint(s.endpoint)) {
      await admin.from("push_subscriptions").delete().eq("id", s.id);
      removed++;
      continue;
    }
    const r = await sendPush(s, payload, v);
    if (r.ok) {
      sent++;
      await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } else if (r.gone) {
      await admin.from("push_subscriptions").delete().eq("id", s.id);
      removed++;
    }
  }
  return { sent, removed };
}

async function testSend(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u?.user) return json({ error: "unauthorized" }, 401);
  const uid = u.user.id;
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", uid);
  if (!subs?.length) return json({ error: "sin_suscripciones" }, 404);
  const { data: st } = await admin.from("push_settings").select("lang").eq("user_id", uid).maybeSingle();
  const en = st?.lang === "en";
  const payload = JSON.stringify({
    title: texts(st?.lang || "es").title,
    body: en ? "Test notification: this is how your payment reminders will look." : "Notificación de prueba: así se verán tus recordatorios de pago.",
    url: "/?vista=calendario",
    tag: "mpdd-prueba",
  });
  const r = await sendToUser(subs as SubRow[], payload);
  return json({ ok: true, enviadas: r.sent, borradas: r.removed });
}

async function scheduled(req: Request) {
  const secret = req.headers.get("x-cron-secret") || "";
  const { data: okSecret } = await admin.rpc("mpdd_push_cron_ok", { p_secret: secret });
  if (okSecret !== true) return json({ error: "unauthorized" }, 401);
  await admin.rpc("mpdd_push_prune");
  const now = new Date();
  const { data: settings, error } = await admin.from("push_settings").select("user_id,enabled,days_before,send_time,tz,lang").eq("enabled", true);
  if (error) return json({ error: "settings" }, 500);
  let users = 0,
    sent = 0,
    removed = 0;
  for (const st of settings || []) {
    const uid = st.user_id as string;
    const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", uid);
    if (!subs?.length) continue;
    const [{ data: debts }, { data: pays }, { data: plan }] = await Promise.all([
      admin.from("debts").select("id,name,balance,currency,due,extra,deleted_at").eq("user_id", uid),
      admin.from("payments").select("debt_id,amount,paid_on,due_on").eq("user_id", uid),
      admin.from("debt_plans").select("items,plan_month").eq("user_id", uid).maybeSingle(),
    ]);
    const list = remindersFor(st, now, toAppDebts(debts || [], pays || []), plannedFrom(plan?.items, plan?.plan_month)).slice(0, MAX_PER_USER);
    if (!list.length) continue;
    users++;
    let live = subs as SubRow[];
    for (const r of list) {
      const { data: first } = await admin.rpc("mpdd_push_mark", { p_user: uid, p_debt: r.debtId, p_due: r.dueDate, p_kind: r.kind });
      if (first !== true) continue; // already sent before
      const res = await sendToUser(live, JSON.stringify({ title: r.title, body: r.body, url: "/?vista=calendario", tag: r.tag }));
      sent += res.sent;
      removed += res.removed;
      if (res.removed) {
        const { data: again } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", uid);
        live = (again || []) as SubRow[];
      }
      // Not delivered to any device (e.g. the push service is down): retry on the next run.
      if (res.sent === 0 && live.length) await admin.rpc("mpdd_push_unmark", { p_user: uid, p_debt: r.debtId, p_due: r.dueDate, p_kind: r.kind });
      if (!live.length) break;
    }
  }
  // Counts only, no personal data.
  console.log(JSON.stringify({ accion: "programado", usuarios: users, enviadas: sent, borradas: removed }));
  return json({ ok: true, usuarios: users, enviadas: sent, borradas: removed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") return json({ publicKey: (await vapid()).publicKey }, 200, 3600);
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body: { accion?: unknown } = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }
    if (body.accion === "prueba") return await testSend(req);
    if (body.accion === "programado") return await scheduled(req);
    return json({ error: "accion" }, 400);
  } catch (_) {
    return json({ error: "server" }, 500);
  }
});
