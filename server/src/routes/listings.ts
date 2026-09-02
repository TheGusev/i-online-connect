/**
 * Раздел «Рядом» — объявления по жизненным задачам.
 *
 * GET    /api/listings                  — поиск: ?city=&category=&q=&limit=&cursor=
 * GET    /api/listings/mine             — свои объявления (любой статус)
 * GET    /api/listings/:id              — карточка
 * POST   /api/listings                  — создать (город берётся из профиля)
 * PATCH  /api/listings/:id              — правка своего объявления
 * POST   /api/listings/:id/close        — закрыть
 * POST   /api/listings/:id/respond      — откликнуться → обычный диалог
 * GET    /api/listings/needs            — свои категории потребностей
 * PUT    /api/listings/needs            — заменить набор категорий
 *
 * Переиспользуем общие примитивы: город из profiles, доверие profiles.trust_level,
 * фото из profile_media (/api/media), чат conversations/messages, жалобы reports.
 * Логика знакомств (matching, daily_feed) не затрагивается.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { query, queryOne, transaction } from "../db.ts";
import { badRequest, forbidden, notFound } from "../http.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { notifyListingMatches } from "../listings/notify.ts";
import { publishUserEvent } from "../ws/notifications.ts";

const NEED_CATEGORIES = ["sale", "service", "leisure", "travel", "help"] as const;
const categorySchema = z.enum(NEED_CATEGORIES);

const idParam = z.object({ id: z.string().uuid() });

// Анти-спам: лимиты считаются по аккаунту (keyGenerator в index.ts).
const ACTIVE_LISTINGS_LIMIT = 15;

const RESPOND_LIMIT = {
  rateLimit: {
    max: 30,
    timeWindow: "1 hour",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Слишком много откликов подряд. Попробуйте через час.",
    }),
  },
};

const PATCH_LIMIT = {
  rateLimit: {
    max: 60,
    timeWindow: "1 hour",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Слишком много изменений подряд. Попробуйте чуть позже.",
    }),
  },
};

// Новые поля добавляем только опциональными — старые клиенты не присылают их
// и получают прежнее поведение (см. правило совместимости в API.md).
const createSchema = z.object({
  category: categorySchema,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  priceMinor: z.number().int().min(0).max(1_000_000_000).nullish(),
  city: z.string().trim().min(2).max(120).optional(),
  mediaIds: z.array(z.string().uuid()).max(6).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  priceMinor: z.number().int().min(0).max(1_000_000_000).nullish(),
  state: z.enum(["active", "closed"]).optional(),
  mediaIds: z.array(z.string().uuid()).max(6).optional(),
});

const LISTING_SELECT = `
  SELECT l.id, l.category, l.city, l.title, l.description, l.price_minor, l.currency,
         l.state, l.expires_at, l.created_at,
         l.author_id,
         p.name        AS author_name,
         p.trust_level AS author_trust,
         (SELECT url FROM profile_media
           WHERE user_id = l.author_id AND kind = 'photo'
           ORDER BY is_primary DESC, position LIMIT 1) AS author_avatar,
         ARRAY(
           SELECT m.url FROM listing_media lm
             JOIN profile_media m ON m.id = lm.media_id
            WHERE lm.listing_id = l.id
            ORDER BY lm.position
         ) AS photos,
         (SELECT count(*) FROM listing_responses r WHERE r.listing_id = l.id)::int AS responses_count,
         (SELECT conversation_id FROM listing_responses r
           WHERE r.listing_id = l.id AND r.user_id = $1) AS my_conversation_id
    FROM listings l
    JOIN profiles p ON p.user_id = l.author_id
    JOIN users u    ON u.id = l.author_id AND u.deleted_at IS NULL
`;

interface ListingRow {
  id: string;
  category: (typeof NEED_CATEGORIES)[number];
  city: string;
  title: string;
  description: string;
  price_minor: number | null;
  currency: string;
  state: "active" | "closed" | "expired";
  expires_at: Date;
  created_at: Date;
  author_id: string;
  author_name: string;
  author_trust: "new" | "verified" | "trusted" | "ambassador";
  author_avatar: string | null;
  photos: string[] | null;
  responses_count: number;
  my_conversation_id: string | null;
}

function toListingDto(row: ListingRow, userId: string) {
  return {
    id: row.id,
    category: row.category,
    city: row.city,
    title: row.title,
    description: row.description,
    priceMinor: row.price_minor,
    currency: row.currency,
    state: row.state,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    photos: row.photos ?? [],
    responsesCount: row.responses_count,
    respondedConversationId: row.my_conversation_id,
    isMine: row.author_id === userId,
    author: {
      id: row.author_id,
      name: row.author_name,
      trustLevel: row.author_trust,
      avatarUrl: row.author_avatar,
    },
  };
}

/** Своё объявление или 403/404 — проверка перед любой правкой. */
async function assertOwnListing(listingId: string, userId: string) {
  const row = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM listings WHERE id = $1",
    [listingId],
  );
  if (!row) throw notFound("Объявление не найдено");
  if (row.author_id !== userId) throw forbidden("Это объявление другого человека");
}

