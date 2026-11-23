import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, requireAuth, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { membersOf } from "../lib/members.js";

/** Grupo ativo: membros, convites, nome. */
export const householdRouter = Router();
/** Convites (aceitar não depende do grupo ativo). */
export const invitesRouter = Router();

const INVITE_DAYS = 7;

async function myRole(householdId: string, userId: string) {
  const m = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
  return m?.role ?? null;
}
async function requireOwner(req: AuthRequest) {
  if ((await myRole(hid(req), uid(req))) !== "OWNER") throw new HttpError(403, "Só o dono do grupo pode fazer isso");
}

householdRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const [household, members, invites] = await Promise.all([
      prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
      membersOf(householdId),
      prisma.householdInvite.findMany({
        where: { householdId, acceptedAt: null, expiresAt: { gt: new Date() } },
        include: { invitedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      id: household.id,
      name: household.name,
      myRole: members.find((m) => m.userId === uid(req))?.role,
      members,
      invites: invites.map((i) => ({ id: i.id, email: i.email, token: i.token, expiresAt: i.expiresAt, invitedBy: i.invitedBy.name })),
    });
  }),
);

householdRouter.put(
  "/",
  ah(async (req: AuthRequest, res) => {
    await requireOwner(req);
    const { name } = z.object({ name: z.string().trim().min(1, "Informe o nome").max(60) }).parse(req.body);
    await prisma.household.update({ where: { id: hid(req) }, data: { name } });
    res.json({ ok: true });
  }),
);

/** Cria um convite e devolve o link para compartilhar (WhatsApp, e-mail…). */
householdRouter.post(
  "/convites",
  ah(async (req: AuthRequest, res) => {
    await requireOwner(req);
    const { email } = z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido") }).parse(req.body);
    const householdId = hid(req);
    const already = await prisma.householdMember.findFirst({ where: { householdId, user: { email } } });
    if (already) throw new HttpError(409, "Essa pessoa já faz parte do grupo");
    // Substitui convite pendente anterior para o mesmo e-mail
    await prisma.householdInvite.deleteMany({ where: { householdId, email, acceptedAt: null } });
    const invite = await prisma.householdInvite.create({
      data: {
        householdId,
        email,
        token: crypto.randomBytes(24).toString("base64url"),
        invitedById: uid(req),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
    });
    res.status(201).json({ id: invite.id, token: invite.token, expiresAt: invite.expiresAt });
  }),
);

householdRouter.delete(
  "/convites/:id",
  ah(async (req: AuthRequest, res) => {
    await requireOwner(req);
    await prisma.householdInvite.deleteMany({ where: { id: req.params.id as string, householdId: hid(req) } });
    res.status(204).end();
  }),
);

/** Remove um membro (dono) — os lançamentos dele continuam no grupo, como Família. */
householdRouter.delete(
  "/membros/:userId",
  ah(async (req: AuthRequest, res) => {
    await requireOwner(req);
    const target = req.params.userId as string;
    if (target === uid(req)) throw new HttpError(400, "Para sair do grupo, use “Sair do grupo”");
    await removeMember(hid(req), target);
    res.status(204).end();
  }),
);

householdRouter.post(
  "/sair",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const members = await membersOf(householdId);
    if (members.length === 1) throw new HttpError(400, "Você é o único membro; não é possível sair deste grupo");
    const owners = members.filter((m) => m.role === "OWNER");
    if (owners.length === 1 && owners[0].userId === uid(req)) {
      // passa a posse para o membro mais antigo
      const next = members.find((m) => m.userId !== uid(req))!;
      await prisma.householdMember.update({ where: { householdId_userId: { householdId, userId: next.userId } }, data: { role: "OWNER" } });
    }
    await removeMember(householdId, uid(req));
    res.status(204).end();
  }),
);

async function removeMember(householdId: string, userId: string) {
  await prisma.$transaction([
    // o que era dele vira "Família" (o histórico do grupo não se perde)
    prisma.transaction.updateMany({ where: { householdId, responsibleId: userId }, data: { responsibleId: null } }),
    prisma.recurrence.updateMany({ where: { householdId, responsibleId: userId }, data: { responsibleId: null } }),
    prisma.installmentPlan.updateMany({ where: { householdId, responsibleId: userId }, data: { responsibleId: null } }),
    prisma.loan.updateMany({ where: { householdId, responsibleId: userId }, data: { responsibleId: null } }),
    prisma.monthPlan.deleteMany({ where: { householdId, userId } }),
    prisma.budget.deleteMany({ where: { householdId, userId } }),
    prisma.householdMember.delete({ where: { householdId_userId: { householdId, userId } } }),
  ]);
}

/** Dados públicos do convite (para a tela de aceitar, mesmo sem login). */
invitesRouter.get(
  "/:token",
  ah(async (req, res) => {
    const inv = await prisma.householdInvite.findUnique({
      where: { token: req.params.token as string },
      include: { household: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, "Convite inválido ou expirado");
    res.json({ householdName: inv.household.name, invitedBy: inv.invitedBy.name, email: inv.email, expiresAt: inv.expiresAt });
  }),
);

invitesRouter.post(
  "/:token/aceitar",
  requireAuth,
  ah(async (req: AuthRequest, res) => {
    const inv = await prisma.householdInvite.findUnique({ where: { token: req.params.token as string } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, "Convite inválido ou expirado");
    const userId = uid(req);
    await prisma.$transaction(async (tx) => {
      const exists = await tx.householdMember.findUnique({ where: { householdId_userId: { householdId: inv.householdId, userId } } });
      if (!exists) await tx.householdMember.create({ data: { householdId: inv.householdId, userId, role: inv.role } });
      await tx.householdInvite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    });
    res.json({ householdId: inv.householdId });
  }),
);
