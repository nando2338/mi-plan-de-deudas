// Supabase Edge Function: trm
// Devuelve la TRM (pesos colombianos por 1 dólar) certificada por la
// Superintendencia Financiera de Colombia, tomada del portal de datos abiertos
// https://www.datos.gov.co/resource/32sa-8pi3.json (campos valor, vigenciadesde, vigenciahasta).
//
//  a) Busca la TRM de hoy (hora de Colombia) en la tabla public.exchange_rates.
//  b) Si no está, la consulta en la API, la guarda y la devuelve.
//  c) Si la API falla, devuelve la última TRM guardada con "desactualizada": true.
//
// La TRM es un dato público: la función responde sin sesión (desplegada con
// verify_jwt = false) y no lee ni devuelve datos de usuarios. Escribe en
// exchange_rates con la clave de servicio que Supabase pone en el servidor
// (SUPABASE_SERVICE_ROLE_KEY); esa clave nunca está en el repositorio ni en la app.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const API = "https://www.datos.gov.co/resource/32sa-8pi3.json";
const SOURCE = "Superintendencia Financiera de Colombia";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });
}
// Fecha de hoy en Colombia (UTC-5, sin horario de verano).
function todayBogota(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function parseValor(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 100 && n <= 100000 ? Math.round(n * 100) / 100 : null;
}
// After a failed lookup, wait 5 minutes before asking datos.gov.co again (per instance),
// so repeated public calls cannot hammer the open-data API.
let lastFailure = 0;
const RETRY_MS = 5 * 60 * 1000;
const day = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

async function fromApi(today: string) {
  const t = `${today}T00:00:00.000`;
  const url = `${API}?$where=${encodeURIComponent(`vigenciadesde <= '${t}' AND vigenciahasta >= '${t}'`)}&$order=${encodeURIComponent("vigenciadesde DESC")}&$limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("api_status_" + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error("api_sin_registro_vigente");
  const r = rows[0];
  const valor = parseValor(r.valor);
  if (valor === null) throw new Error("api_valor_invalido");
  return { valor, vigencia_desde: day(r.vigenciadesde), vigencia_hasta: day(r.vigenciahasta) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const today = todayBogota();

  // a) Today's TRM already stored?
  const { data: stored } = await admin.from("exchange_rates").select("fecha, valor, fuente, vigencia_desde, vigencia_hasta").eq("fecha", today).maybeSingle();
  if (stored) return json({ ...out(stored), desactualizada: false }, 200, 600);

  // b) Ask the open-data API and store it.
  try {
    if (Date.now() - lastFailure < RETRY_MS) throw new Error("reintento_en_espera");
    const r = await fromApi(today);
    const row = { fecha: today, valor: r.valor, fuente: SOURCE, vigencia_desde: r.vigencia_desde, vigencia_hasta: r.vigencia_hasta };
    await admin.from("exchange_rates").upsert(row, { onConflict: "fecha", ignoreDuplicates: true });
    return json({ ...out(row), desactualizada: false }, 200, 600);
  } catch (e) {
    if (!(e instanceof Error && e.message === "reintento_en_espera")) lastFailure = Date.now();
    // c) API failed: last stored TRM, flagged as outdated.
    const { data: last } = await admin.from("exchange_rates").select("fecha, valor, fuente, vigencia_desde, vigencia_hasta").order("fecha", { ascending: false }).limit(1).maybeSingle();
    if (last) return json({ ...out(last), desactualizada: true }, 200, 60);
    return json({ error: "trm_no_disponible" }, 503);
  }
});

function out(r: { fecha: string; valor: number | string; fuente: string; vigencia_desde?: string | null; vigencia_hasta?: string | null }) {
  return { fecha: r.fecha, valor: Number(r.valor), fuente: r.fuente, vigenciaDesde: r.vigencia_desde ?? null, vigenciaHasta: r.vigencia_hasta ?? null };
}
