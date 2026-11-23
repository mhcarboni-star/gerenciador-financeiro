import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { pushEnabled, sendToUser, vapidPublicKey } from "../lib/push.js";
import { buildMessage, DEFAULT_SETTINGS, dueItemsFor, localNow, runDueNotifications } from "../lib/dueNotifications.js";
import { generateForHousehold } from "../lib/recurrenceService.js";

export const pushRouter = Router();
export const jobsRouter = Router();

/** Configuração do usuário + aparelhos inscritos. */
pushRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const [settings, devices, member] = await Promise.all([
      prisma.notificationSettings.findUnique({ where: { userId: uid(req) } }),
      prisma.pushSubscription.findMany({ where: { userId: uid(req) }, select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastSuccessAt: true } }),
      prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: hid(req), userId: uid(req) } } }),
    ]);
    res.json({
      enabled: pushEnabled,
      publicKey: vapidPublicKey(),
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      notifyThisHousehold: member?.notifyDueItems ?? true,
      devices,
    });
  }),
);

const subSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
  userAgent: z.string().max(300).optional(),
});

/** Inscreve este aparelho (ou atualiza, se já existir). */
pushRouter.post(
  "/inscricoes",
  ah(async (req: AuthRequest, res) => {
    if (!pushEnabled) throw new HttpError(503, "Avisos ainda não configurados no servidor");
    const v = subSchema.parse(req.body);
    await prisma.pushSubscription.upsert({
      where: { endpoint: v.endpoint },
      create: { userId: uid(req), endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent },
      update: { userId: uid(req), p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent, failureCount: 0 },
    });
    res.status(201).json({ ok: true });
  }),
);

pushRouter.delete(
  "/inscricoes",
  ah(async (req: AuthRequest, res) => {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: uid(req) } });
    res.status(204).end();
  }),
);

pushRouter.delete(
  "/inscricoes/:id",
  ah(async (req: AuthRequest, res) => {
    await prisma.pushSubscription.deleteMany({ where: { id: req.params.id as string, userId: uid(req) } });
    res.status(204).end();
  }),
);

const settingsSchema = z.object({
  dueItemsEnabled: z.boolean(),
  includeOverdue: z.boolean(),
  sendHour: z.number().int().min(5).max(21),
  timezone: z.string().regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/),
  notifyThisHousehold: z.boolean(),
});

pushRouter.put(
  "/preferencias",
  ah(async (req: AuthRequest, res) => {
    const { notifyThisHousehold, ...s } = settingsSchema.parse(req.body);
    try {
      new Intl.DateTimeFormat("en", { timeZone: s.timezone });
    } catch {
      throw new HttpError(400, "Fuso horário inválido");
    }
    await prisma.$transaction([
      prisma.notificationSettings.upsert({ where: { userId: uid(req) }, create: { userId: uid(req), ...s }, update: s }),
      prisma.householdMember.update({
        where: { householdId_userId: { householdId: hid(req), userId: uid(req) } },
        data: { notifyDueItems: notifyThisHousehold },
      }),
    ]);
    res.json({ ok: true });
  }),
);

/** Envia agora um aviso de teste com as contas de hoje (ou uma mensagem de exemplo). */
pushRouter.post(
  "/teste",
  ah(async (req: AuthRequest, res) => {
    const settings = { ...DEFAULT_SETTINGS, ...((await prisma.notificationSettings.findUnique({ where: { userId: uid(req) } })) ?? {}) };
    const today = localNow(settings.timezone).date;
    await generateForHousehold(hid(req));
    const items = await dueItemsFor(uid(req), today, settings.includeOverdue);
    const msg = items.length
      ? buildMessage(items, today)
      : { title: "Avisos ativados", body: "Tudo certo! Nos dias com contas, você recebe a lista aqui." };
    const reached = await sendToUser(uid(req), { ...msg, url: "/", tag: "teste" });
    if (reached === 0) throw new HttpError(400, "Nenhum aparelho recebeu. Ative os avisos neste celular primeiro.");
    res.json({ reached });
  }),
);

/**
 * Tarefa de hora em hora (chamada pelo GitHub Actions). Protegida por JOB_SECRET.
 * Gera as recorrências de todos os grupos e envia os avisos devidos.
 */
jobsRouter.post(
  "/hourly",
  ah(async (req, res) => {
    const secret = process.env.JOB_SECRET;
    const given = req.header("x-job-secret") ?? "";
    const ok = !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) throw new HttpError(401, "Não autorizado");
    const households = await prisma.household.findMany({ select: { id: true } });
    for (const h of households) await generateForHousehold(h.id);
    const result = await runDueNotifications();
    res.json({ households: households.length, ...result });
  }),
);
