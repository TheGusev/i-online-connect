/**
 * Проверка подтверждения профиля для действий, закрытых до верификации
 * (отправка фото и видео в чатах).
 *
 * Проверка обязательно серверная: скрытая на фронте кнопка не мешает
 * отправить тот же запрос напрямую, поэтому решает только это место.
 */
import { queryOne } from "../db.ts";
import { HttpError } from "../http.ts";

export async function isVerified(userId: string): Promise<boolean> {
  const row = await queryOne<{ status: string }>(
    "SELECT status FROM verifications WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1",
    [userId],
  );
  return row?.status === "verified";
}

export async function assertVerified(userId: string) {
  if (await isVerified(userId)) return;
  throw new HttpError(
    403,
    "Отправка фото и видео доступна после подтверждения профиля",
    "verification_required",
  );
}
