/**
 * Демо-наполнение платформы: примерные анкеты, объявления и сообщества.
 *
 * Зачем: пустое приложение выглядит мёртвым. Демо-записи помечены
 * is_seed = true, поэтому приложение само отодвигает и затем скрывает их,
 * как только появляются реальные люди (см. миграцию 009 и routes/listings.ts).
 *
 * Скрипт идемпотентный: повторный запуск ничего не дублирует — демо-аккаунты
 * узнаются по e-mail с доменом @seed.local, объявления и сообщества
 * пересоздаются только если их ещё нет.
 *
 * Запуск:  npm run seed          (нужен DATABASE_URL и доступ к MEDIA_DIR)
 * Очистка: npm run seed:clear
 */
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(here, "..", "seed-assets");

async function loadEnvFile() {
  try {
    const raw = await readFile(path.join(here, "..", ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (!(key in process.env)) process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env может отсутствовать */
  }
}

await loadEnvFile();

if (!process.env.DATABASE_URL) {
  console.error("[seed] DATABASE_URL не задан. См. server/.env.example");
  process.exit(1);
}

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/var/lib/ya-online/media";
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL ?? "/api/media-file").replace(/\/$/, "");
const SEED_DOMAIN = "seed.local";

/** Пароль демо-аккаунтов неизвестен никому: вход в них невозможен. */
async function unusablePasswordHash() {
  try {
    const argon2 = await import("argon2");
    return await argon2.hash(randomUUID() + randomUUID());
  } catch {
    // argon2 — нативный модуль; если он недоступен, кладём строку, которая
    // никогда не совпадёт ни с одним паролем.
    return `seed-no-login-${randomUUID()}`;
  }
}

import { LISTINGS, PEOPLE, SPACES } from "./seed-data.mjs";

const CITIES = ["Новосибирск", "Москва", "Санкт-Петербург", "Екатеринбург"];

const SPACE_MESSAGES = [
  "Всем привет! Кто идёт в эти выходные?",
  "Я буду, возьму с собой термос.",
  "Отлично, встречаемся у входа в парк.",
  "Можно с собой друга привести?",
  "Конечно, чем больше, тем лучше.",
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function ensureSeedColumns() {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'is_seed'",
  );
  if (rows.length === 0) {
    console.error("[seed] нет колонки is_seed. Сначала выполните: npm run migrate");
    process.exit(1);
  }
}

/** Копия файла из seed-assets в медиа-хранилище пользователя. */
async function copyAsset(userId, asset) {
  const dir = path.join(MEDIA_DIR, userId);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const name = `${randomUUID()}${path.extname(asset)}`;
  await copyFile(path.join(assetsDir, asset), path.join(dir, name));
  return `${MEDIA_BASE_URL}/${userId}/${name}`;
}

async function seedProfiles() {
  const interests = (await client.query("SELECT id FROM interests")).rows.map((row) => row.id);
  const created = [];

  for (const [index, [name, age, intent, bio, , avatar, city, valuesText, joyText]] of PEOPLE.entries()) {
    const email = `demo${String(index + 1).padStart(2, "0")}@${SEED_DOMAIN}`;
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    let userId = existing.rows[0]?.id;
    const fresh = !userId;

    if (!userId) {
      const hash = await unusablePasswordHash();
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, email_verified, last_seen_at)
         VALUES ($1, $2, true, now() - make_interval(mins => $3::int))
         RETURNING id`,
        [email, hash, (index % 7) * 40],
      );
      userId = rows[0].id;
      await client.query(
        `INSERT INTO profiles (user_id, name, is_seed, onboarded_at) VALUES ($1, $2, true, now())`,
        [userId, name],
      );
    } else {
      await client.query("UPDATE users SET deleted_at = NULL WHERE id = $1", [userId]);
    }

    // Демо-анкеты заполнены полностью — как у настоящего участника.
    await client.query(
      `UPDATE profiles SET name = $2, age = $3, city = $4, bio = $5, intent = $6::profile_intent,
              values_text = $7, joy_text = $8, trust_level = $9::trust_level, trust_score = $10,
              video_verified = $11, safe_meetings = $12, clean_conversations = $13, is_seed = true
        WHERE user_id = $1`,
      [userId, name, age, city, bio, intent, valuesText, joyText,
        index % 3 === 0 ? "verified" : "new", 40 + ((index * 7) % 55), index % 3 === 0, index % 4, 3 + (index % 9)],
    );
    await client.query("INSERT INTO privacy_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
    await client.query("INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);

    await client.query("DELETE FROM user_interests WHERE user_id = $1", [userId]);
    for (let step = 0; step < 3 && interests.length > 0; step += 1) {
      await client.query(
        "INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, interests[(index * 3 + step) % interests.length]],
      );
    }

    // Аватар у каждого демо-автора свой: старые снимки демо-анкеты заменяем.
    await client.query("DELETE FROM profile_media WHERE user_id = $1", [userId]);
    const url = await copyAsset(userId, avatar);
    await client.query(
      `INSERT INTO profile_media (user_id, kind, url, position, is_primary) VALUES ($1, 'photo', $2, 0, true)`,
      [userId, url],
    );

    created.push({ id: userId, city, fresh });
  }

  // Демо-анкеты прежних версий наполнения (сверх текущего списка) скрываем.
  const keep = PEOPLE.map((_, index) => `demo${String(index + 1).padStart(2, "0")}@${SEED_DOMAIN}`);
  await client.query(
    `UPDATE users SET deleted_at = now()
      WHERE email LIKE $1 AND NOT (email = ANY($2::text[])) AND deleted_at IS NULL
        AND id IN (SELECT user_id FROM profiles WHERE is_seed)`,
    [`%@${SEED_DOMAIN}`, keep],
  );

  return created;
}

async function seedListings(users) {
  // Пересоздаём только демо-объявления: повторный запуск не плодит дубли.
  await client.query("DELETE FROM listings WHERE is_seed");
  await client.query(
    "DELETE FROM listing_files WHERE user_id IN (SELECT user_id FROM profiles WHERE is_seed)",
  );

  const perCategory = {};
  for (const [index, listing] of LISTINGS.entries()) {
    perCategory[listing.category] = (perCategory[listing.category] ?? 0) + 1;
    // Авторы идут вразнобой: соседние объявления — разные люди.
    const author = users[(index * 5 + 3) % users.length];
    const { rows } = await client.query(
      `INSERT INTO listings (author_id, category, city, district, title, description,
                             price_minor, currency, state, expires_at, is_seed, seed_responses, created_at)
       VALUES ($1, $2::need_category, $3, $4, $5, $6, $7, $8, 'active',
               now() + make_interval(mins => $9::int - $11::int), true, $10,
               now() - make_interval(mins => $11::int))
       RETURNING id`,
      [author.id, listing.category, listing.city, listing.district, listing.title, listing.description,
        listing.priceMinor, listing.currency, listing.expiresMinutes, listing.responses, listing.elapsedMinutes],
    );
    const listingId = rows[0].id;

    for (const [position, asset] of listing.photos.entries()) {
      const url = await copyAsset(author.id, asset);
      const file = await client.query(
        "INSERT INTO listing_files (user_id, url) VALUES ($1, $2) RETURNING id",
        [author.id, url],
      );
      await client.query(
        "INSERT INTO listing_media (listing_id, file_id, position) VALUES ($1, $2, $3)",
        [listingId, file.rows[0].id, position],
      );
    }
  }
  return perCategory;
}

async function seedSpaces(users) {
  let count = 0;
  for (const [index, [title, category, description, cover]] of SPACES.entries()) {
    const existing = await client.query("SELECT id FROM spaces WHERE is_seed AND title = $1", [
      title,
    ]);
    if (existing.rows.length > 0) continue;

    const host = users[(index * 4) % users.length];
    const city = (await client.query("SELECT city FROM profiles WHERE user_id = $1", [host.id]))
      .rows[0]?.city ?? CITIES[0];
    const coverUrl = await copyAsset(host.id, cover);

    const { rows } = await client.query(
      `INSERT INTO spaces (title, description, topic, cover_url, category, format, cadence,
                           city, verified_community, join_policy, host_id, is_seed)
       VALUES ($1, $2, '', $3, $4::space_category, 'offline', 'weekly', $5, $6, 'open', $7, true)
       RETURNING id`,
      [title, description, coverUrl, category, city, index % 2 === 0, host.id],
    );
    const spaceId = rows[0].id;

    await client.query(
      `INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'host')
       ON CONFLICT DO NOTHING`,
      [spaceId, host.id],
    );

    const members = [];
    for (let step = 1; step <= 6; step += 1) {
      const member = users[(index * 4 + step) % users.length];
      if (member.id === host.id) continue;
      members.push(member.id);
      await client.query(
        `INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'member')
         ON CONFLICT DO NOTHING`,
        [spaceId, member.id],
      );
    }

    for (const [messageIndex, text] of SPACE_MESSAGES.entries()) {
      const authorId = messageIndex === 0 ? host.id : members[messageIndex % members.length];
      await client.query(
        `INSERT INTO space_messages (space_id, author_id, text, is_seed, created_at)
         VALUES ($1, $2, $3, true, now() - make_interval(hours => $4::int))`,
        [spaceId, authorId, text, SPACE_MESSAGES.length - messageIndex],
      );
    }

    // Ближайшая встреча — сообщество выглядит живым.
    await client.query(
      `INSERT INTO space_events (space_id, title, starts_at, place, created_by)
       VALUES ($1, $2, now() + make_interval(days => $3::int), $4, $5)`,
      [spaceId, "Встреча на этой неделе", 2 + (index % 5), `${city}, центр`, host.id],
    );

    count += 1;
  }
  return count;
}

await ensureSeedColumns();

const users = await seedProfiles();
const listings = await seedListings(users);
const spaces = await seedSpaces(users);

await client.end();

const fresh = users.filter((user) => user.fresh).length;
console.log("[seed] готово");
console.log(`  анкеты: всего демо ${users.length}, создано сейчас ${fresh}`);
for (const [category, count] of Object.entries(listings)) {
  console.log(`  объявления «${category}»: создано ${count}`);
}
console.log(`  сообщества: создано ${spaces}`);
console.log("  очистить всё демо: npm run seed:clear");
