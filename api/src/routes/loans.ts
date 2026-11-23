import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { buildLoanReport } from "../lib/loanReport.js";
import { renderLoanReportPdf } from "../lib/loanReportPdf.js";
import { buildSchedule } from "../lib/loans.js";
import { computeSplit, recalcLoan } from "../lib/loanService.js";
import { todayIso } from "../lib/schedule.js";
import { resolveResponsible } from "../lib/members.js";

export const loansRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const createSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(80),
    lender: z.string().trim().max(80).nullable().optional(),
    principalCents: z.number().int().positive("Informe o valor emprestado"),
    interestType: z.enum(["NONE", "PRICE", "MONTHLY_ON_BALANCE"]),
    monthlyRate: z.number().min(0).max(1).nullable().optional(),
    installmentCount: z.number().int().min(1).max(600).nullable().optional(),
    startDate: isoDate,
    firstDueDate: isoDate.nullable().optional(),
    receivedAccountId: z.string().nullable().optional(),
    paymentAccountId: z.string().min(1, "Escolha a conta dos pagamentos"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    responsibleId: z.string().nullable().optional(),
  })
  .refine((v) => v.interestType === "NONE" || (v.monthlyRate ?? 0) > 0 || v.interestType === "PRICE", "Informe a taxa de juros")
  .refine((v) => v.interestType !== "PRICE" || !!v.installmentCount, "Informe o número de parcelas")
  .refine((v) => !v.installmentCount || !!v.firstDueDate, "Informe o vencimento da 1ª parcela")
  .refine((v) => !v.firstDueDate || v.firstDueDate >= v.startDate, "O 1º vencimento deve ser depois da data do empréstimo");

const editSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  lender: z.string().trim().max(80).nullable().optional(),
  paymentAccountId: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const paySchema = z.object({
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  date: isoDate,
  accountId: z.string().min(1, "Escolha a conta"),
});

async function ownLoan(req: AuthRequest, id: string) {
  const l = await prisma.loan.findFirst({ where: { id, householdId: hid(req) } });
  if (!l) throw new HttpError(404, "Empréstimo não encontrado");
  return l;
}

async function checkAccount(req: AuthRequest, id: string | null | undefined) {
  if (!id) return;
  if (!(await prisma.account.findFirst({ where: { id, householdId: hid(req) } }))) throw new HttpError(400, "Conta inválida");
}

/** Empréstimos com situação e extrato (JSON). ?ativos=1 para só os em aberto. */
loansRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    res.json(await buildLoanReport(hid(req), { onlyActive: req.query.ativos === "1" }));
  }),
);

/** Relatório em PDF: resumo de todos os empréstimos + extrato de cada um. */
loansRouter.get(
  "/relatorio.pdf",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const [loans, household] = await Promise.all([
      buildLoanReport(householdId, { onlyActive: req.query.ativos === "1" }),
      prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    ]);
    const pdf = await renderLoanReportPdf(loans, { householdName: household.name, generatedAt: new Date() });
    res
      .type("application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="emprestimos-${todayIso()}.pdf"`)
      .send(pdf);
  }),
);

loansRouter.get(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const [loan] = await buildLoanReport(hid(req), { loanId: req.params.id as string });
    if (!loan) throw new HttpError(404, "Empréstimo não encontrado");
    res.json(loan);
  }),
);

/**
 * Cadastra o empréstimo: registra a entrada do dinheiro (se informada a conta) e gera as
 * parcelas previstas pela tabela (Price, sem juros ou juros sobre saldo com plano).
 */
loansRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const v = createSchema.parse(req.body);
    await checkAccount(req, v.receivedAccountId);
    await checkAccount(req, v.paymentAccountId);
    const householdId = hid(req);
    const rate = v.interestType === "NONE" ? 0 : (v.monthlyRate ?? 0);
    const responsibleId = await resolveResponsible(householdId, uid(req), v.responsibleId);

    const loan = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          householdId,
          name: v.name,
          lender: v.lender ?? null,
          principalCents: v.principalCents,
          interestType: v.interestType,
          monthlyRate: v.interestType === "NONE" ? null : rate,
          installmentCount: v.installmentCount ?? null,
          startDate: d(v.startDate),
          firstDueDate: v.firstDueDate ? d(v.firstDueDate) : null,
          receivedAccountId: v.receivedAccountId ?? null,
          paymentAccountId: v.paymentAccountId,
          color: v.color,
          notes: v.notes ?? null,
          responsibleId,
        },
      });
      if (v.receivedAccountId) {
        await tx.transaction.create({
          data: {
            householdId, type: "LOAN_RECEIPT", status: "PAID", description: v.name, amountCents: v.principalCents,
            date: d(v.startDate), accountId: v.receivedAccountId, loanId: loan.id, createdById: uid(req), responsibleId,
          },
        });
      }
      if (v.installmentCount && v.firstDueDate) {
        const schedule = buildSchedule({
          type: v.interestType, principalCents: v.principalCents, monthlyRate: rate, count: v.installmentCount, firstDueDate: v.firstDueDate,
        });
        await tx.transaction.createMany({
          data: schedule.map((it) => ({
            householdId, type: "LOAN_PAYMENT" as const, status: "PENDING" as const,
            description: `${v.name} · parcela ${it.number}/${v.installmentCount}`,
            amountCents: it.amountCents, expectedAmountCents: it.amountCents,
            date: d(it.dueDate), occurrenceDate: d(it.dueDate), accountId: v.paymentAccountId, loanId: loan.id,
            loanInstallmentNumber: it.number, loanPrincipalCents: it.principalCents, loanInterestCents: it.interestCents,
            responsibleId,
          })),
        });
      }
      return loan;
    });
    res.status(201).json(loan);
  }),
);

