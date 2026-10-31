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
import { HttpError, badRequest, forbidden, notFound } from "../http.ts";
import { checkListingPhotos } from "../listings/photos.ts";
import { currentUserId, requireAuth } from "../auth/middleware.ts";
import { notifyListingMatches } from "../listings/notify.ts";
import {
  MAX_LISTING_PHOTOS,
  MAX_PHOTO_BYTES,
  assertSize,
  detectMediaType,
  saveListingFile,
  removeListingFile,
} from "../media/store.ts";
import { publishUserEvent } from "../ws/notifications.ts";
import { datingAccess, loadCompleteness } from "../profile/completeness.ts";
import { resolveDuration } from "../listings/durations.ts";
import { env } from "../env.ts";
import { URGENT_TYPES, URGENT_DURATIONS, validateSell, suggestPrices, normalizeTitleKey, NEW_ACCOUNT_MAX_ACTIVE, ACTIVE_MAX, floorHintPct } from "../listings/urgent.ts";
import { expireReservations, lotPrice, reserveLot, buyerAllowed, urgentEvent, insertUrgentNotification, deliverUrgent, type UrgentLot } from "../listings/urgent-jobs.ts";
import { hasVerifiedContact, verifiedContactSql } from "../auth/contact-rules.ts";

async function requireVerifiedContact(client:import('pg').PoolClient, userId:string) {
  const user=(await client.query(`SELECT ${verifiedContactSql} FROM users u WHERE u.id=$1`,[userId])).rows[0];
  if(!hasVerifiedContact(user)) throw new HttpError(403,'Подтвердите способ связи для срочной сделки','CONTACT_NOT_VERIFIED');
}

const profileIncomplete = () =>
  new HttpError(403, "Заполните анкету, чтобы открыть знакомства", "PROFILE_INCOMPLETE");

// Порядок значений совпадает с enum need_category в БД (миграции 005 и 008).
const NEED_CATEGORIES = [
  "dating",
  "service",
  "realty",
  "transport",
  "sale",
  "leisure",
  "travel",
  "help",
  "urgent",
] as const;
const categorySchema = z.enum(NEED_CATEGORIES);

const idParam = z.object({ id: z.string().uuid() });

// Анти-спам: лимиты считаются по аккаунту (keyGenerator в index.ts).
const ACTIVE_LISTINGS_LIMIT = 15;

/**
 * Сколько реальных активных объявлений в паре «город + категория» должно
 * появиться, чтобы демо-примеры этой пары перестали показываться.
 */
const SEED_HIDE_THRESHOLD = 10;

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
  district: z.string().trim().max(120).optional(),
  mediaIds: z.array(z.string().uuid()).optional(),
  urgentType: z.enum(URGENT_TYPES).optional(),
  marketPriceMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  priceStartMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  priceFloorMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
  expiresInMinutes: z.number().int().positive().optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  priceMinor: z.number().int().min(0).max(1_000_000_000).nullish(),
  district: z.string().trim().max(120).optional(),
  state: z.enum(["active", "closed"]).optional(),
  mediaIds: z.array(z.string().uuid()).optional(),
});

