import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUserId } from "../auth/middleware.ts";
import { queryOne, transaction } from "../db.ts";
import { notFound } from "../http.ts";

const titleSchema = z.string().trim().min(1).max(80);
const paramsSchema = z.object({ id: z.string().uuid() });

/** Registered inside authenticated chatRoutes, not as a public plugin. */
export async function noteConversationRoutes(app: FastifyInstance) {
  app.post(
    "/notes",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const body = z.object({
        title: titleSchema,
        clientTempId: z.string().uuid(),
      }).strict().parse(request.body);

      const conversationId = await transaction(async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO conversations
             (notes_owner_id, notes_title, notes_request_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (notes_owner_id, notes_request_id)
             WHERE notes_owner_id IS NOT NULL
           DO UPDATE SET notes_title = conversations.notes_title
           RETURNING id`,
          [userId, body.title, body.clientTempId],
        );
        const id = result.rows[0]?.id;
        if (!id) throw new Error("Note chat creation failed");
        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, userId],
        );
        return id;
      });
      return { conversationId };
    },
  );

  app.patch("/notes/:id", async (request) => {
    const userId = currentUserId(request);
    const { id } = paramsSchema.parse(request.params);
    const { title } = z.object({
      title: titleSchema,
    }).strict().parse(request.body);
    const updated = await queryOne<{ id: string; notes_title: string }>(
      `UPDATE conversations SET notes_title = $3
        WHERE id = $1 AND notes_owner_id = $2
        RETURNING id, notes_title`,
      [id, userId, title],
    );
    if (!updated) throw notFound("Чат заметок не найден");
    return { conversationId: updated.id, title: updated.notes_title };
  });
}
