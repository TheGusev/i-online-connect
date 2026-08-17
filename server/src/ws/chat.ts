/**
 * WebSocket чата: ws(s)://<host>/ws/chat/:conversationId
 *
 * Контракт событий совпадает с ChatSocketEvent на фронтенде
 * (src/features/chat/useChatSocket.ts):
 *   { type: "message" | "typing" | "read", conversationId, message?, authorId? }
 *
 * Авторизация: access-токен передаётся в query (?token=...), потому что
 * браузерный WebSocket не умеет ставить заголовок Authorization.
 * Токен короткоживущий, соединение — по wss, поэтому это допустимо.
 *
 * ВНИМАНИЕ при масштабировании: комнаты живут в памяти процесса. Под PM2 в
 * cluster mode нужен общий канал (Redis pub/sub или LISTEN/NOTIFY в Postgres),
 * иначе события не дойдут до клиентов на другом процессе. Пока instances = 1
 * или используйте sticky-соединения на Nginx.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

import { queryOne } from "../db.ts";
import { verifyAccessToken } from "../auth/tokens.ts";

export interface ChatSocketEvent {
  type: "message" | "typing" | "read";
  conversationId: string;
  message?: unknown;
  authorId?: string;
}

const rooms = new Map<string, Set<WebSocket>>();

/** Разослать событие всем, кто открыл этот диалог. */
export function publishChatEvent(conversationId: string, event: ChatSocketEvent): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const payload = JSON.stringify(event);
  for (const socket of room) {
    if (socket.readyState === 1) socket.send(payload);
  }
}

export async function chatSocketRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    "/chat/:id",
    { websocket: true },
    async (socket, request) => {
      const conversationId = request.params.id;
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

      // Тот же контроль доступа, что и в HTTP-роутах.
      const member = await queryOne(
        "SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2",
        [conversationId, userId],
      );
      if (!member) {
        socket.close(4403, "forbidden");
        return;
      }

      const room = rooms.get(conversationId) ?? new Set<WebSocket>();
      room.add(socket);
      rooms.set(conversationId, room);

      socket.on("message", (raw: Buffer) => {
        // Через сокет принимаем только «печатает…». Сообщения идут по HTTP,
        // чтобы запись в БД и валидация были в одном месте.
        try {
          const parsed = JSON.parse(raw.toString()) as { type?: string };
          if (parsed.type === "typing") {
            const payload = JSON.stringify({ type: "typing", conversationId, authorId: userId });
            for (const peer of room) {
              if (peer !== socket && peer.readyState === 1) peer.send(payload);
            }
          }
        } catch {
          /* мусорные кадры игнорируем */
        }
      });

      socket.on("close", () => {
        room.delete(socket);
        if (room.size === 0) rooms.delete(conversationId);
      });
    },
  );
}