const LISTING_SELECT = `
  SELECT l.id, l.category, l.city, l.district, l.title, l.description, l.price_minor, l.currency,
         CASE WHEN l.state = 'active' AND l.expires_at <= now() THEN 'expired'::listing_state ELSE l.state END AS state,
         l.expires_at, l.created_at, l.is_seed,
         l.author_id, l.urgent_type, l.market_price_minor, l.price_start_minor, l.price_floor_minor, l.outcome, l.final_price_minor, l.closed_at,
         (SELECT count(*)::int FROM listing_watchers w WHERE w.listing_id=l.id) AS watchers_count,
         EXISTS(SELECT 1 FROM listing_watchers w WHERE w.listing_id=l.id AND w.user_id=$1) AS i_watch,
         (SELECT max_price_minor FROM listing_bids b WHERE b.listing_id=l.id AND b.buyer_id=$1 AND b.status='active') AS my_bid,
         (SELECT count(*)::int FROM listing_bids b WHERE b.listing_id=l.id AND b.status='active') AS bids_count,
         (SELECT max(max_price_minor) FROM listing_bids b WHERE b.listing_id=l.id AND b.status='active') AS highest_bid,
         (SELECT json_build_object('active',true,'mine',r.buyer_id=$1,'expiresAt',r.expires_at,'priceMinor',r.price_minor,'source',r.source)
          FROM listing_reservations r WHERE r.listing_id=l.id AND r.status='active' AND r.expires_at>now()) AS reservation,
         (SELECT json_build_object('id',r.id,'buyerName',bp.name,'expiresAt',r.expires_at,'priceMinor',r.price_minor,'source',r.source)
          FROM listing_reservations r JOIN profiles bp ON bp.user_id=r.buyer_id WHERE r.listing_id=l.id AND r.status='active' AND r.expires_at>now()) AS owner_reservation,
         p.name        AS author_name,
         p.trust_level AS author_trust,
         (SELECT url FROM profile_media
           WHERE user_id = l.author_id AND kind = 'photo'
           ORDER BY is_primary DESC, position LIMIT 1) AS author_avatar,
         ARRAY(
           SELECT COALESCE(f.url, m.url) FROM listing_media lm
             LEFT JOIN profile_media m  ON m.id = lm.media_id
             LEFT JOIN listing_files f  ON f.id = lm.file_id
            WHERE lm.listing_id = l.id AND COALESCE(f.url, m.url) IS NOT NULL
            ORDER BY lm.position
         ) AS photos,
         ((SELECT count(*) FROM listing_responses r WHERE r.listing_id = l.id) + COALESCE(l.seed_responses, 0))::int AS responses_count,
         (SELECT conversation_id FROM listing_responses r
           WHERE r.listing_id = l.id AND r.user_id = $1) AS my_conversation_id
    FROM listings l
    JOIN profiles p ON p.user_id = l.author_id
    JOIN users u    ON u.id = l.author_id AND u.deleted_at IS NULL
`;

