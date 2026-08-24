/**
 * Одноразовые задания для живого видео-селфи.
 *
 * Задание генерирует сервер, оно живёт 5 минут и сгорает после использования:
 * так заранее записанное видео не пройдёт проверку.
 */
import { randomInt } from "node:crypto";

import { query, queryOne } from "../db.ts";
import { badRequest } from "../http.ts";

const TURNS = [
  "медленно поверните голову влево, затем прямо",
  "медленно поверните голову вправо, затем прямо",
  "чуть наклоните голову к левому плечу",
  "чуть наклоните голову к правому плечу",
];

const GESTURES = [
  "поднимите открытую ладонь рядом с лицом",
  "покажите два пальца рядом с лицом",
  "помашите рукой в камеру",
  "покажите большой палец вверх рядом с лицом",
];

export const CHALLENGE_TTL_MINUTES = 5;

export interface Challenge {
  id: string;
  instructions: string[];
  spokenCode: string;
  expiresAt: string;
}

const pick = <T>(items: T[]): T => items[randomInt(items.length)] as T;

/** Новое задание для пользователя. Предыдущие неиспользованные гасим. */
export async function createChallenge(userId: string): Promise<Challenge> {
  await query(
    "UPDATE verification_challenges SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [userId],
  );

  const instructions = [pick(TURNS), pick(GESTURES)];
  const spokenCode = String(randomInt(1000, 10_000));

  const row = await queryOne<{ id: string; expires_at: Date }>(
    `INSERT INTO verification_challenges (user_id, instructions, spoken_code, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
     RETURNING id, expires_at`,
    [userId, instructions, spokenCode, String(CHALLENGE_TTL_MINUTES)],
  );
  if (!row) throw badRequest("Не удалось создать задание");

  return {
    id: row.id,
    instructions,
    spokenCode,
    expiresAt: row.expires_at.toISOString(),
  };
}

/** Разовое использование задания: второй раз тот же id не пройдёт. */
export async function consumeChallenge(userId: string, challengeId: string) {
  const row = await queryOne<{ instructions: string[]; spoken_code: string }>(
    `UPDATE verification_challenges
        SET used_at = now()
      WHERE id = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING instructions, spoken_code`,
    [challengeId, userId],
  );
  if (!row) throw badRequest("Задание устарело — получите новое и запишите видео снова");
  return { instructions: row.instructions, spokenCode: row.spoken_code };
}
