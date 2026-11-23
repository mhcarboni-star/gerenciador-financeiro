import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { currentMonth, monthRange } from "../lib/dates.js";

export const transactionsRouter = Router();

const schema = z.object({
  description: z.string().trim().min(1, "Informe a descrição"),
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

async function checkCategory(req: AuthRequest, categoryId?: string | null) {
  if (!categoryId) return;
  const cat = await prisma.category.findFirst({ where: { id: categoryId, userId: uid(req) } });
  if (!cat) throw new HttpError(400, "Categoria inválida");
}

async function own(req: AuthRequest, id: string) {
  const t = await prisma.transaction.findFirst({ where: { id, userId: uid(req) } });
  if (!t) throw new HttpError(404, "Lançamento não encontrado");
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

transactionsRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
    const list = await prisma.transaction.findMany({
      where: { userId: uid(req), date: monthRange(month) },
      include: { category: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    res.json(list);
  }),
);

transactionsRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const data = schema.parse(req.body);
    await checkCategory(req, data.categoryId);
    const t = await prisma.transaction.create({
      data: { ...data, date: toDate(data.date), userId: uid(req) },
      include: { category: true },
    });
    res.status(201).json(t);
  }),
);

transactionsRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const data = schema.parse(req.body);
    await checkCategory(req, data.categoryId);
    const t = await prisma.transaction.update({
      where: { id },
      data: { ...data, date: toDate(data.date) },
      include: { category: true },
    });
    res.json(t);
  }),
);

transactionsRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    await prisma.transaction.delete({ where: { id } });
    res.status(204).end();
  }),
);
