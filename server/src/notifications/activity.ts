import { query, queryOne } from "../db.ts";
import {
  starsForActiveMinutes,
  type ActorActivitySnapshot,
} from "./activity-policy.ts";

/**
 * Вызывать только после подтверждённого действия пользователя.
 * Видимость вкладки и чтение страницы сюда не подключаются.
 */
export async function recordNotificationActivity(userId: string): Promise<void> {
  await query(
    `WITH moment AS (
       SELECT statement_timestamp() AS at
     )
     INSERT INTO notification_activity_slots
       (user_id, slot, last_action_at)
     SELECT u.id,
            ((floor(extract(epoch FROM moment.at) / 60)::bigint % 64))::smallint,
            moment.at
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       CROSS JOIN moment
      WHERE u.id = $1
        AND u.deleted_at IS NULL
        AND p.is_seed = false
     ON CONFLICT (user_id, slot) DO UPDATE
       SET last_action_at = GREATEST(
         notification_activity_slots.last_action_at,
         EXCLUDED.last_action_at
       )`,
    [userId],
  );
}

/**
 * Только чтение: показ уведомления сам по себе активность не добавляет.
 * Полученный объект сохраняется в payload события как actorActivity.
 */
export async function getNotificationActivitySnapshot(
  userId: string,
): Promise<ActorActivitySnapshot> {
  const row = await queryOne<{
    active_minutes: number;
    sampled_at: Date;
  }>(
    `SELECT count(*)::int AS active_minutes,
            statement_timestamp() AS sampled_at
       FROM notification_activity_slots
      WHERE user_id = $1
        AND last_action_at > statement_timestamp() - interval '60 minutes'
        AND last_action_at <= statement_timestamp()`,
    [userId],
  );

  if (!row) throw new Error("Activity snapshot query returned no row");

  return {
    version: 1,
    stars: starsForActiveMinutes(row.active_minutes),
    activeMinutes: row.active_minutes,
    windowSeconds: 3600,
    calculatedAt: row.sampled_at.toISOString(),
  };
}