interface ListingRow {
  urgent_type: string|null; market_price_minor:number|null; price_start_minor:number|null; price_floor_minor:number|null;
  outcome:string|null; final_price_minor:number|null; closed_at:Date|null; watchers_count:number; i_watch:boolean; my_bid:number|null;
  bids_count:number; highest_bid:number|null; reservation:unknown; owner_reservation:unknown;
  id: string;
  category: (typeof NEED_CATEGORIES)[number];
  city: string;
  district: string;
  is_seed: boolean;
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

function toListingDto(row: ListingRow, userId: string | null) {
  const price=row.urgent_type==='sell' ? lotPrice(row) : null;
  const own=userId!==null && row.author_id===userId;
  return {
    urgentType:row.urgent_type, startPriceMinor:row.price_start_minor, currentPriceMinor:price?.priceMinor ?? row.price_minor,
    nextDropAt:price?.nextDropAt ?? null,lastDropAt:price?.lastDropAt ?? null,
    discountFromStartPct:price && row.price_start_minor ? Math.floor((1-price.priceMinor/row.price_start_minor)*100) : 0,
    floorHintPct:price ? floorHintPct(row.price_start_minor ?? 0,row.price_floor_minor ?? 0) : null,
    watchersCount:row.watchers_count,iWatch:row.i_watch,myBid:row.my_bid!==null ? {maxPriceMinor:row.my_bid} : null,
    reservation:row.reservation ?? {active:false,mine:false,expiresAt:null,priceMinor:null,source:null},
    outcome:row.outcome,finalPriceMinor:row.final_price_minor,closedAt:row.closed_at?.toISOString() ?? null,
    ...(own ? {priceFloorMinor:row.price_floor_minor,marketPriceMinor:row.market_price_minor,bidsCount:row.bids_count,highestBidMinor:row.highest_bid,activeReservation:row.owner_reservation} : {}),
    id: row.id,
    category: row.category,
    city: row.city,
    district: row.district,
    isSeed: row.is_seed,
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
    isMine: userId !== null && row.author_id === userId,
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

/**
 * Привязка фото к объявлению.
 *
 * Новые снимки приходят из listing_files (POST /api/listings/media) и в галерею
 * профиля не попадают. Старые клиенты могут прислать id из profile_media —
 * такие ссылки продолжаем поддерживать, чтобы прежние объявления не потеряли фото.
 */
async function attachMedia(listingId: string, userId: string, mediaIds: string[]) {
  const problem = checkListingPhotos(mediaIds);
  if (problem === "TOO_MANY_PHOTOS") {
    throw new HttpError(400, `К объявлению можно приложить не больше ${MAX_LISTING_PHOTOS} фото`, "TOO_MANY_PHOTOS");
  }
  if (problem === "DUPLICATE_PHOTOS") throw badRequest("Одно фото добавлено дважды");

  const files = mediaIds.length
    ? await query<{ id: string }>(
        "SELECT id FROM listing_files WHERE user_id = $1 AND id = ANY($2::uuid[])",
        [userId, mediaIds],
      )
    : [];
  const fileIds = new Set(files.map((row) => row.id));
  const legacy = mediaIds.length
    ? await query<{ id: string }>(
        "SELECT id FROM profile_media WHERE user_id = $1 AND kind = 'photo' AND id = ANY($2::uuid[])",
        [userId, mediaIds],
      )
    : [];
  const legacyIds = new Set(legacy.map((row) => row.id));
  // Чужие или несуществующие файлы не молча отбрасываем, а отклоняем запрос.
  if (mediaIds.some((id) => !fileIds.has(id) && !legacyIds.has(id))) {
    throw new HttpError(400, "Фото должно быть загружено вами", "FOREIGN_PHOTO");
  }

  const previous = await query<{ file_id: string | null }>(
    "SELECT file_id FROM listing_media WHERE listing_id = $1",
    [listingId],
  );
  await query("DELETE FROM listing_media WHERE listing_id = $1", [listingId]);
  for (const [index, id] of mediaIds.entries()) {
    await query(
      `INSERT INTO listing_media (listing_id, media_id, file_id, position)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [listingId, fileIds.has(id) ? null : id, fileIds.has(id) ? id : null, index],
    );
  }

  // Снятые с объявления файлы, которые больше нигде не используются, удаляем.
  const dropped = previous.map((row) => row.file_id).filter((id): id is string => id !== null && !fileIds.has(id));
  if (dropped.length) {
    const removed = await query<{ url: string }>(
      `DELETE FROM listing_files f WHERE f.user_id = $1 AND f.id = ANY($2::uuid[])
         AND NOT EXISTS (SELECT 1 FROM listing_media lm WHERE lm.file_id = f.id)
       RETURNING f.url`,
      [userId, dropped],
    );
    for (const row of removed) await removeListingFile(userId, row.url);
  }
}

function checkPhotosEarly(ids: string[]) {
  if (checkListingPhotos(ids) === "TOO_MANY_PHOTOS") {
    throw new HttpError(400, `К объявлению можно приложить не больше ${MAX_LISTING_PHOTOS} фото`, "TOO_MANY_PHOTOS");
  }
}

/** Гостю открыты только список и карточка объявления; всё остальное — после входа. */
const PUBLIC_GET = new Set(["/", "/:id"]);

export async function listingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    const route = request.routeOptions.url ?? "";
    const tail = route.replace(/^\/api\/listings/, "") || "/";
    if (request.method === "GET" && PUBLIC_GET.has(tail) && !request.headers.authorization) return;
    await requireAuth(request, reply);
  });

  // Urgent mutations share the listing row lock with the background worker.
  async function urgentMutation(id:string, userId:string, action:(client:import('pg').PoolClient, lot:UrgentLot)=>Promise<unknown>) {
    try {
      return await transaction(async client => {
        const lot = (await client.query<UrgentLot>('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if (!lot) throw notFound('Объявление не найдено');
        if (lot.category !== 'urgent') throw badRequest('Это не срочное объявление');
        const blocked = await client.query('SELECT 1 FROM blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[userId,lot.author_id]);
        if (blocked.rowCount) throw forbidden('Объявление недоступно');
        await expireReservations(client,id);
        return action(client,lot);
      });
    } catch(error) {
      const databaseError = error as {code?:string;constraint?:string} | null;
      if (databaseError?.code === '23505' && databaseError.constraint === 'listing_reservations_one_active') throw new HttpError(409,'Объявление уже забронировано','ALREADY_RESERVED');
      throw error;
    }
  }
  const assertActiveSell = (lot:UrgentLot,userId:string) => {
    if (lot.urgent_type !== 'sell' || lot.state !== 'active' || lot.expires_at.getTime() <= Date.now() || lot.is_seed) throw badRequest('Продажа уже недоступна');
    if (lot.author_id === userId) throw badRequest('Это ваше объявление');
  };
  for (const method of ['post','delete'] as const) app[method]('/:id/watch', async request => {
    const userId=currentUserId(request), {id}=idParam.parse(request.params);
    return urgentMutation(id,userId,async(client,lot)=>{
      if (method==='post') {
        if (lot.state!=='active' || lot.expires_at.getTime()<=Date.now()) throw badRequest('Объявление завершено');
        const inserted=await client.query('INSERT INTO listing_watchers(listing_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',[id,userId]);
        if(inserted.rowCount) await urgentEvent(client,id,userId,'watch');
      } else await client.query('DELETE FROM listing_watchers WHERE listing_id=$1 AND user_id=$2',[id,userId]);
      return {ok:true};
    });
  });
  app.put('/:id/bid',async request=>{
    const userId=currentUserId(request),{id}=idParam.parse(request.params);
    const {maxPriceMinor}=z.object({maxPriceMinor:z.number().int().min(0).max(1_000_000_000)}).parse(request.body);
    return urgentMutation(id,userId,async(client,lot)=>{
      assertActiveSell(lot,userId);
      await requireVerifiedContact(client,userId);
      if (!(await buyerAllowed(client,userId,lot.author_id))) throw forbidden('Бронирование недоступно после неявок');
      if(maxPriceMinor>=lotPrice(lot).priceMinor) throw new HttpError(400,'Цена уже достигнута. Забронируйте по текущей цене','BID_ABOVE_CURRENT');
      await client.query(`INSERT INTO listing_bids(listing_id,buyer_id,max_price_minor) VALUES($1,$2,$3)
        ON CONFLICT(listing_id,buyer_id) DO UPDATE SET max_price_minor=$3,status='active',created_at=now()`,[id,userId,maxPriceMinor]);
      await urgentEvent(client,id,userId,'bid',{maxPriceMinor});
      return {ok:true,myBid:{maxPriceMinor}};
    });
  });
  app.delete('/:id/bid',async request=>{
    const userId=currentUserId(request),{id}=idParam.parse(request.params);
    return urgentMutation(id,userId,async client=>{
      await client.query("UPDATE listing_bids SET status='cancelled' WHERE listing_id=$1 AND buyer_id=$2 AND status='active'",[id,userId]);
      return {ok:true};
    });
  });
  app.post('/:id/reserve',{config:RESPOND_LIMIT},async request=>{
    const userId=currentUserId(request),{id}=idParam.parse(request.params);
    const {arriveInMinutes}=z.object({arriveInMinutes:z.union([z.literal(15),z.literal(30),z.literal(60)])}).parse(request.body);
    const notices:Awaited<ReturnType<typeof insertUrgentNotification>>[] = [];
    const response = await urgentMutation(id,userId,async(client,lot)=>{
      assertActiveSell(lot,userId);
      await requireVerifiedContact(client,userId);
      if (!(await buyerAllowed(client,userId,lot.author_id))) throw new HttpError(403,'Бронирование недоступно: неявки у двух продавцов за 30 дней','RESERVATION_BANNED');
      const held=await client.query("SELECT 1 FROM listing_reservations WHERE listing_id=$1 AND status='active'",[id]);
      if(held.rowCount) throw new HttpError(409,'Объявление уже забронировано','ALREADY_RESERVED');
      const reserved=await reserveLot(client,lot,userId,arriveInMinutes,'manual');
      notices.push(await insertUrgentNotification(client,lot.author_id,'urgent_reserved',{
        listingId:id,reservationId:reserved.reservationId,expiresAt:reserved.expiresAt,priceMinor:reserved.priceMinor,source:reserved.source,
      }));
      return {ok:true,...reserved};
    });
    deliverUrgent(notices);
    return response;
  });
  app.post('/:id/reserve/cancel',async request=>{
    const userId=currentUserId(request),{id}=idParam.parse(request.params);
    return urgentMutation(id,userId,async(client,lot)=>{
      const held=(await client.query<{id:string;buyer_id:string}>("SELECT * FROM listing_reservations WHERE listing_id=$1 AND status='active' FOR UPDATE",[id])).rows[0];
      if(!held) throw badRequest('Активной брони нет');
      if(held.buyer_id!==userId && lot.author_id!==userId) throw forbidden();
      await client.query("UPDATE listing_reservations SET status='cancelled' WHERE id=$1",[held.id]);
      return {ok:true};
    });
  });
  app.post('/:id/reserve/no-show',async request=>{
    const userId=currentUserId(request),{id}=idParam.parse(request.params);
    return urgentMutation(id,userId,async(client,lot)=>{
      if(lot.author_id!==userId) throw forbidden();
      if(lot.urgent_type!=='sell') throw badRequest('Неявка относится только к срочной продаже');
      // Only the most recent reservation may be marked; cannot punish an older buyer after a new hold.
      const held=(await client.query<{id:string;buyer_id:string;status:string;expires_at:Date}>("SELECT * FROM listing_reservations WHERE listing_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE",[id])).rows[0];
      if(!held || held.status!=='expired' || held.expires_at.getTime()>Date.now()) throw badRequest('Отметить неявку можно только после истечения брони');
      await client.query("UPDATE listing_reservations SET status='no_show' WHERE id=$1",[held.id]);
      await urgentEvent(client,id,held.buyer_id,'no_show',{reservationId:held.id});
      return {ok:true};
    });
  });
  app.post('/:id/complete',async request=>{
    const userId=currentUserId(request),{id}=idParam.parse(request.params);
    const {outcome}=z.object({outcome:z.enum(['sold','given','done','cancelled'])}).parse(request.body);
    return urgentMutation(id,userId,async(client,lot)=>{
      if(lot.author_id!==userId) throw forbidden();
      if(lot.state!=='active') throw badRequest('Объявление уже завершено');
      const held=(await client.query<{id:string;price_minor:number}>("SELECT * FROM listing_reservations WHERE listing_id=$1 AND status='active'",[id])).rows[0];
      if(outcome==='sold' && (lot.urgent_type!=='sell' || !held)) throw badRequest('Для продажи нужна активная бронь');
      const finalPriceMinor=outcome==='sold' ? held?.price_minor ?? null : null;
      await client.query("UPDATE listings SET state='closed',outcome=$2,final_price_minor=$3,closed_at=now(),updated_at=now() WHERE id=$1",[id,outcome,finalPriceMinor]);
      await client.query("UPDATE listing_reservations SET status=$2 WHERE listing_id=$1 AND status='active'",[id,outcome==='cancelled'?'cancelled':'completed']);
      await client.query("UPDATE listing_bids SET status='cancelled' WHERE listing_id=$1 AND status='active'",[id]);
      await urgentEvent(client,id,userId,outcome,{finalPriceMinor});
      return {ok:true,outcome,finalPriceMinor};
    });
  });

  // ── Фото объявления ──────────────────────────────────────────────────────
  // Отдельный эндпоинт: снимки объявления не должны появляться в профиле.
  app.post(
    "/media",
    { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } },
    async (request) => {
      const userId = currentUserId(request);
      const part = await request.file({ limits: { fileSize: MAX_PHOTO_BYTES } });
      if (!part) throw badRequest("Файл не получен");

      const buffer = await part.toBuffer();
      const type = detectMediaType(buffer);
      if (!type || type.kind !== "photo") throw badRequest("К объявлению можно приложить только фото JPEG/PNG/WebP");
      assertSize(type, buffer.length);

      const { url } = await saveListingFile(userId, buffer, type);
      const row = await queryOne<{ id: string; created_at: Date }>(
        "INSERT INTO listing_files (user_id, url) VALUES ($1, $2) RETURNING id, created_at",
        [userId, url],
      );
      if (!row) throw badRequest("Не удалось сохранить фото");

      return { id: row.id, kind: "photo" as const, url, createdAt: row.created_at.toISOString() };
    },
  );


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
  app.get("/", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const userId = request.userId ?? null;
    await expireReservations();
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
    const profile = userId
      ? await queryOne<{ city: string | null }>("SELECT city FROM profiles WHERE user_id = $1", [userId])
      : null;
    // Пустой город в профиле (город ещё не указан) не должен приводить к пустой
    // выдаче: в этом случае показываем объявления всех городов.
    const city = filters.city ?? (profile?.city ? profile.city : null);

    // «Знакомства» — только для вошедших с заполненной анкетой.
    const complete = userId ? (await loadCompleteness(userId)).complete : false;
    const access = datingAccess(filters.category, complete);
    if (access === "forbidden") throw profileIncomplete();
    const excludeDating = access === "exclude";

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
          AND (
                l.is_seed = false
                OR (SELECT count(*) FROM listings rl
                     WHERE rl.is_seed = false
                       AND rl.state = 'active'
                       AND rl.expires_at > now()
                       AND lower(rl.city) = lower(l.city)
                       AND rl.category = l.category) < ${SEED_HIDE_THRESHOLD}
              )
          AND ($7::boolean IS NOT TRUE OR l.category <> 'dating')
          AND ($8::boolean IS NOT TRUE OR l.author_id=$1 OR l.expires_at>=now()+interval '2 minutes')
        ORDER BY CASE WHEN $8::boolean THEN EXISTS(SELECT 1 FROM listing_reservations r WHERE r.listing_id=l.id AND r.status='active' AND r.expires_at>now()) END ASC,
                 CASE WHEN $8::boolean THEN l.expires_at END ASC, l.is_seed ASC, l.created_at DESC
        LIMIT $6`,
      [
        userId,
        city,
        filters.category ?? null,
        filters.q ?? null,
        filters.onlyMyNeeds ?? false,
        filters.limit ?? 30,
        excludeDating,
        filters.category === "urgent",
      ],
    );

    return { city, items: rows.map((row) => toListingDto(row, userId)) };
  });

  app.get("/mine", async (request) => {
    const userId = currentUserId(request);
    await expireReservations();
    const rows = await query<ListingRow>(
      `${LISTING_SELECT} WHERE l.author_id = $1 ORDER BY l.created_at DESC LIMIT 100`,
      [userId],
    );
    return rows.map((row) => toListingDto(row, userId));
  });

  app.get<{ Params: { userId: string } }>("/user/:userId", async (request) => {
    await expireReservations();
    const viewerId = currentUserId(request);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
    const rows = await query<ListingRow>(
      `${LISTING_SELECT}
        WHERE l.author_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.user_id = $1 AND b.blocked_id = l.author_id)
                OR (b.user_id = l.author_id AND b.blocked_id = $1)
          )
        ORDER BY l.created_at DESC
        LIMIT 100`,
      [viewerId, userId],
    );
    return rows.map((row) => toListingDto(row, viewerId));
  });

  app.get<{ Params: { id: string } }>("/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const userId = request.userId ?? null;
    const { id } = idParam.parse(request.params);
    await expireReservations(undefined,id);
    const row = await queryOne<ListingRow>(`${LISTING_SELECT} WHERE l.id = $2`, [userId, id]);
    if (!row) throw notFound("Объявление не найдено");
    if(userId && row.category==='urgent') await transaction(async client=>{
      await client.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[id]);
      await client.query(`INSERT INTO listing_events(listing_id,user_id,kind) SELECT $1,$2,'view'
        WHERE NOT EXISTS(SELECT 1 FROM listing_events WHERE listing_id=$1 AND user_id=$2 AND kind='view' AND created_at>=now()-interval '1 day')`,[id,userId]);
    });
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
      if (draft.mediaIds) checkPhotosEarly(draft.mediaIds);
      const urgentType = draft.category === 'urgent' ? draft.urgentType ?? (draft.priceStartMinor !== undefined || draft.priceFloorMinor !== undefined || draft.marketPriceMinor !== undefined || draft.priceMinor != null ? 'sell' : 'help') : null;
      const urgentDuration = urgentType ? URGENT_DURATIONS[urgentType] : null;
      const durationMinutes = urgentDuration ? draft.expiresInMinutes ?? (draft.expiresInDays !== undefined ? draft.expiresInDays*1440 : urgentDuration.default) : resolveDuration(draft.category,draft);
      if(durationMinutes===null || (urgentDuration && !urgentDuration.options.includes(durationMinutes))) throw new HttpError(400,'Такой срок недоступен для этого типа','INVALID_DURATION');
      const suggestions=draft.marketPriceMinor !== undefined ? suggestPrices(draft.marketPriceMinor) : null;
      const start=urgentType==='sell' ? draft.priceStartMinor ?? draft.priceMinor ?? suggestions?.start ?? null : null;
      const floor=urgentType==='sell' ? draft.priceFloorMinor ?? suggestions?.floor ?? null : null;
      if(urgentType==='sell') {
        if(start===null || floor===null) throw badRequest('Укажите стартовую и минимальную цены');
        const problem=validateSell({start,floor});
        if(problem) throw new HttpError(400,{FLOOR_ABOVE_START:'Минимум выше стартовой цены',START_TOO_HIGH:'Старт не может быть выше 150% минимума',FLOOR_TOO_LOW:'Минимальная цена — 100 ₽'}[problem],problem);
        if((draft.mediaIds?.length ?? 0)<2) throw badRequest('Для продажи нужны минимум два фото');
      }
      if (draft.category === "dating" && !(await loadCompleteness(userId)).complete) {
        throw profileIncomplete();
      }

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

      const row = await transaction(async client=>{
        // Author lock serializes limits and relisting checks across concurrent requests.
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
        if(urgentType) {
          const owner=(await client.query<{trust_level:string}>('SELECT trust_level FROM profiles WHERE user_id=$1',[userId])).rows[0];
          const count=(await client.query<{count:number}>("SELECT count(*)::int AS count FROM listings WHERE author_id=$1 AND category='urgent' AND state='active' AND expires_at>now()",[userId])).rows[0]?.count ?? 0;
          if(count >= (owner?.trust_level==='new' ? NEW_ACCOUNT_MAX_ACTIVE : ACTIVE_MAX)) throw new HttpError(400,'Лимит активных срочных объявлений достигнут','URGENT_ACTIVE_LIMIT');
        }
        if(urgentType==='sell') {
          await requireVerifiedContact(client,userId);
          if(env.urgentSellCities.length && !env.urgentSellCities.includes(city.trim().toLocaleLowerCase('ru-RU'))) throw new HttpError(403,'Срочные продажи пока недоступны в этом городе','URGENT_SELL_NOT_AVAILABLE');
          const previous=await client.query<{title:string;created_at:Date;price_start_minor:number|null}>("SELECT title,created_at,price_start_minor FROM listings WHERE author_id=$1 AND urgent_type='sell' AND created_at>now()-interval '7 days' ORDER BY created_at DESC",[userId]);
          const same=previous.rows.find(r=>normalizeTitleKey(r.title)===normalizeTitleKey(draft.title));
          if(same && Date.now()-same.created_at.getTime()<86400000) throw new HttpError(409,'Такой лот уже выставлялся за последние 24 часа','DUPLICATE_RECENT');
          if(same && start!==null && same.price_start_minor!==null && start>same.price_start_minor) throw new HttpError(400,'Стартовая цена не должна превышать цену прошлого лота','START_ABOVE_PREVIOUS');
        }
        const result=await client.query<{id:string}>(`INSERT INTO listings(author_id,category,city,district,title,description,price_minor,expires_at,urgent_type,market_price_minor,price_start_minor,price_floor_minor)
          VALUES($1,$2::need_category,$3,$4,$5,$6,$7,now()+make_interval(mins=>$8::int),$9,$10,$11,$12) RETURNING id`,
          [userId,draft.category,city,draft.district ?? '',draft.title,draft.description ?? '',start ?? draft.priceMinor ?? null,durationMinutes,urgentType,urgentType==='sell' ? draft.marketPriceMinor ?? null : null,start,floor]);
        const saved=result.rows[0];
        if(urgentType && saved && draft.mediaIds?.length) {
          if(checkListingPhotos(draft.mediaIds)) throw badRequest('Фото не должны повторяться');
          // Lock and validate each owned photo before making the sell visible.
          const files=await client.query<{id:string}>('SELECT id FROM listing_files WHERE user_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[userId,draft.mediaIds]);
          const legacy=await client.query<{id:string}>("SELECT id FROM profile_media WHERE user_id=$1 AND kind='photo' AND id=ANY($2::uuid[]) FOR UPDATE",[userId,draft.mediaIds]);
          const fileIds=new Set(files.rows.map(f=>f.id)), legacyIds=new Set(legacy.rows.map(f=>f.id));
          for(const [position,mediaId] of draft.mediaIds.entries()) {
            if(!fileIds.has(mediaId) && !legacyIds.has(mediaId)) throw new HttpError(400,'Фото должно быть загружено вами','FOREIGN_PHOTO');
            await client.query('INSERT INTO listing_media(listing_id,media_id,file_id,position) VALUES($1,$2,$3,$4)',[saved.id,fileIds.has(mediaId)?null:mediaId,fileIds.has(mediaId)?mediaId:null,position]);
          }
        }
        return saved;
      });
      if (!row) throw badRequest("Не удалось сохранить объявление");

      if (!urgentType && draft.mediaIds?.length) await attachMedia(row.id, userId, draft.mediaIds);

      // Уведомления не должны блокировать ответ: ошибки только логируем.
      void notifyListingMatches({
        listingId: row.id,
        authorId: userId,
        authorName: profile?.name ?? "",
        category: draft.category,
        city,
        title: draft.title,
        priceMinor: start ?? draft.priceMinor ?? null,
        expiresAt: new Date(Date.now()+durationMinutes*60000),
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
    const urgent = await queryOne<{urgent_type:string|null}>("SELECT urgent_type FROM listings WHERE id=$1",[id]);
    if(urgent?.urgent_type && patch.state!==undefined) throw badRequest('Завершите срочную сделку через действие завершения');
    if(urgent?.urgent_type==='sell' && (patch.priceMinor!==undefined || patch.title!==undefined || patch.mediaIds!==undefined)) throw badRequest('Цены, заголовок и фото опубликованной продажи менять нельзя');
    if (patch.mediaIds) checkPhotosEarly(patch.mediaIds);

    await query(
      `UPDATE listings SET
         title       = COALESCE($2, title),
         description = COALESCE($3, description),
         district    = COALESCE($7, district),
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
        patch.district ?? null,
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
    await transaction(async client=>{
      await client.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[id]);
      await client.query("UPDATE listings SET state='closed',outcome=CASE WHEN urgent_type IS NOT NULL THEN COALESCE(outcome,'cancelled') ELSE outcome END,closed_at=CASE WHEN urgent_type IS NOT NULL THEN COALESCE(closed_at,now()) ELSE closed_at END,updated_at=now() WHERE id=$1",[id]);
      await client.query("UPDATE listing_reservations SET status='cancelled' WHERE listing_id=$1 AND status='active'",[id]);
      await client.query("UPDATE listing_bids SET status='cancelled' WHERE listing_id=$1 AND status='active'",[id]);
    });
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

      const listing = await queryOne<{
        author_id: string;
        state: string;
        title: string;
        is_seed: boolean;
      }>("SELECT author_id, CASE WHEN state = 'active' AND expires_at <= now() THEN 'expired'::listing_state ELSE state END AS state, title, is_seed FROM listings WHERE id = $1", [id]);
      if (!listing) throw notFound("Объявление не найдено");
      if (listing.is_seed) {
        throw badRequest(
          "Это демо-объявление для примера — реальные люди появятся рядом совсем скоро.",
        );
      }
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
