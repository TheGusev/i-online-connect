import type pg from "pg";
import { forbidden, conflict } from "../http.ts";
import { normalizePhone } from "./phone.ts";
import { claimPhone } from "./phone-account.ts";
import type { OAuthProvider } from "./oauth-security.ts";
import type { ProviderProfile } from "./oauth-providers.ts";
import { env } from "../env.ts";

export async function oauthAccount(client: pg.PoolClient, provider: OAuthProvider, profile: ProviderProfile, linkUserId?: string) {
  // Serializes all identity attach/detach and phone ownership changes across PM2 processes.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('oauth-identities'))");
  const identity = await client.query<{ user_id: string }>("SELECT user_id FROM user_identities WHERE provider=$1 AND provider_user_id=$2", [provider, profile.subject]);
  let id = identity.rows[0]?.user_id;
  if (linkUserId && id && id !== linkUserId) throw conflict("Этот способ входа уже привязан к другому аккаунту");
  id = linkUserId ?? id;
  const isNew = !id;
  if (id) {
    const account = await client.query<{ deleted_at: Date | null; blocked_at: Date | null }>("SELECT deleted_at,blocked_at FROM users WHERE id=$1 FOR UPDATE", [id]);
    if (!account.rows[0] || account.rows[0].deleted_at || account.rows[0].blocked_at) throw forbidden("Аккаунт удалён или заблокирован");
    if (linkUserId) {
      const existing = await client.query("SELECT 1 FROM user_identities WHERE user_id=$1 AND provider=$2 AND provider_user_id<>$3", [id, provider, profile.subject]);
      if (existing.rowCount) throw conflict("Сначала отвяжите прежний аккаунт этого сервиса");
    }
  } else {
    // No provider email is stored or used for lookup: NULL satisfies uniqueness without fabricated contacts.
    const created = await client.query<{ id: string }>("INSERT INTO users (email,password_hash) VALUES (NULL,NULL) RETURNING id");
    id = created.rows[0]?.id;
    if (!id) throw new Error("oauth_account_create");
    await client.query("INSERT INTO profiles (user_id,name) VALUES ($1,$2)", [id, profile.name]);
    for (const table of ["privacy_settings", "notification_prefs", "subscriptions"]) await client.query(`INSERT INTO ${table} (user_id) VALUES ($1)`, [id]);
  }
  await client.query("INSERT INTO user_identities (user_id,provider,provider_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, provider, profile.subject]);
  const phone = profile.phoneVerified && profile.phone ? normalizePhone(profile.phone) : null;
  if (phone) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`phone:${phone}`]);
    const other = await client.query("SELECT 1 FROM users WHERE ((phone=$1 AND phone_verified=true) OR id IN (SELECT user_id FROM user_identities WHERE provider='phone' AND provider_user_id=$1)) AND id<>$2", [phone,id]);
    const own = await client.query<{ phone_verified: boolean }>("SELECT phone_verified FROM users WHERE id=$1", [id]);
    if (!other.rowCount && !own.rows[0]?.phone_verified) await claimPhone(client, phone, id);
  }
  await client.query("UPDATE users SET last_seen_at=now() WHERE id=$1", [id]);
  return { id, isNew };
}
export function canUnlink(passwordLogin: boolean, verifiedPhone: boolean, remainingIdentities: number) {
  return passwordLogin || verifiedPhone || remainingIdentities > 0;
}
export async function unlinkIdentity(client: pg.PoolClient, userId: string, provider: OAuthProvider) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('oauth-identities'))");
  const result = await client.query<{ email: string | null; password_hash: string | null; phone_verified: boolean; phone: string | null }>("SELECT email,password_hash,phone_verified,phone FROM users WHERE id=$1 FOR UPDATE", [userId]);
  const account = result.rows[0];
  if (!account) throw forbidden();
  const remaining = await client.query<{ n: string }>("SELECT count(*) AS n FROM user_identities WHERE user_id=$1 AND provider<>$2 AND (provider<>'phone' OR $3)", [userId,provider,env.PHONE_LOGIN_ENABLED === "true"]);
  if (!canUnlink(Boolean(account.email && account.password_hash), env.PHONE_LOGIN_ENABLED === "true" && Boolean(account.phone && account.phone_verified), Number(remaining.rows[0]?.n ?? 0))) throw conflict("Нельзя отвязать последний способ входа");
  await client.query("DELETE FROM user_identities WHERE user_id=$1 AND provider=$2", [userId,provider]);
}