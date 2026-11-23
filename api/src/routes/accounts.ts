import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { balanceOn, latestCheckpoints } from "../lib/balances.js";
import { todayIso } from "../lib/schedule.js";

export const accountsRouter = Router();

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  type: z.enum(["CHECKING", "SAVINGS", "CASH", "INVESTMENT", "OTHER"]),
  institution: z.string().trim().max(60).nullable().optional(),
  initialBalanceCents: z.number().int(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
  includeInTotals: z.boolean().optional(),
});

async function own(req: AuthRequest, id: string) {
  const a = await prisma.account.findFirst({ where: { id, householdId: hid(req) } });
  if (!a) throw new HttpError(404, "Conta não encontrada");
  return a;
}

/** Contas ativas com saldo atual (efetivado) e previsto. ?arquivadas=1 inclui arquivadas. */
accountsRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const [accounts, balances, checkpoints] = await Promise.all([
      prisma.account.findMany({
        where: { householdId, ...(req.query.arquivadas === "1" ? {} : { archivedAt: null }) },
        orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
      }),
      prisma.$queryRaw<{ accountId: string; balanceCents: bigint; projectedBalanceCents: bigint }[]>`
        SELECT "accountId", "balanceCents", "projectedBalanceCents" FROM account_balances WHERE "householdId" = ${householdId}`,
      latestCheckpoints(householdId),
    ]);
    const map = new Map(balances.map((b) => [b.accountId, b]));
    res.json(
      accounts.map((a) => ({
        ...a,
        balanceCents: Number(map.get(a.id)?.balanceCents ?? a.initialBalanceCents),
        projectedBalanceCents: Number(map.get(a.id)?.projectedBalanceCents ?? a.initialBalanceCents),
        lastAdjustment: checkpoints.has(a.id)
          ? { date: checkpoints.get(a.id)!.date.toISOString().slice(0, 10), balanceCents: checkpoints.get(a.id)!.balanceCents }
          : null,
      })),
    );
  }),
);

accountsRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const data = schema.parse(req.body);
    res.status(201).json(await prisma.account.create({ data: { ...data, householdId: hid(req) } }));
  }),
);

accountsRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    res.json(await prisma.account.update({ where: { id }, data: schema.parse(req.body) }));
  }),
);

/** Exclui se não tiver movimentação; senão arquiva (preserva o histórico). */
accountsRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const used = await prisma.transaction.count({ where: { OR: [{ accountId: id }, { destinationAccountId: id }] } });
    if (used > 0) {
      await prisma.account.update({ where: { id }, data: { archivedAt: new Date() } });
      return res.json({ archived: true });
    }
    await prisma.account.delete({ where: { id } });
    res.json({ archived: false });
  }),
);

accountsRouter.post(
  "/:id/reativar",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    res.json(await prisma.account.update({ where: { id }, data: { archivedAt: null } }));
  }),
);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** Saldo efetivado da conta ao fim de uma data (para a tela de ajuste). */
accountsRouter.get(
  "/:id/saldo",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const date = isoDate.parse(req.query.data ?? todayIso());
    res.json({ date, balanceCents: await balanceOn(id, date) });
  }),
);

/**
 * Ajusta o saldo: registra o saldo real na data e lança a diferença como ajuste
 * (entrada ou saída). Lançamentos anteriores ao ajuste deixam de mudar o saldo.
 */
accountsRouter.post(
  "/:id/ajustar-saldo",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const account = await own(req, id);
    const v = z.object({ balanceCents: z.number().int(), date: isoDate }).parse(req.body);
    if (v.date > todayIso()) throw new HttpError(400, "O ajuste não pode ter data futura");
    const last = (await latestCheckpoints(account.householdId)).get(id);
    if (last && v.date < last.date.toISOString().slice(0, 10)) {
      const d = last.date.toISOString().slice(0, 10).split("-").reverse().join("/");
      throw new HttpError(400, `Já existe um ajuste em ${d}. Faça o novo ajuste nessa data ou depois.`);
    }
    const date = new Date(`${v.date}T00:00:00Z`);
    const result = await prisma.$transaction(async (tx) => {
      const [{ v: current }] = await tx.$queryRaw<{ v: number }[]>`SELECT account_balance_on(${id}, ${v.date}::date, false) AS v`;
      const delta = v.balanceCents - Number(current);
      const adj = delta === 0 ? null : await tx.transaction.create({
        data: {
          householdId: account.householdId,
          type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          status: "PAID",
          description: "Ajuste de saldo",
          amountCents: Math.abs(delta),
          date,
          accountId: id,
          notes: `Saldo no app: ${(Number(current) / 100).toFixed(2)} · saldo informado: ${(v.balanceCents / 100).toFixed(2)}`,
          createdById: req.userId,
        },
      });
      await tx.balanceCheckpoint.create({ data: { accountId: id, date, balanceCents: v.balanceCents, transactionId: adj?.id ?? null } });
      return { previousBalanceCents: Number(current), deltaCents: delta };
    });
    res.status(201).json(result);
  }),
);
