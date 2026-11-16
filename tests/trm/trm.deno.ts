/* Prueba de la función "trm" con Deno, sin red: API y tabla simuladas.
   Ejecutar desde tests/trm:  deno run --allow-env --import-map=map.json trm.deno.ts */
import { db } from "./fake-sb.ts";
let handler: any;
(Deno as any).serve = (h: any) => { handler = h; };
Deno.env.set("SUPABASE_URL", "https://x.supabase.co"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only");
let mode = "ok"; let seenUrl = "";
globalThis.fetch = (async (u: string) => {
  seenUrl = String(u);
  if (mode === "down") throw new Error("network");
  if (mode === "500") return new Response("x", { status: 500 });
  return new Response(JSON.stringify([{ valor: "3912.45", unidad: "COP", vigenciadesde: "2026-11-14T00:00:00.000", vigenciahasta: "2026-11-17T00:00:00.000" }]), { status: 200 });
}) as any;
await import("../../supabase/functions/trm/index.ts");
const call = async () => { const r = await handler(new Request("https://f/trm")); return [r.status, await r.json()]; };
const assert = (c: boolean, m: string) => { if (!c) { console.error("FALLA:", m); Deno.exit(1); } };
let [st, body]: any = await call();
assert(st === 200 && body.valor === 3912.45 && body.desactualizada === false, "API ok");
assert(seenUrl.includes("vigenciadesde") && seenUrl.includes("32sa-8pi3"), "consulta la API oficial");
console.log("1 api ok:", JSON.stringify(body));
mode = "down"; [st, body] = await call(); assert(st === 200 && body.desactualizada === false, "usa la guardada de hoy"); console.log("2 guardada hoy:", JSON.stringify(body));
db.rows = [{ fecha: "2026-11-10", valor: 3900, fuente: "Superintendencia Financiera de Colombia" }];
[st, body] = await call(); assert(st === 200 && body.desactualizada === true && body.fecha === "2026-11-10", "API caída: última guardada desactualizada"); console.log("3 desactualizada:", JSON.stringify(body));
db.rows = []; mode = "500"; [st, body] = await call(); assert(st === 503, "sin TRM: 503"); console.log("4 sin datos:", st);
console.log("5 OPTIONS:", (await handler(new Request("https://f/trm", { method: "OPTIONS" }))).status, "DELETE:", (await handler(new Request("https://f/trm", { method: "DELETE" }))).status);
console.log("OK: todas las pruebas de la función trm pasaron");
