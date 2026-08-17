/**
 * POST /api/onboarding — сохранение собранного в диалоге профиля одним объектом.
 *
 * Возвращает User: фронтенд сразу показывает готовый профиль.
 * Проверка 18+ — здесь, а не только в интерфейсе.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { queryOne, transaction } from "../db.ts";
import { badRequest, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { toUserDto, type ProfileRow } from "../types.ts";

const draftSchema = z.object({
  name: z.string().min(2).max(80),
  age: z.number().int().min(18, "Платформа доступна с 18 лет").max(120),
  intent: z.enum(["serious", "friends", "projects", "unsure"]),
  about: z.string().max(2000).default(""),
  interests: z.array(z.string().min(1).max(60)).max(20).default([]),
  values: z
    .object({
      values: z.string().max(500).default(""),
      joy: z.string().max(500).default(""),
      dealbreakers: z.string().max(500).default(""),
    })
    .default({ values: "", joy: "", dealbreakers: "" }),
  city: z.string().max(120).default(""),
  hideExactLocation: z.boolean().default(true),
  // Имена файлов из шага «медиа». Сами файлы загружаются отдельным
  // запросом на /api/media (multipart) — в БД попадают только пути.
  photoName: z.string().max(300).nullable().default(null),
  videoName: z.string().max(300).nullable().default(null),
  videoSkipped: z.boolean().default(false),
});

const PROFILE_SELECT = `
  SELECT u.id, p.name, p.age, p.city, p.bio, p.trust_level, p.trust_score, u.last_seen_at,
         ARRAY(
           SELECT i.label FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
            WHERE ui.user_id = u.id
         ) AS interests
    FROM users u JOIN profiles p ON p.user_id = u.id
   WHERE u.id = $1
`;

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/", async (request) => {
    const userId = currentUserId(request);
    const draft = draftSchema.parse(request.body);
    if (draft.age < 18) throw badRequest("Платформа доступна с 18 лет");

    await transaction(async (client) => {
      await client.query(
        `UPDATE profiles SET
           name = $2, age = $3, city = $4, bio = $5,
           intent = $6, values_text = $7, joy_text = $8, dealbreakers_text = $9,
           onboarded_at = COALESCE(onboarded_at, now()), updated_at = now()
         WHERE user_id = $1`,
        [
          userId,
          draft.name,
          draft.age,
          draft.city,
          draft.about,
          draft.intent,
          draft.values.values,
          draft.values.joy,
          draft.values.dealbreakers,
        ],
      );

      await client.query(
        `UPDATE privacy_settings SET exact_location = $2, updated_at = now() WHERE user_id = $1`,
        [userId, draft.hideExactLocation ? "matches" : "everyone"],
      );

      // Интересы: недостающие добавляем в справочник, затем пересобираем связи.
      await client.query("DELETE FROM user_interests WHERE user_id = $1", [userId]);
      for (const label of draft.interests) {
        const slug = label.trim().toLowerCase().replace(/\s+/g, "-");
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO interests (slug, label) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label
           RETURNING id`,
          [slug, label.trim()],
        );
        const interestId = rows[0]?.id;
        if (interestId) {
          await client.query(
            `INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [userId, interestId],
          );
        }
      }

      // Ценности как отдельные метки для карточки профиля.
      await client.query("DELETE FROM profile_values WHERE user_id = $1", [userId]);
      for (const value of [draft.values.values, draft.values.joy].filter(Boolean)) {
        await client.query(
          "INSERT INTO profile_values (user_id, value) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, value.slice(0, 60)],
        );
      }
    });

    const row = await queryOne<ProfileRow>(PROFILE_SELECT, [userId]);
    if (!row) throw notFound("Профиль не найден");
    return toUserDto(row);
  });
}
