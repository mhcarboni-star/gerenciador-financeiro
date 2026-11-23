import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";

export const categoriesRouter = Router();

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome"),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
});

async function own(req: AuthRequest, id: string) {
  const cat = await prisma.category.findFirst({ where: { id, userId: uid(req) } });
  if (!cat) throw new HttpError(404, "Categoria não encontrada");
  return cat;
}

categoriesRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const cats = await prisma.category.findMany({
      where: { userId: uid(req) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    res.json(cats);
  }),
);

categoriesRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const data = schema.parse(req.body);
    try {
      const cat = await prisma.category.create({ data: { ...data, userId: uid(req) } });
      res.status(201).json(cat);
    } catch (e: any) {
      if (e?.code === "P2002") throw new HttpError(409, "Já existe uma categoria com esse nome");
      throw e;
    }
  }),
);

categoriesRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    await own(req, req.params.id as string);
    const data = schema.partial().parse(req.body);
    try {
      const cat = await prisma.category.update({ where: { id: req.params.id as string }, data });
      res.json(cat);
    } catch (e: any) {
      if (e?.code === "P2002") throw new HttpError(409, "Já existe uma categoria com esse nome");
      throw e;
    }
  }),
);

categoriesRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    await own(req, req.params.id as string);
    await prisma.category.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  }),
);
