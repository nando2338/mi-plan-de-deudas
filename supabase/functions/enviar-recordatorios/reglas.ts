// Which reminders to send to a user right now. Pure logic (no network or database),
// so it can be tested. Reuses the app's own installment logic (schedule-core.js),
// so the server and the Calendario agree on dates, amounts and states.
import "./schedule-core.js";
import "./money.js";

// deno-lint-ignore no-explicit-any
const S = (globalThis as any).MPDDSchedule;
// deno-lint-ignore no-explicit-any
const M = (globalThis as any).MPDDMoney;

export interface Settings {
  enabled: boolean;
  days_before: number;
  send_time: string;
  tz: string;
  lang: string;
}
export interface DebtRow {
  id: string;
  name: string;
  balance: number | string | null;
  currency: string;
  due: number | null;
  extra: Record<string, unknown> | null;
  deleted_at: string | null;
}
export interface PaymentRow {
  debt_id: string;
  amount: number | string;
  paid_on: string | null;
  due_on: string | null;
}
export interface PlanItem {
  debtId?: string;
  payment?: number;
  dueDate?: string;
}
export interface Reminder {
  debtId: string;
  dueDate: string;
  kind: "antes" | "manana" | "hoy" | "vencida";
  title: string;
  body: string;
  tag: string;
}

/* Local date (YYYY-MM-DD) and time (HH:MM) in the user's time zone. */
export function localNow(now: Date, tz: string): { date: string; time: string } {
  let zone = tz;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch (_) {
    zone = "America/Bogota";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

const TEXT = {
  es: {
    title: "Mi Plan de Deudas",
    tomorrow: (n: string, m: string) => `Mañana vence ${n}: ${m}`,
    inDays: (n: string, d: number, m: string) => `${n} vence en ${d} días: ${m}`,
    today: (n: string, m: string) => `Hoy vence ${n}: ${m}`,
    todayNoAmount: (n: string) => `Hoy vence ${n}`,
    tomorrowNoAmount: (n: string) => `Mañana vence ${n}`,
    inDaysNoAmount: (n: string, d: number) => `${n} vence en ${d} días`,
    overdue: (n: string) => `${n} está vencida`,
  },
  en: {
    title: "My Debt Plan",
    tomorrow: (n: string, m: string) => `${n} is due tomorrow: ${m}`,
    inDays: (n: string, d: number, m: string) => `${n} is due in ${d} days: ${m}`,
    today: (n: string, m: string) => `${n} is due today: ${m}`,
    todayNoAmount: (n: string) => `${n} is due today`,
    tomorrowNoAmount: (n: string) => `${n} is due tomorrow`,
    inDaysNoAmount: (n: string, d: number) => `${n} is due in ${d} days`,
    overdue: (n: string) => `${n} is overdue`,
  },
};

export function texts(lang: string) {
  return lang === "en" ? TEXT.en : TEXT.es;
}

/* Turns database rows into the app's debt shape (the same one schedule-core uses). */
export function toAppDebts(debts: DebtRow[], payments: PaymentRow[]) {
  return debts
    .filter((d) => !d.deleted_at)
    .map((d) => {
      const extra = d.extra || {};
      return {
        id: String(d.id),
        name: String(d.name || "").slice(0, 80),
        balance: Number(d.balance) || 0,
        currency: d.currency === "COP" ? "COP" : "USD",
        due: d.due === null || d.due === undefined ? "" : String(d.due),
        minPayment: extra.minPayment ?? "",
        createdAt: typeof extra.createdAt === "string" ? extra.createdAt : undefined,
        history: payments
          .filter((p) => String(p.debt_id) === String(d.id))
          .map((p) => ({ amount: Number(p.amount), date: p.paid_on || "", dueDate: p.due_on || "" })),
      };
    });
}

/* The plan's amounts: "<debtId>|YYYY-MM" (the same thing MPDDPlan.planned() gives in the app). */
export function plannedFrom(items: PlanItem[] | null | undefined, planMonth: string | null | undefined) {
  const out: Record<string, number> = {};
  for (const it of Array.isArray(items) ? items : []) {
    const amount = Number(it?.payment);
    if (!it?.debtId || !(amount > 0)) continue;
    const ym = typeof it.dueDate === "string" && /^\d{4}-\d{2}/.test(it.dueDate) ? it.dueDate.slice(0, 7) : (planMonth || "").slice(0, 7);
    if (ym) out[String(it.debtId) + "|" + ym] = amount;
  }
  return out;
}

/* Reminders that are due now (the database later filters out any already sent). */
export function remindersFor(settings: Settings, now: Date, debts: ReturnType<typeof toAppDebts>, planned: Record<string, number>): Reminder[] {
  if (!settings || !settings.enabled) return [];
  const days = [1, 3, 7].includes(Number(settings.days_before)) ? Number(settings.days_before) : 1;
  const { date: today, time } = localNow(now, settings.tz);
  const chosen = /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.send_time) ? settings.send_time : "08:00";
  // The task runs every 15 minutes: round the chosen time down to its quarter hour
  // (so 23:50 is sent at 23:45 instead of never).
  const sendTime = chosen.slice(0, 3) + String(Math.floor(Number(chosen.slice(3)) / 15) * 15).padStart(2, "0");
  if (time < sendTime) return [];
  const t = texts(settings.lang);
  const list = S.installments(debts, { from: S.addDays(today, -7), to: S.addDays(today, days), today, planned });
  const out: Reminder[] = [];
  for (const it of list) {
    if (it.payment) continue;
    const d = daysBetween(today, it.dueDate);
    const amount = it.expected === null || it.expected === undefined ? null : M.formatMoney(it.expected, it.currency);
    let kind: Reminder["kind"];
    let body: string;
    if (d === 0) {
      kind = "hoy";
      body = amount ? t.today(it.name, amount) : t.todayNoAmount(it.name);
    } else if (d === 1) {
      // Always "Mañana vence", also when the user chose 3 or 7 days (then it is a second reminder).
      kind = "manana";
      body = amount ? t.tomorrow(it.name, amount) : t.tomorrowNoAmount(it.name);
    } else if (d > 1 && d <= days) {
      kind = "antes";
      body = amount ? t.inDays(it.name, d, amount) : t.inDaysNoAmount(it.name, d);
    } else if (d < 0) {
      kind = "vencida";
      body = t.overdue(it.name);
    } else continue;
    out.push({ debtId: it.debtId, dueDate: it.dueDate, kind, title: t.title, body, tag: `mpdd-${kind}-${it.debtId}-${it.dueDate}` });
  }
  return out;
}