/** Edita dados cadastrais (os termos financeiros não mudam depois de criado). */
loansRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await ownLoan(req, id);
    const v = editSchema.parse(req.body);
    await checkAccount(req, v.paymentAccountId);
    await prisma.$transaction([
      prisma.loan.update({ where: { id }, data: { ...v, lender: v.lender ?? null, notes: v.notes ?? null } }),
      prisma.transaction.updateMany({ where: { loanId: id, type: "LOAN_PAYMENT", status: "PENDING" }, data: { accountId: v.paymentAccountId } }),
    ]);
    res.json({ ok: true });
  }),
);

/** Exclui o empréstimo e todos os lançamentos dele (entrada e pagamentos). */
loansRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await ownLoan(req, id);
    await prisma.loan.delete({ where: { id } });
    res.status(204).end();
  }),
);

/** Pagamento avulso ou antecipado. */
loansRouter.post(
  "/:id/pagamentos",
  ah(async (req: AuthRequest, res) => {
    const loan = await ownLoan(req, req.params.id as string);
    if (loan.status !== "ACTIVE") throw new HttpError(400, "Este empréstimo não está em aberto");
    const v = paySchema.parse(req.body);
    await checkAccount(req, v.accountId);
    await prisma.$transaction(async (tx) => {
      const split = await computeSplit(tx, loan.id, v.amountCents, v.date, false);
      await tx.transaction.create({
        data: {
          householdId: loan.householdId, type: "LOAN_PAYMENT", status: "PAID", description: `${loan.name} · pagamento avulso`,
          amountCents: v.amountCents, date: d(v.date), accountId: v.accountId, loanId: loan.id,
          loanPrincipalCents: split.principalCents, loanInterestCents: split.interestCents, createdById: uid(req),
          responsibleId: loan.responsibleId,
        },
      });
      await recalcLoan(tx, loan.id);
    });
    res.status(201).json(await buildLoanReport(hid(req), { loanId: loan.id }).then((r) => r[0]));
  }),
);

async function ownPayment(req: AuthRequest, txId: string) {
  const t = await prisma.transaction.findFirst({ where: { id: txId, householdId: hid(req), type: "LOAN_PAYMENT" } });
  if (!t || !t.loanId) throw new HttpError(404, "Pagamento não encontrado");
  return t as typeof t & { loanId: string };
}

/** Confirma uma parcela prevista, podendo corrigir valor, data e conta. */
loansRouter.post(
  "/pagamentos/:txId/confirmar",
  ah(async (req: AuthRequest, res) => {
    const t = await ownPayment(req, req.params.txId as string);
    if (t.status !== "PENDING") throw new HttpError(400, "Esta parcela já foi confirmada");
    const v = paySchema.parse(req.body);
    await checkAccount(req, v.accountId);
    await prisma.$transaction(async (tx) => {
      const split = await computeSplit(tx, t.loanId, v.amountCents, v.date, true);
      await tx.transaction.update({
        where: { id: t.id },
        data: {
          status: "PAID", amountCents: v.amountCents, expectedAmountCents: t.expectedAmountCents ?? t.amountCents,
          date: d(v.date), accountId: v.accountId, loanPrincipalCents: split.principalCents, loanInterestCents: split.interestCents,
        },
      });
      await recalcLoan(tx, t.loanId);
    });
    res.json(await buildLoanReport(hid(req), { loanId: t.loanId }).then((r) => r[0]));
  }),
);

/**
 * Desfaz um pagamento: parcela prevista volta a ficar pendente (na data original);
 * pagamento avulso é excluído. As parcelas restantes são recalculadas.
 */
loansRouter.delete(
  "/pagamentos/:txId",
  ah(async (req: AuthRequest, res) => {
    const t = await ownPayment(req, req.params.txId as string);
    if (t.status !== "PAID") throw new HttpError(400, "Só pagamentos confirmados podem ser desfeitos");
    await prisma.$transaction(async (tx) => {
      if (t.loanInstallmentNumber) {
        await tx.transaction.update({
          where: { id: t.id },
          // divisão zerada aqui e refeita pelo recálculo logo abaixo
          data: {
            status: "PENDING", date: t.occurrenceDate ?? t.date, amountCents: t.expectedAmountCents ?? t.amountCents,
            loanPrincipalCents: null, loanInterestCents: null,
          },
        });
      } else {
        await tx.transaction.delete({ where: { id: t.id } });
      }
      await recalcLoan(tx, t.loanId);
    });
    res.json(await buildLoanReport(hid(req), { loanId: t.loanId }).then((r) => r[0]));
  }),
);
