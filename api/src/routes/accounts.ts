import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";

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
    const [accounts, balances] = await Promise.all([
      prisma.account.findMany({
        where: { householdId, ...(req.query.arquivadas === "1" ? {} : { archivedAt: null }) },
        orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
      }),
      prisma.$queryRaw<{ accountId: string; balanceCents: bigint; projectedBalanceCents: bigint }[]>`
        SELECT "accountId", "balanceCents", "projectedBalanceCents" FROM account_balances WHERE "householdId" = ${householdId}`,
    ]);
    const map = new Map(balances.map((b) => [b.accountId, b]));
    res.json(
      accounts.map((a) => ({
        ...a,
        balanceCents: Number(map.get(a.id)?.balanceCents ?? a.initialBalanceCents),
        projectedBalanceCents: Number(map.get(a.id)?.projectedBalanceCents ?? a.initialBalanceCents),
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
