/**
 * Ежедневное освежение демо-контента (is_seed = true).
 *
 * Зачем: без этого демо-объявления и встречи «застывают» в прошлом и
 * приложение выглядит заброшенным. Раз в сутки мы:
 *   • подтягиваем даты демо-объявлений и демо-встреч к сегодняшнему дню;
 *   • обновляем «был в сети» у демо-анкет;
 *   • у небольшой части демо-объявлений (около 12%) меняем район и цену,
 *     чтобы выдача не была слово в слово одинаковой день за днём.
 *
 * Гарантия: любой запрос содержит условие is_seed = true (или ссылку на
 * демо-пространство), поэтому данные реальных пользователей не трогаются
 * ни при каких условиях.
 *
 * Запуск вручную: npm run seed:refresh
 * Автоматически: cron внутри backend-процесса, 04:00 по времени сервера.
 */
import { fileURLToPath } from "node:url";

import { query } from "../db.ts";

export type SeedRefreshSummary = {
  listingsRefreshed: number;
  listingsVaried: number;
  eventsRefreshed: number;
  messagesRefreshed: number;
  profilesTouched: number;
};

/** Минимальный интерфейс логгера: подходит и Fastify, и console. */
type Log = { info: (message: string) => void; error: (message: string) => void };

export async function refreshSeedContent(): Promise<SeedRefreshSummary> {
  // 1. Демо-объявления: свежие даты публикации и отодвинутый срок жизни.
  const listings = await query<{ id: string }>(
    `UPDATE listings
        SET created_at = now() - make_interval(hours => (random() * 40)::int),
            expires_at = now() + interval '60 days'
      WHERE is_seed = true
        AND state = 'active'
      RETURNING id`,
  );

  // 2. Вариация примерно 12% демо-объявлений: другой район того же города
  //    и небольшое изменение цены. Категория и текст остаются прежними.
  const varied = await query<{ id: string }>(
    `UPDATE listings l
        SET district = COALESCE(d.district, l.district),
            price_minor = CASE
              WHEN l.price_minor IS NULL OR l.price_minor = 0 THEN l.price_minor
              ELSE GREATEST(1000, (l.price_minor * (0.9 + random() * 0.2))::bigint)
            END
       FROM (
         SELECT s.id,
                (SELECT o.district FROM listings o
                  WHERE o.is_seed = true AND o.city = s.city AND o.district <> ''
                  ORDER BY random() LIMIT 1) AS district
           FROM listings s
          WHERE s.is_seed = true AND s.state = 'active' AND random() < 0.12
       ) d
      WHERE l.id = d.id
      RETURNING l.id`,
  );

  // 3. Встречи демо-сообществ — всегда в ближайшие дни.
  const events = await query<{ id: string }>(
    `UPDATE space_events e
        SET starts_at = now() + make_interval(days => 1 + (random() * 6)::int)
      WHERE e.space_id IN (SELECT id FROM spaces WHERE is_seed = true)
        AND e.starts_at < now() + interval '1 day'
      RETURNING e.id`,
  );

  // 4. Сообщения демо-чатов подтягиваем к последним часам.
  const messages = await query<{ id: string }>(
    `UPDATE space_messages
        SET created_at = now() - make_interval(hours => (random() * 20)::int)
      WHERE is_seed = true
        AND created_at < now() - interval '2 days'
      RETURNING id`,
  );

  // 5. «Был в сети» у демо-анкет — иначе все показаны офлайн неделями.
  const profiles = await query<{ user_id: string }>(
    `UPDATE users u
        SET last_seen_at = now() - make_interval(mins => (random() * 240)::int)
      WHERE u.id IN (SELECT user_id FROM profiles WHERE is_seed = true)
      RETURNING u.id AS user_id`,
  );

  return {
    listingsRefreshed: listings.length,
    listingsVaried: varied.length,
    eventsRefreshed: events.length,
    messagesRefreshed: messages.length,
    profilesTouched: profiles.length,
  };
}

/** Обёртка с логом: используется и cron-задачей, и ручным запуском. */
export async function runSeedRefresh(log: Log): Promise<void> {
  try {
    const summary = await refreshSeedContent();
    log.info(
      `[seed-refresh] объявления: ${summary.listingsRefreshed} обновлено, ` +
        `${summary.listingsVaried} изменено; встречи: ${summary.eventsRefreshed}; ` +
        `сообщения: ${summary.messagesRefreshed}; анкеты: ${summary.profilesTouched}`,
    );
  } catch (error) {
    log.error(`[seed-refresh] ошибка обновления демо-контента: ${String(error)}`);
  }
}

// Ручной запуск: node --experimental-strip-types src/seed/refresh.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runSeedRefresh(console);
  process.exit(0);
}