/** Привязка фото: только свои файлы из profile_media. */
async function attachMedia(listingId: string, userId: string, mediaIds: string[]) {
  await query("DELETE FROM listing_media WHERE listing_id = $1", [listingId]);
  if (mediaIds.length === 0) return;
  const owned = await query<{ id: string }>(
    "SELECT id FROM profile_media WHERE user_id = $1 AND kind = 'photo' AND id = ANY($2::uuid[])",
    [userId, mediaIds],
  );
  const ownedIds = new Set(owned.map((row) => row.id));
  const ordered = mediaIds.filter((id) => ownedIds.has(id));
  for (const [index, mediaId] of ordered.entries()) {
    await query(
      `INSERT INTO listing_media (listing_id, media_id, position)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [listingId, mediaId, index],
    );
  }
}

export async function listingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ── Категории жизненных потребностей ─────────────────────────────────────
  app.get("/needs", async (request) => {
    const userId = currentUserId(request);
    const rows = await query<{ category: string }>(
      "SELECT category FROM user_needs WHERE user_id = $1 ORDER BY category",
      [userId],
    );
    return { categories: rows.map((row) => row.category) };
  });

  app.put("/needs", async (request) => {
    const userId = currentUserId(request);
    const { categories } = z
      .object({ categories: z.array(categorySchema).max(NEED_CATEGORIES.length) })
      .parse(request.body);
    const unique = [...new Set(categories)];

    await transaction(async (client) => {
      await client.query("DELETE FROM user_needs WHERE user_id = $1", [userId]);
      for (const category of unique) {
        await client.query(
          `INSERT INTO user_needs (user_id, category) VALUES ($1, $2::need_category)
           ON CONFLICT DO NOTHING`,
          [userId, category],
        );
      }
    });

    return { categories: unique };
  });

  // ── Поиск ────────────────────────────────────────────────────────────────
  app.get("/", async (request) => {
    const userId = currentUserId(request);
    const filters = z
      .object({
        city: z.string().trim().min(2).max(120).optional(),
        category: categorySchema.optional(),
        q: z.string().trim().max(120).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
        onlyMyNeeds: z.coerce.boolean().optional(),
      })
      .parse(request.query);

    // По умолчанию показываем свой город: «Я Онлайн» — про людей рядом.
    const profile = await queryOne<{ city: string | null }>(
      "SELECT city FROM profiles WHERE user_id = $1",
      [userId],
    );
    const city = filters.city ?? profile?.city ?? null;

    const rows = await query<ListingRow>(
      `${LISTING_SELECT}
        WHERE l.state = 'active'
          AND l.expires_at > now()
          AND ($2::text IS NULL OR lower(l.city) = lower($2))
          AND ($3::need_category IS NULL OR l.category = $3::need_category)
          AND ($4::text IS NULL OR l.title ILIKE '%' || $4 || '%' OR l.description ILIKE '%' || $4 || '%')
          AND ($5::boolean IS NOT TRUE OR l.category IN (
                SELECT category FROM user_needs WHERE user_id = $1))
          AND NOT EXISTS (
                SELECT 1 FROM blocks b
                 WHERE (b.user_id = $1 AND b.blocked_id = l.author_id)
                    OR (b.user_id = l.author_id AND b.blocked_id = $1)
              )
        ORDER BY l.created_at DESC
        LIMIT $6`,
      [
        userId,
        city,
        filters.category ?? null,
        filters.q ?? null,
        filters.onlyMyNeeds ?? false,
        filters.limit ?? 30,
      ],
    );

    return { city, items: rows.map((row) => toListingDto(row, userId)) };
  });

  app.get("/mine", async (request) => {
    const userId = currentUserId(request);
    const rows = await query<ListingRow>(
      `${LISTING_SELECT} WHERE l.author_id = $1 ORDER BY l.created_at DESC LIMIT 100`,
      [userId],
    );
    return rows.map((row) => toListingDto(row, userId));
  });

  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    const row = await queryOne<ListingRow>(`${LISTING_SELECT} WHERE l.id = $2`, [userId, id]);
    if (!row) throw notFound("Объявление не найдено");
    return toListingDto(row, userId);
  });

  // ── Создание ─────────────────────────────────────────────────────────────
  app.post(
    "/",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: "Too Many Requests",
            message: "Слишком много объявлений подряд. Попробуйте через час.",
          }),
        },
      },
    },
    async (request) => {
      const userId = currentUserId(request);
      const draft = createSchema.parse(request.body);

      // Лимит по времени не мешает накопить сотни объявлений за неделю —
      // ограничиваем ещё и общее число активных.
      const active = await queryOne<{ count: number }>(
        `SELECT count(*)::int AS count FROM listings
          WHERE author_id = $1 AND state = 'active' AND expires_at > now()`,
        [userId],
      );
      if ((active?.count ?? 0) >= ACTIVE_LISTINGS_LIMIT) {
        throw badRequest(
          `Можно держать не больше ${ACTIVE_LISTINGS_LIMIT} активных объявлений. Закройте старое, чтобы опубликовать новое.`,
        );
      }

      const profile = await queryOne<{ city: string | null; name: string }>(
        "SELECT city, name FROM profiles WHERE user_id = $1",
        [userId],
      );
      const city = draft.city ?? profile?.city ?? null;
      if (!city) throw badRequest("Укажите город в профиле — объявления показываются по городу");

      const row = await queryOne<{ id: string }>(
        `INSERT INTO listings (author_id, category, city, title, description, price_minor, expires_at)
         VALUES ($1, $2::need_category, $3, $4, $5, $6,
                 now() + make_interval(days => $7::int))
         RETURNING id`,
        [
          userId,
          draft.category,
          city,
          draft.title,
          draft.description ?? "",
          draft.priceMinor ?? null,
          draft.expiresInDays ?? 30,
        ],
      );
      if (!row) throw badRequest("Не удалось сохранить объявление");

      if (draft.mediaIds?.length) await attachMedia(row.id, userId, draft.mediaIds);

      // Уведомления не должны блокировать ответ: ошибки только логируем.
      void notifyListingMatches({
        listingId: row.id,
        authorId: userId,
        authorName: profile?.name ?? "",
        category: draft.category,
        city,
        title: draft.title,
        priceMinor: draft.priceMinor ?? null,
      }).catch((error) => console.error("[listings] уведомления не отправлены", error));

      const created = await queryOne<ListingRow>(`${LISTING_SELECT} WHERE l.id = $2`, [
        userId,
        row.id,
      ]);
      return created ? toListingDto(created, userId) : { id: row.id };
    },
  );

  // ── Правка / закрытие ────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/:id", { config: PATCH_LIMIT }, async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertOwnListing(id, userId);
    const patch = patchSchema.parse(request.body);

    await query(
      `UPDATE listings SET
         title       = COALESCE($2, title),
         description = COALESCE($3, description),
         price_minor = CASE WHEN $4::boolean THEN $5 ELSE price_minor END,
         state       = COALESCE($6::listing_state, state),
         updated_at  = now()
       WHERE id = $1`,
      [
        id,
        patch.title ?? null,
        patch.description ?? null,
        patch.priceMinor !== undefined,
        patch.priceMinor ?? null,
        patch.state ?? null,
      ],
    );

    if (patch.mediaIds) await attachMedia(id, userId, patch.mediaIds);

    const row = await queryOne<ListingRow>(`${LISTING_SELECT} WHERE l.id = $2`, [userId, id]);
    if (!row) throw notFound("Объявление не найдено");
    return toListingDto(row, userId);
  });

  app.post<{ Params: { id: string } }>("/:id/close", async (request) => {
    const userId = currentUserId(request);
    const { id } = idParam.parse(request.params);
    await assertOwnListing(id, userId);
    await query("UPDATE listings SET state = 'closed', updated_at = now() WHERE id = $1", [id]);
    return { ok: true as const };
  });

  // ── Отклик: открываем обычный диалог ─────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/:id/respond",
    { config: RESPOND_LIMIT },
    async (request) => {
      const userId = currentUserId(request);
      const { id } = idParam.parse(request.params);
      const body = z
        .object({ text: z.string().trim().min(1).max(1000).optional() })
        .parse(request.body ?? {});

      const listing = await queryOne<{ author_id: string; state: string; title: string }>(
        "SELECT author_id, state, title FROM listings WHERE id = $1",
        [id],
      );
      if (!listing) throw notFound("Объявление не найдено");
      if (listing.author_id === userId) throw badRequest("Это ваше объявление");
      if (listing.state !== "active") throw badRequest("Объявление уже закрыто");

      const blocked = await queryOne(
        `SELECT 1 FROM blocks
        WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`,
        [userId, listing.author_id],
      );
      if (blocked) throw forbidden("Диалог недоступен");

      const existing = await queryOne<{ conversation_id: string }>(
        "SELECT conversation_id FROM listing_responses WHERE listing_id = $1 AND user_id = $2",
        [id, userId],
      );
      if (existing) return { conversationId: existing.conversation_id, created: false as const };

      const conversationId = await transaction(async (client) => {
        const conversation = await client.query<{ id: string }>(
          "INSERT INTO conversations (match_id) VALUES (NULL) RETURNING id",
          [],
        );
        const newId = conversation.rows[0]?.id;
        if (!newId) throw badRequest("Не удалось открыть диалог");

        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
          [newId, userId, listing.author_id],
        );
        await client.query(
          `INSERT INTO listing_responses (listing_id, user_id, conversation_id)
         VALUES ($1, $2, $3)`,
          [id, userId, newId],
        );
        await client.query(
          `INSERT INTO messages (conversation_id, author_id, kind, text)
         VALUES ($1, $2, 'text', $3)`,
          [newId, userId, body.text ?? `Здравствуйте! Пишу по объявлению «${listing.title}».`],
        );
        return newId;
      });

      // Автору — уведомление об отклике. ON CONFLICT: уникальный индекс по
      // (user_id, kind, listingId) не должен ломать сам отклик.
      try {
        const payload = { listingId: id, conversationId, title: listing.title };
        const rows = await query<{ id: string; created_at: Date }>(
          `INSERT INTO notifications (user_id, kind, payload)
         VALUES ($1, 'listing_response', $2::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING id, created_at`,
          [listing.author_id, JSON.stringify(payload)],
        );
        const created = rows[0];
        if (created) {
          publishUserEvent(listing.author_id, {
            type: "notification",
            notification: {
              id: created.id,
              kind: "listing_response",
              payload,
              readAt: null,
              createdAt: created.created_at.toISOString(),
            },
          });
        }
      } catch (error) {
        console.error("[listings] уведомление об отклике", error);
      }

      return { conversationId, created: true as const };
    },
  );
}
