import webpush from "web-push";
import { prisma } from "./prisma.js";

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:avisos@gerenciador-financeiro.app";

export const pushEnabled = !!(PUBLIC && PRIVATE);
if (pushEnabled) webpush.setVapidDetails(SUBJECT, PUBLIC!, PRIVATE!);

export const vapidPublicKey = () => PUBLIC ?? null;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Envia para todos os aparelhos do usuário. Inscrições que o serviço de push diz
 * que expiraram (404/410) são removidas; outras falhas só incrementam o contador.
 * Devolve quantos aparelhos receberam.
 */
export async function sendToUser(userId: string, payload: PushPayload) {
  if (!pushEnabled) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 3600, urgency: "normal" },
        );
        delivered++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { failureCount: 0, lastSuccessAt: new Date() } });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || s.failureCount >= 9) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } }).catch(() => {});
        }
      }
    }),
  );
  return delivered;
}
