import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET não definido");
const JWT_SECRET: string = secret;

export interface AuthRequest extends Request {
  userId?: string;
  householdId?: string;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

/**
 * Exige login e resolve o grupo ativo: header `X-Household-Id` se enviado
 * (e o usuário for membro), senão o primeiro grupo do usuário.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  let userId: string;
  try {
    userId = (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return res.status(401).json({ error: "Sessão expirada, entre novamente" });
  }
  try {
    const wanted = req.header("x-household-id");
    const membership = await prisma.householdMember.findFirst({
      where: { userId, ...(wanted ? { householdId: wanted } : {}) },
      orderBy: { joinedAt: "asc" },
    });
    if (!membership) {
      return wanted
        ? res.status(403).json({ error: "Sem acesso a este grupo" })
        : res.status(401).json({ error: "Usuário sem grupo" });
    }
    req.userId = userId;
    req.householdId = membership.householdId;
    next();
  } catch (e) {
    next(e);
  }
}

/** userId garantido (usar apenas em rotas protegidas por requireAuth). */
export const uid = (req: AuthRequest) => req.userId as string;
/** householdId garantido (usar apenas em rotas protegidas por requireAuth). */
export const hid = (req: AuthRequest) => req.householdId as string;
