import { prisma } from "./prisma.js";
import { sendToUser } from "./push.js";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (c: number) => brl.format(c / 100).replace(/ /g, " ");

export const DEFAULT_SETTINGS = { dueItemsEnabled: true, includeOverdue: true, sendHour: 8, timezone: "America/Sao_Paulo" };

/** Data e hora locais de um fuso (o servidor roda em UTC). */
export function localNow(timeZone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

interface DueItem {
  description: string;
  amountCents: number;
  date: Date;
  type: string;
}

/**
 * Pendentes de hoje (e atrasados) que interessam ao usuário: os no nome dele e os da
 * Família (conjunto), nos grupos em que ele deixou os avisos ligados.
 */
export async function dueItemsFor(userId: string, today: string, includeOverdue: boolean): Promise<DueItem[]> {
  const memberships = await prisma.householdMember.findMany({ where: { userId, notifyDueItems: true }, select: { householdId: true } });
  if (memberships.length === 0) return [];
  const day = new Date(`${today}T00:00:00Z`);
  return prisma.transaction.findMany({
    where: {
      householdId: { in: memberships.map((m) => m.householdId) },
      status: "PENDING",
      date: includeOverdue ? { lte: day } : day,
      OR: [{ responsibleId: userId }, { responsibleId: null }],
    },
    select: { description: true, amountCents: true, date: true, type: true },
    orderBy: [{ date: "asc" }, { amountCents: "desc" }],
  });
}

/** Texto do aviso: "3 contas para hoje · R$ 412,30" + nomes; atrasadas à parte. */
export function buildMessage(items: DueItem[], today: string) {
  const isToday = (i: DueItem) => i.date.toISOString().slice(0, 10) === today;
  const todays = items.filter(isToday);
  const late = items.filter((i) => !isToday(i));
  const out = (xs: DueItem[]) => xs.filter((i) => i.type !== "INCOME");
  const inc = (xs: DueItem[]) => xs.filter((i) => i.type === "INCOME");
  const sum = (xs: DueItem[]) => xs.reduce((s, i) => s + i.amountCents, 0);
  const names = (xs: DueItem[]) => {
    const n = xs.slice(0, 3).map((i) => i.description.replace(/ · parcela .*/, ""));
    return n.join(", ") + (xs.length > 3 ? ` e mais ${xs.length - 3}` : "");
  };

  const parts: string[] = [];
  if (out(todays).length) parts.push(`${out(todays).length === 1 ? "1 conta" : `${out(todays).length} contas`} para hoje · ${money(sum(out(todays)))} — ${names(out(todays))}`);
  if (inc(todays).length) parts.push(`${inc(todays).length === 1 ? "1 recebimento" : `${inc(todays).length} recebimentos`} hoje · ${money(sum(inc(todays)))} — ${names(inc(todays))}`);
  if (late.length) parts.push(`${late.length === 1 ? "1 atrasada" : `${late.length} atrasadas`} · ${money(sum(late))}`);

  const title = out(todays).length ? "Contas do dia" : todays.length ? "Previstos para hoje" : "Contas atrasadas";
  return { title, body: parts.join("\n") };
}

/**
 * Tarefa de hora em hora: para cada usuário com aparelho inscrito, se já passou do
 * horário escolhido no fuso dele e ainda não foi avisado hoje, envia um único aviso.
 * O registro (único por usuário/dia) é gravado ANTES do envio: duas execuções
 * simultâneas nunca mandam em dobro. Depois das 22h não envia (fica para amanhã).
 */
export async function runDueNotifications(now = new Date()) {
  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    select: { id: true, notificationSettings: true },
  });
  const result = { users: users.length, sent: 0, skipped: 0, empty: 0, failed: 0 };

  for (const u of users) {
    const s = { ...DEFAULT_SETTINGS, ...(u.notificationSettings ?? {}) };
    if (!s.dueItemsEnabled) { result.skipped++; continue; }
    const local = localNow(s.timezone, now);
    if (local.hour < s.sendHour || local.hour >= 22) { result.skipped++; continue; }

    const items = await dueItemsFor(u.id, local.date, s.includeOverdue);
    if (items.length === 0) { result.empty++; continue; }

    try {
      await prisma.notificationLog.create({
        data: { userId: u.id, kind: "DUE_ITEMS", referenceDate: new Date(`${local.date}T00:00:00Z`), transactionCount: items.length, devicesReached: 0 },
      });
    } catch {
      result.skipped++; // já avisado hoje
      continue;
    }
    const msg = buildMessage(items, local.date);
    const reached = await sendToUser(u.id, { ...msg, url: "/", tag: `contas-${local.date}` });
    const where = { userId: u.id, kind: "DUE_ITEMS" as const, referenceDate: new Date(`${local.date}T00:00:00Z`) };
    if (reached === 0) {
      // ninguém recebeu (falha momentânea?): libera para tentar de novo na próxima hora.
      // Aparelhos que falham repetidamente são removidos por sendToUser.
      await prisma.notificationLog.deleteMany({ where });
      result.failed++;
      continue;
    }
    await prisma.notificationLog.updateMany({ where, data: { devicesReached: reached } });
    result.sent++;
  }
  return result;
}
