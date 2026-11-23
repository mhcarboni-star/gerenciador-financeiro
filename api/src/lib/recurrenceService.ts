import { Prisma, type Recurrence } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getOrCreateInvoice } from "./invoiceStore.js";
import { addDays, addMonths, firstOnOrAfter, occurrencesBetween, todayIso } from "./schedule.js";

/**
 * Até onde as ocorrências ficam geradas. Recorrência sem data final continua para sempre:
 * o app sempre mantém gerado até o fim do ano corrente (no mínimo 3 meses à frente) e,
 * quando alguém abre um mês mais adiante, gera até o fim daquele mês (limite: 5 anos).
 */
export function horizonFor(until?: string) {
  const today = todayIso();
  const endOfYear = `${today.slice(0, 4)}-12-31`;
  const min3 = addMonths(today, 3);
  let h = min3 > endOfYear ? min3 : endOfYear;
  if (until && until > h) {
    const max = addMonths(today, 60);
    h = until < max ? until : max;
  }
  return h;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Gera as ocorrências de uma recorrência até o horizonte e avança nextDate.
 * Trava a linha da recorrência para duas execuções simultâneas não gerarem em dobro
 * (o índice único (recurrenceId, occurrenceDate) é a segunda proteção).
 */
export async function generateOccurrences(recurrenceId: string, until?: string) {
  const horizon = horizonFor(until);
  return prisma.$transaction(async (tx) => {
    const [rec] = await tx.$queryRaw<Recurrence[]>`SELECT * FROM "Recurrence" WHERE id = ${recurrenceId} FOR UPDATE`;
    if (!rec || !rec.active) return 0;
    const start = iso(rec.startDate);
    const end = rec.endDate ? iso(rec.endDate) : null;
    const dates = occurrencesBetween(start, rec.frequency, rec.interval, iso(rec.nextDate), horizon, end);
    const card = rec.creditCardId ? await tx.creditCard.findUnique({ where: { id: rec.creditCardId } }) : null;

    let created = 0;
    for (const date of dates) {
      const invoice = card ? await getOrCreateInvoice(tx, card, date) : null;
      try {
        // SAVEPOINT: um conflito de unicidade não pode abortar a transação inteira.
        await tx.$executeRaw`SAVEPOINT occ`;
        await tx.transaction.create({
          data: {
            householdId: rec.householdId,
            type: rec.type,
            status: rec.autoMarkPaid ? "PAID" : "PENDING",
            description: rec.description,
            amountCents: rec.amountCents,
            expectedAmountCents: rec.amountCents,
            date: d(date),
            occurrenceDate: d(date),
            accountId: card ? null : rec.accountId,
            destinationAccountId: rec.destinationAccountId,
            creditCardId: card?.id ?? null,
            invoiceId: invoice?.id ?? null,
            categoryId: rec.categoryId,
            recurrenceId: rec.id,
            responsibleId: rec.responsibleId,
          },
        });
        await tx.$executeRaw`RELEASE SAVEPOINT occ`;
        created++;
      } catch (e) {
        if (!isUnique(e)) throw e;
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT occ`;
      }
    }
    const next = firstOnOrAfter(start, rec.frequency, rec.interval, addDays(horizon, 1), end);
    await tx.recurrence.update({
      where: { id: rec.id },
      data: { nextDate: d(next ?? addDays(end ?? horizon, 1)) },
    });
    return created;
  });
}

/** Gera o que estiver faltando para todas as recorrências ativas do grupo. */
export async function generateForHousehold(householdId: string, until?: string) {
  const horizonIso = horizonFor(until);
  const horizon = d(horizonIso);
  const due = await prisma.recurrence.findMany({
    where: { householdId, active: true, nextDate: { lte: horizon } },
    select: { id: true },
  });
  for (const r of due) await generateOccurrences(r.id, horizonIso);
}

/**
 * Depois de editar a recorrência: remove as ocorrências futuras ainda não confirmadas
 * (a partir de hoje) e gera de novo com os dados atuais. Atrasadas e confirmadas ficam.
 */
export async function regenerateFuture(recurrenceId: string) {
  const today = todayIso();
  const rec = await prisma.recurrence.findUniqueOrThrow({ where: { id: recurrenceId } });
  await prisma.transaction.deleteMany({ where: { recurrenceId, status: "PENDING", occurrenceDate: { gte: d(today) } } });
  const start = iso(rec.startDate);
  const next = firstOnOrAfter(start, rec.frequency, rec.interval, start > today ? start : today, rec.endDate ? iso(rec.endDate) : null);
  await prisma.recurrence.update({ where: { id: recurrenceId }, data: { nextDate: d(next ?? today) } });
  if (next) await generateOccurrences(recurrenceId);
}
