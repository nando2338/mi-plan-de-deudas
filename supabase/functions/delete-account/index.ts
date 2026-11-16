// Supabase Edge Function: delete-account
// Borra la cuenta del usuario que hace la llamada (y, por "on delete cascade",
// todas sus filas en debts, payments y user_settings).
//
// Por qué hace falta: borrar un usuario de auth.users requiere la clave
// service_role, que NUNCA puede estar en el navegador. Esta función corre en
// el servidor de Supabase, donde SUPABASE_SERVICE_ROLE_KEY ya está disponible
// como variable de entorno (no hay que copiarla en ningún archivo).
//
// Seguridad:
//   * Solo borra al usuario dueño del token (JWT) recibido; no acepta ids.
//   * Exige { "confirm": true } en el cuerpo.
//   * ALLOWED_ORIGINS (opcional): lista separada por comas de orígenes
//     permitidos, por ejemplo "https://midominio.com". Si no se define, se
//     acepta cualquier origen (el token sigue siendo obligatorio).
//
// Despliegue (cuando decidas activarla): ver README.md, sección "Eliminar cuenta".
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function cors(origin: string | null): Record<string, string> {
  const allow = allowed.length === 0 ? "*" : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (allowed.length && (!origin || !allowed.includes(origin))) return json({ error: "origin_not_allowed" }, 403, origin);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401, origin);

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  if (body.confirm !== true) return json({ error: "confirmation_required" }, 400, origin);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Validate the caller's token with the Auth server and get *their* id.
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401, origin);
  const uid = userData.user.id;

  // Explicit cleanup first (cascade would also remove these rows).
  // Best effort: every table has "on delete cascade" to auth.users, so deleting the user
  // below removes any row that remains (the service key has no direct access to some tables).
  for (const table of ["payments", "debts", "user_settings", "debt_plans", "push_subscriptions", "push_settings"]) {
    await admin.from(table).delete().eq("user_id", uid);
  }
  const { error: delError } = await admin.auth.admin.deleteUser(uid);
  if (delError) return json({ error: "delete_failed" }, 500, origin);

  // No personal data in logs.
  return json({ deleted: true }, 200, origin);
});
