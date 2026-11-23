import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { getOrCreateInvoice } from "../lib/invoiceStore.js";
import { addMonths, todayIso } from "../lib/schedule.js";
import { resolveResponsible } from "../lib/members.js";

export const installmentsRouter = Router();

const schema = z
  .object({
    description: z.string().trim().min(1, "Informe a descrição").max(100),
    totalAmountCents: z.number().int().positive("O valor precisa ser maior que zero"),
    installmentCount: z.number().int().min(2, "Mínimo de 2 parcelas").max(420),
    firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    accountId: z.string().nullable().optional(),
    creditCardId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    responsibleId: z.string().nullable().optional(),
  })
  .refine((v) => !!v.accountId !== !!v.creditCardId, "Escolha uma conta ou um cartão");

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Divide o total em parcelas; as primeiras absorvem os centavos que sobram. */
export function splitAmount(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Compra parcelada. No cartão, cada parcela cai na fatura de um mês seguido (todas confirmadas,
 * pois já foram cobradas). Na conta (carnê/boleto), as parcelas futuras ficam previstas.
 */
installmentsRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const v = schema.parse(req.body);
    const householdId = hid(req);
    const card = v.creditCardId ? await prisma.creditCard.findFirst({ where: { id: v.creditCardId, householdId } }) : null;
    if (v.creditCardId && !card) throw new HttpError(400, "Cartão inválido");
    if (v.accountId && !(await prisma.account.findFirst({ where: { id: v.accountId, householdId } }))) throw new HttpError(400, "Conta inválida");
    if (v.categoryId && !(await prisma.category.findFirst({ where: { id: v.categoryId, householdId, type: "EXPENSE" } }))) {
      throw new HttpError(400, "Categoria inválida");
    }
    const responsibleId = await resolveResponsible(householdId, uid(req), v.responsibleId);
    const today = todayIso();
    const amounts = splitAmount(v.totalAmountCents, v.installmentCount);

    const plan = await prisma.$transaction(async (tx) => {
      const plan = await tx.installmentPlan.create({
        data: {
          householdId,
          description: v.description,
          totalAmountCents: v.totalAmountCents,
          installmentCount: v.installmentCount,
          firstDate: d(v.firstDate),
          accountId: v.accountId ?? null,
          creditCardId: v.creditCardId ?? null,
          categoryId: v.categoryId ?? null,
          responsibleId,
        },
      });
      for (let i = 0; i < v.installmentCount; i++) {
        const date = addMonths(v.firstDate, i);
        const invoice = card ? await getOrCreateInvoice(tx, card, date) : null;
        await tx.transaction.create({
          data: {
            householdId,
            type: "EXPENSE",
            status: card || date <= today ? "PAID" : "PENDING",
            description: `${v.description} (${i + 1}/${v.installmentCount})`,
            amountCents: amounts[i],
            date: d(date),
            accountId: card ? null : v.accountId,
            creditCardId: card?.id ?? null,
            invoiceId: invoice?.id ?? null,
            categoryId: v.categoryId ?? null,
            notes: v.notes ?? null,
            installmentPlanId: plan.id,
            installmentNumber: i + 1,
            createdById: uid(req),
            responsibleId,
          },
        });
      }
      return plan;
    });
    res.status(201).json(plan);
  }),
);

/** Exclui o parcelamento inteiro (todas as parcelas). */
installmentsRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const plan = await prisma.installmentPlan.findFirst({ where: { id, householdId: hid(req) } });
    if (!plan) throw new HttpError(404, "Parcelamento não encontrado");
    await prisma.installmentPlan.delete({ where: { id } });
    res.status(204).end();
  }),
);
