import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";

/**
 * Valida o responsável informado: undefined → padrão (quem está lançando);
 * null → Família (conjunto); id → precisa ser membro do grupo.
 */
export async function resolveResponsible(householdId: string, userId: string, value: string | null | undefined) {
  if (value === undefined) return userId;
  if (value === null) return null;
  const m = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId: value } } });
  if (!m) throw new HttpError(400, "O responsável precisa ser membro do grupo");
  return value;
}

export async function membersOf(householdId: string) {
  const rows = await prisma.householdMember.findMany({
    where: { householdId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.joinedAt }));
}
