import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";

export const categoriesRouter = Router();

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");
const name = z.string().trim().min(1, "Informe o nome").max(40);

const createSchema = z.object({
  name,
  type: z.enum(["INCOME", "EXPENSE"]),
  color: color.optional(),
  parentId: z.string().nullable().optional(),
  /** subcategorias criadas junto com a principal */
  children: z.array(name).max(30).optional(),
});

const updateSchema = z.object({ name: name.optional(), color: color.optional() });

const duplicated = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
/** Erros dos gatilhos do banco (ex.: subcategoria de subcategoria) viram mensagem para o usuário. */
function dbMessage(e: unknown) {
  if (duplicated(e)) return "Já existe uma categoria com esse nome";
  const m = String((e as Error)?.message ?? "");
  if (m.includes("Subcategoria precisa")) return "Subcategoria só pode ficar dentro de uma categoria principal do mesmo tipo";
  return null;
}

async function own(req: AuthRequest, id: string) {
  const cat = await prisma.category.findFirst({ where: { id, householdId: hid(req) } });
  if (!cat) throw new HttpError(404, "Categoria não encontrada");
  return cat;
}

/** Categorias ativas (com ?arquivadas=1, também as excluídas, para restaurar). */
categoriesRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const cats = await prisma.category.findMany({
      where: { householdId: hid(req), ...(req.query.arquivadas === "1" ? {} : { archivedAt: null }) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    res.json(cats);
  }),
);

/** Cria uma categoria (principal ou subcategoria) e, se informadas, suas subcategorias. */
categoriesRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const v = createSchema.parse(req.body);
    const householdId = hid(req);
    let parentColor: string | undefined;
    if (v.parentId) {
      const parent = await own(req, v.parentId);
      if (parent.archivedAt) throw new HttpError(400, "A categoria principal está excluída; restaure-a primeiro");
      if (v.children?.length) throw new HttpError(400, "Subcategoria não pode ter subcategorias");
      parentColor = parent.color;
    }
    const names = [...new Set((v.children ?? []).map((n) => n.trim()).filter(Boolean))];
    try {
      const created = await prisma.$transaction(async (tx) => {
        const cat = await tx.category.create({
          data: { householdId, name: v.name, type: v.type, color: v.color ?? parentColor, parentId: v.parentId ?? null },
        });
        for (const n of names) {
          await tx.category.create({ data: { householdId, name: n, type: v.type, color: cat.color, parentId: cat.id } });
        }
        return cat;
      });
      res.status(201).json(created);
    } catch (e) {
      const m = dbMessage(e);
      if (m) throw new HttpError(409, m);
      throw e;
    }
  }),
);

categoriesRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const cat = await own(req, req.params.id as string);
    const data = updateSchema.parse(req.body);
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.category.update({ where: { id: cat.id }, data });
        // cor da principal acompanha nas subcategorias
        if (data.color && !cat.parentId) await tx.category.updateMany({ where: { parentId: cat.id }, data: { color: data.color } });
        return u;
      });
      res.json(updated);
    } catch (e) {
      const m = dbMessage(e);
      if (m) throw new HttpError(409, m);
      throw e;
    }
  }),
);

/**
 * Excluir = arquivar (reversível). Principal leva junto as subcategorias ativas, com o mesmo
 * horário, para restaurar tudo de uma vez. Lançamentos mantêm a categoria no histórico.
 */
categoriesRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const cat = await own(req, req.params.id as string);
    if (cat.archivedAt) return res.json({ archivedIds: [] });
    const now = new Date();
    const children = cat.parentId ? [] : await prisma.category.findMany({ where: { parentId: cat.id, archivedAt: null }, select: { id: true } });
    const ids = [cat.id, ...children.map((c) => c.id)];
    await prisma.category.updateMany({ where: { id: { in: ids } }, data: { archivedAt: now } });
    res.json({ archivedIds: ids });
  }),
);

/** Restaura uma categoria excluída (a principal traz de volta as subcategorias excluídas junto). */
categoriesRouter.post(
  "/:id/restaurar",
  ah(async (req: AuthRequest, res) => {
    const cat = await own(req, req.params.id as string);
    if (!cat.archivedAt) return res.json({ restoredIds: [] });
    if (cat.parentId) {
      const parent = await own(req, cat.parentId);
      if (parent.archivedAt) throw new HttpError(400, `Restaure primeiro a categoria principal "${parent.name}"`);
    }
    const together = cat.parentId
      ? []
      : await prisma.category.findMany({ where: { parentId: cat.id, archivedAt: cat.archivedAt }, select: { id: true } });
    const ids = [cat.id, ...together.map((c) => c.id)];
    try {
      await prisma.category.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } });
    } catch (e) {
      if (duplicated(e)) throw new HttpError(409, `Já existe outra categoria ativa chamada "${cat.name}". Renomeie ou exclua essa antes de restaurar.`);
      throw e;
    }
    res.json({ restoredIds: ids });
  }),
);
