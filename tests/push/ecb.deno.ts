// Run: cd tests/push && deno run --allow-env --allow-read ecb.deno.ts
import { parseEcb } from "../../supabase/functions/tasa-euro/index.ts";
const xml = `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope><Cube><Cube time='2026-11-18'><Cube currency='USD' rate='1.0512'/><Cube currency='JPY' rate='162.10'/></Cube></Cube></gesmes:Envelope>`;
const r = parseEcb(xml);
if (r.fecha !== "2026-11-18" || r.usdPorEur !== 1.0512) throw new Error("lectura del BCE incorrecta " + JSON.stringify(r));
let failed = false;
try { parseEcb("<html>error</html>"); } catch (_) { failed = true; }
if (!failed) throw new Error("debía fallar con un XML inválido");
failed = false;
try { parseEcb(xml.replace("1.0512", "99")); } catch (_) { failed = true; }
if (!failed) throw new Error("debía rechazar una tasa fuera de rango");
console.log("OK: lectura de la tasa del euro (BCE)");
