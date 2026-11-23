import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { createHouseholdForUser } from "../lib/household.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const publicUser = (u: { id: string; name: string; email: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

authRouter.post(
  "/register",
  ah(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new HttpError(409, "Já existe uma conta com este e-mail");
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: data.name, email: data.email, passwordHash } });
      await createHouseholdForUser(tx, u.id, u.name);
      return u;
    });
    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  ah(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      throw new HttpError(401, "E-mail ou senha incorretos");
    }
    res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  ah(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: uid(req) } });
    if (!user) throw new HttpError(401, "Usuário não encontrado");
    res.json(publicUser(user));
  }),
);
