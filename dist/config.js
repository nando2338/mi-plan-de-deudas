/*
 * Configuración de la nube (Supabase). OPCIONAL.
 *
 * Mientras estos valores sean los marcadores de posición, la app funciona
 * exactamente igual que antes: sin cuentas y sin ninguna conexión de red.
 *
 * Reemplaza SOLO estos dos valores (Supabase → Project Settings → API):
 *   1. supabaseUrl  → "Project URL", por ejemplo https://abcdefghijkl.supabase.co
 *   2. supabaseKey  → la clave PÚBLICA: "publishable" (sb_publishable_...) o "anon public".
 *
 * NUNCA pongas aquí la clave "service_role" ni una "secret" (sb_secret_...).
 * Este archivo es público: cualquiera que visite la página puede leerlo.
 * La app se niega a usar una clave secreta si la detecta.
 */
window.MPDD_CONFIG = Object.freeze({
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabaseKey: "TU_CLAVE_PUBLICA",
  // Cámbialo a true solo cuando hayas activado Google en Supabase → Authentication → Providers.
  googleEnabled: false
});
