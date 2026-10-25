import type pg from "pg";
import { HttpError, forbidden } from "../http.ts";

/** Call inside a transaction after consuming a purpose-bound SMS code. */
export async function claimPhone(client: pg.PoolClient, phone: string, userId?: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`phone:${phone}`]);
  const { rows } = await client.query<{ id: string; deleted_at: Date | null; blocked_at: Date | null }>(
    `SELECT id, deleted_at, blocked_at FROM users
     WHERE (phone = $1 AND phone_verified = true)
        OR id IN (SELECT user_id FROM user_identities WHERE provider = 'phone' AND provider_user_id = $1)
     ORDER BY id FOR UPDATE`, [phone],
  );
  const owner = rows[0];
  if (rows.some(row => row.id !== (userId ?? owner?.id))) {
    throw new HttpError(409, "Этот номер уже привязан к другому подтверждённому аккаунту", "phone_taken");
  }
  if (!userId && owner?.blocked_at) throw forbidden("Аккаунт заблокирован модератором");
  if (!userId && owner?.deleted_at) throw forbidden("Аккаунт удалён");
  // A legacy unverified claim is not ownership. Preserve its account and clear only the claim.
  await client.query(
    "UPDATE users SET phone = NULL, phone_verified = false WHERE phone = $1 AND phone_verified = false AND id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)",
    [phone, userId ?? owner?.id ?? null],
  );
  let id = userId ?? owner?.id;
  const isNew = !id;
  if (!id) {
    const created = await client.query<{ id: string }>("INSERT INTO users (phone, phone_verified) VALUES ($1, true) RETURNING id", [phone]);
    id = created.rows[0]?.id;
    if (!id) throw new Error("Не удалось создать аккаунт");
    await client.query("INSERT INTO profiles (user_id, name) VALUES ($1, '')", [id]);
    for (const table of ["privacy_settings", "notification_prefs", "subscriptions"]) {
      await client.query(`INSERT INTO ${table} (user_id) VALUES ($1)`, [id]);
    }
  } else {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [id]);
    await client.query("DELETE FROM user_identities WHERE user_id = $1 AND provider = 'phone' AND provider_user_id <> $2", [id, phone]);
    await client.query("UPDATE users SET phone = $2, phone_verified = true, last_seen_at = now(), updated_at = now() WHERE id = $1", [id, phone]);
  }
  await client.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'phone', $2) ON CONFLICT DO NOTHING", [id, phone]);
  return { id, isNew };
}