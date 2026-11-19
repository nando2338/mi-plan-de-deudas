// Supabase Edge Function: tasa-euro (versión 1.8)
// Returns the euro reference rate (US dollars per 1 euro) from the European
// Central Bank, a free and official source, published on business days at about 16:00 CET:
// https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
//
//  a) If a rate was saved less than 6 hours ago, return it.
//  b) Otherwise, query the ECB, store it in public.exchange_rates_eur and return it.
//  c) If the ECB does not respond, return the last stored one with "desactualizada": true.
// EUR↔COP is computed in the app via the dollar (ECB euro × TRM).
//
// Public data: responds without a session (verify_jwt = false) and reads no user data.
// It writes with the service key that Supabase puts on the server (never in the repo).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const SOURCE = "Banco Central Europeo";
const FRESH_MS = 6 * 3600 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
let lastFailure = 0;

function json(body: unknown, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });
}

/* Reads the date and the USD rate from the ECB XML (<Cube time='…'> and <Cube currency='USD' rate='…'/>). */
export function parseEcb(xml: string): { fecha: string; usdPorEur: number } {
  const time = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml);
  const usd = /<Cube\s+currency=['"]USD['"]\s+rate=['"]([0-9.]+)['"]/.exec(xml);
  if (!time || !usd) throw new Error("bce_formato");
  const rate = Number(usd[1]);
  if (!(rate >= 0.2 && rate <= 5)) throw new Error("bce_valor_invalido");
  return { fecha: time[1], usdPorEur: rate };
}

function out(r: { fecha: string; usd_por_eur: number | string; fuente: string }, desactualizada: boolean) {
  return { fecha: r.fecha, usdPorEur: Number(r.usd_por_eur), fuente: r.fuente, desactualizada };
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: last } = await admin.from("exchange_rates_eur").select("fecha, usd_por_eur, fuente, creado").order("fecha", { ascending: false }).limit(1).maybeSingle();
    // a) Recent enough.
    if (last && Date.now() - Date.parse(last.creado) < FRESH_MS) return json(out(last, false), 200, 600);
    // b) Ask the ECB.
    try {
      if (Date.now() - lastFailure < RETRY_MS) throw new Error("reintento_en_espera");
      const res = await fetch(ECB, { headers: { Accept: "application/xml" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error("bce_status_" + res.status);
      const r = parseEcb(await res.text());
      const row = { fecha: r.fecha, usd_por_eur: r.usdPorEur, fuente: SOURCE };
      // Same date already stored: refresh "creado" so it is not asked again for 6 hours.
      await admin.from("exchange_rates_eur").upsert({ ...row, creado: new Date().toISOString() }, { onConflict: "fecha" });
      return json(out(row, false), 200, 600);
    } catch (e) {
      if (!(e instanceof Error && e.message === "reintento_en_espera")) lastFailure = Date.now();
      // c) Last stored, flagged as outdated (the app shows its date).
      if (last) return json(out(last, true), 200, 60);
      return json({ error: "tasa_euro_no_disponible" }, 503);
    }
  });
}
