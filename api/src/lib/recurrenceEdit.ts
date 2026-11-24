import type { Prisma, Recurrence } from "@prisma/client";
import { addDays, firstOnOrAfter, todayIso } from "./schedule.js";

type Tx = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Corta a recorrência a partir de uma ocorrência (exclusive): as ocorrências seguintes
 * ainda não confirmadas (ou de data futura) são removidas; as já confirmadas no passado
 * ficam no histórico, desligadas da recorrência. A recorrência termina na véspera.
 * Devolve a data da última ocorrência confirmada que foi desligada (para a nova série não repetir).
 */
export async function cutAfter(tx: Tx, rec: Recurrence, occurrence: string) {
  const today = todayIso();
  const after = { recurrenceId: rec.id, occurrenceDate: { gt: d(occurrence) } };
  await tx.transaction.deleteMany({ where: { ...after, OR: [{ status: "PENDING" }, { date: { gt: d(today) } }] } });
  const kept = await tx.transaction.findMany({ where: after, select: { id: true, occurrenceDate: true }, orderBy: { occurrenceDate: "desc" } });
  if (kept.length) {
    await tx.transaction.updateMany({ where: { id: { in: kept.map((k) => k.id) } }, data: { recurrenceId: null, occurrenceDate: null } });
  }
  return kept[0]?.occurrenceDate ? iso(kept[0].occurrenceDate) : null;
}

/** Encerra a recorrência na véspera da ocorrência; se não sobrar nada dela, apaga o modelo. */
export async function endBefore(tx: Tx, rec: Recurrence, occurrence: string) {
  const start = iso(rec.startDate);
  const end = addDays(occurrence, -1);
  if (end < start) {
    const left = await tx.transaction.count({ where: { recurrenceId: rec.id } });
    if (left === 0) {
      await tx.recurrence.delete({ where: { id: rec.id } });
      return;
    }
    await tx.recurrence.update({ where: { id: rec.id }, data: { active: false, endDate: rec.startDate, nextDate: d(addDays(start, 1)) } });
    return;
  }
  await tx.recurrence.update({ where: { id: rec.id }, data: { active: false, endDate: d(end), nextDate: d(occurrence) } });
}

/** Próxima data a gerar da nova série, depois da ocorrência editada e de confirmadas já existentes. */
export function nextDateForNewSeries(rec: Pick<Recurrence, "frequency" | "interval" | "endDate">, start: string, lastKept: string | null) {
  const after = lastKept && lastKept > start ? lastKept : start;
  const end = rec.endDate ? iso(rec.endDate) : null;
  return firstOnOrAfter(start, rec.frequency, rec.interval, addDays(after, 1), end) ?? addDays(end ?? after, 1);
}
