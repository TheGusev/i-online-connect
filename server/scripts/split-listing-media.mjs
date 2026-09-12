/**
 * Разбор старых фото: снимки, загруженные через форму объявления, лежали в
 * profile_media и показывались в галерее профиля.
 *
 * Скрипт переносит такие записи в listing_files и убирает их из профиля.
 * Файлы на диске не двигаются — меняются только ссылки в базе.
 *
 * Запуск:  node scripts/split-listing-media.mjs [--dry]
 */
import { Pool } from "pg";

const dry = process.argv.includes("--dry");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Фото, привязанные к объявлению, но живущие в галерее профиля.
    const { rows } = await client.query(`
      SELECT lm.listing_id, lm.position, m.id AS media_id, m.user_id, m.url, m.is_primary
        FROM listing_media lm
        JOIN profile_media m ON m.id = lm.media_id
       ORDER BY lm.listing_id, lm.position
    `);

    if (rows.length === 0) {
      console.log("Перепутанных фото нет — профили и объявления уже разделены.");
      return;
    }
    console.log(`Найдено ${rows.length} фото объявлений внутри профилей.`);

    let moved = 0;
    let keptPrimary = 0;
    for (const row of rows) {
      // Главное фото профиля не забираем: это лицо человека, а не товар.
      if (row.is_primary) {
        keptPrimary += 1;
        continue;
      }
      if (dry) {
        moved += 1;
        continue;
      }

      await client.query("BEGIN");
      try {
        const inserted = await client.query(
          "INSERT INTO listing_files (user_id, url) VALUES ($1, $2) RETURNING id",
          [row.user_id, row.url],
        );
        const fileId = inserted.rows[0].id;
        await client.query(
          `UPDATE listing_media SET media_id = NULL, file_id = $1
            WHERE listing_id = $2 AND media_id = $3`,
          [fileId, row.listing_id, row.media_id],
        );
        // Файл на диске остаётся тем же, поэтому запись профиля просто убираем.
        await client.query("DELETE FROM profile_media WHERE id = $1", [row.media_id]);
        await client.query("COMMIT");
        moved += 1;
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`Не удалось перенести ${row.media_id}:`, error.message);
      }
    }

    // Порядок фото в профиле после удалений мог стать разреженным — не страшно,
    // сортировка идёт по position, а пропуски на неё не влияют.
    console.log(
      dry
        ? `Пробный прогон: перенесли бы ${moved} фото, ${keptPrimary} оставили как главные.`
        : `Перенесено ${moved} фото, ${keptPrimary} оставлены главными в профиле.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
