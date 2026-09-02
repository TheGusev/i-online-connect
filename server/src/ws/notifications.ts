/**
 * WebSocket персональных уведомлений: ws(s)://<host>/ws/notifications
 *
 * Тот же принцип авторизации, что и у чата: короткоживущий access-токен в
 * query (?token=...), потому что браузерный WebSocket не ставит заголовки.
 *
 * Канал только для доставки: клиент ничего не присылает, сервер пушит
 * { type: "notification", notification: {...} }. Если пользователь офлайн,
 * запись всё равно лежит в таблице notifications и придёт при следующем заходе
 * (плюс письмо, если включено в notification_prefs).
 *
 * ВНИМАНИЕ при масштабировании: сокеты живут в памяти процесса — см. коммент
 * в ws/chat.ts.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

import { verifyAccessToken } from "../auth/tokens.ts";

const userSockets = new Map<string, Set<WebSocket>>();

export interface NotificationEvent {
  type: "notification";
  notification: unknown;
}

/** Доставить уведомление всем открытым вкладкам пользователя. */
export function publishUserEvent(userId: string, event: NotificationEvent): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(payload);
  }
}

export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export async function notificationSocketRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { token?: string } }>(
    "/notifications",
    { websocket: true },
    async (socket, request) => {
      const token = request.query.token;
      if (!token) {
        socket.close(4401, "no token");
        return;
      }

      let userId: string;
      try {
        userId = (await verifyAccessToken(token)).sub;
      } catch {
        socket.close(4401, "bad token");
        return;
      }

      const sockets = userSockets.get(userId) ?? new Set<WebSocket>();
      sockets.add(socket);
      userSockets.set(userId, sockets);

      socket.on("close", () => {
        sockets.delete(socket);
        if (sockets.size === 0) userSockets.delete(userId);
      });
    },
  );
}
