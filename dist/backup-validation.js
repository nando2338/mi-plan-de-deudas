/* Pure, non-destructive backup validation. Never writes to browser storage. */
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const forbidden = new Set(['__proto__','prototype','constructor']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function inspectTree(value, depth = 0, count = {n:0}) {
  if (++count.n > 150000 || depth > 24) throw new Error('El archivo es demasiado complejo.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número no válido.');
  if (typeof value === 'string' && value.length > 100000) throw new Error('Texto demasiado largo.');
  if (value && typeof value === 'object') for (const key of Object.keys(value)) {
    if (forbidden.has(key)) throw new Error('El archivo contiene una propiedad no permitida.');
    inspectTree(value[key], depth + 1, count);
  }
}
function validateBackup(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('Archivo vacío, inválido o demasiado grande.');
  let data; try { data = JSON.parse(raw); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  inspectTree(data);
  if (!isObject(data) || data.version !== 1 || !Array.isArray(data.debts) || data.debts.length > 5000) throw new Error('Formato de respaldo no compatible.');
  const ids = new Set();
  for (const d of data.debts) {
    if (!isObject(d) || typeof d.id !== 'string' || !d.id.trim() || d.id.length > 200 || ids.has(d.id)) throw new Error('Identificador de deuda inválido o duplicado.');
    ids.add(d.id);
    if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 200 || !['USD','COP','EUR'].includes(d.currency)) throw new Error('Nombre o moneda inválidos.');
    for (const field of ['balance','initial']) if (typeof d[field] !== 'number' || !Number.isFinite(d[field]) || d[field] < 0 || d[field] > Number.MAX_SAFE_INTEGER / 100) throw new Error('Saldo inválido.');
    for (const field of ['limit','rate']) if (d[field] != null && d[field] !== '' && (typeof d[field] !== 'number' || !Number.isFinite(d[field]) || d[field] < 0 || d[field] > Number.MAX_SAFE_INTEGER / 100)) throw new Error('Límite o tasa inválidos.');
    if (d.history !== undefined && !Array.isArray(d.history)) throw new Error('Historial inválido.');
    if (Array.isArray(d.history)) for (const h of d.history) if (!isObject(h) || typeof h.amount !== 'number' || !Number.isFinite(h.amount) || h.amount <= 0 || typeof h.date !== 'string') throw new Error('Registro de pago inválido.');
  }
  return { debts: data.debts, count: data.debts.length, raw };
}
async function digestBackup(raw) {
  if (!globalThis.crypto?.subtle) throw new Error('Verificación de integridad no disponible.');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}

globalThis.DebtBackup={validateBackup,digestBackup,MAX_BACKUP_BYTES};
