import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { query, queryOne, transaction } from "../db.ts";
import { env } from "../env.ts";
import { badRequest, HttpError } from "../http.ts";
import { requireAuth, currentUserId } from "../auth/middleware.ts";
import { createFlow, signFlow, readFlow, digest, providerSchema, type OAuthFlow } from "../auth/oauth-security.ts";
import { providerEnabled, publicBase, authorizationUrl, exchangeProfile } from "../auth/oauth-providers.ts";
import { oauthAccount, unlinkIdentity } from "../auth/oauth-account.ts";
import { issueRefreshToken, signAccessToken } from "../auth/tokens.ts";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: env.isProd, path: "/api/auth", maxAge: 600 };
const rate = { rateLimit: { max: 20, timeWindow: "10 minutes" } };
export async function saveOAuthState(flow: OAuthFlow) {
  // Reuse existing OTP storage, isolated namespace/purpose, no new table. Survives PM2/restarts.
  await query("DELETE FROM auth_otps WHERE purpose IN ('oauth','oauth-result') AND expires_at < now()");
  await query("INSERT INTO auth_otps (phone,code_hash,expires_at,purpose,user_id) VALUES ($1,$2,$3,'oauth',$4)",
    [`oauth:${digest(flow.state)}`, digest(flow.verifier), new Date(flow.expires), flow.userId ?? null]);
}
export async function consumeOAuthState(flow: OAuthFlow) {
  const used = await query("UPDATE auth_otps SET consumed_at=now() WHERE phone=$1 AND code_hash=$2 AND purpose='oauth' AND consumed_at IS NULL AND expires_at>now() RETURNING id",
    [`oauth:${digest(flow.state)}`, digest(flow.verifier)]);
  if (used.length !== 1) throw new Error("oauth_state_replayed");
}
export async function oauthRoutes(app: FastifyInstance) {
  app.get("/identities", { preHandler: requireAuth }, async request => {
    const id = currentUserId(request);
    const linked = await query<{ provider: string }>("SELECT DISTINCT provider FROM user_identities WHERE user_id=$1", [id]);
    const account = await queryOne<{ email_login: boolean; phone_login: boolean }>("SELECT (email IS NOT NULL AND password_hash IS NOT NULL) AS email_login, (phone IS NOT NULL AND phone_verified) AS phone_login FROM users WHERE id=$1", [id]);
    return { linked: linked.map(row => row.provider), email: account?.email_login ?? false, phone: account?.phone_login ?? false };
  });
  async function start(reply: FastifyReply, provider: "yandex" | "telegram", userId?: string) {
    if (!providerEnabled(provider)) throw badRequest("Этот способ входа пока недоступен");
    const flow = createFlow(provider, userId);
    const url = authorizationUrl(flow);
    await saveOAuthState(flow);
    reply.setCookie(`ya_oauth_${provider}`, signFlow(flow, env.JWT_REFRESH_SECRET), cookieOptions);
    return url;
  }
  app.post("/identities/:provider/link/start", { preHandler: requireAuth, config: rate }, async (request, reply) => {
    const { provider } = z.object({ provider: providerSchema }).parse(request.params);
    return { url: await start(reply, provider, currentUserId(request)) };
  });
  app.delete("/identities/:provider", { preHandler: requireAuth, config: rate }, async (request, reply) => {
    const { provider } = z.object({ provider: providerSchema }).parse(request.params);
    await transaction(client => unlinkIdentity(client, currentUserId(request), provider));
    return reply.status(204).send();
  });
  for (const provider of ["yandex", "telegram"] as const) {
    app.get(`/${provider}/start`, { config: rate }, async (_request, reply) => reply.redirect(await start(reply, provider)));
    app.get(`/${provider}/callback`, { config: rate }, async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
      const cookie = request.cookies[`ya_oauth_${provider}`];
      reply.clearCookie(`ya_oauth_${provider}`, { path: "/api/auth" });
      let linking = false;
      try {
        if (!providerEnabled(provider)) throw new Error("provider_disabled");
        const params = z.object({ state: z.string().max(200), code: z.string().min(1).max(4096).optional(), error: z.string().max(200).optional() }).parse(request.query);
        const flow = readFlow(cookie, env.JWT_REFRESH_SECRET, provider, params.state);
        linking = Boolean(flow.userId);
        await consumeOAuthState(flow); // burn before network I/O, including provider cancellation
        if (params.error || !params.code) throw new Error("provider_cancelled");
        const profile = await exchangeProfile(flow, params.code);
        const account = await transaction(client => oauthAccount(client, provider, profile, flow.userId));
        if (flow.userId) return reply.redirect(`${publicBase()}/settings?oauth=linked`);
        reply.setCookie("ya_refresh", await issueRefreshToken(account.id, { ip: request.ip, userAgent: request.headers["user-agent"] }),
          { ...cookieOptions, maxAge: env.REFRESH_TTL_DAYS * 86400 });
        // Access tokens never appear in URLs. A signed one-use cookie hands the session to the public UI route.
        const result = createFlow(provider, account.id);
        result.expires = Date.now() + 60_000;
        await query("INSERT INTO auth_otps (phone,code_hash,expires_at,purpose,user_id,attempts) VALUES ($1,$2,$3,'oauth-result',$4,$5)",
          [`oauth-result:${digest(result.state)}`, digest(result.verifier), new Date(result.expires), account.id, account.isNew ? 1 : 0]);
        reply.setCookie("ya_oauth_result", signFlow(result, env.JWT_REFRESH_SECRET), { ...cookieOptions, maxAge: 60 });
        return reply.redirect(`${publicBase()}/oauth-callback?provider=${provider}&state=${result.state}`);
      } catch (error) {
        const kind = error instanceof HttpError ? error.code ?? `http_${error.statusCode}` : error instanceof Error && /^(oauth_|provider_|telegram_)[\w]+$/.test(error.message) ? error.message : "provider_response_invalid";
        request.log.warn({ provider, kind }, "[oauth] вход не завершён");
        const reason = error instanceof HttpError && error.statusCode === 409 ? "identity_taken" : error instanceof HttpError && error.statusCode === 403 ? "account_unavailable" : "failed";
        return reply.redirect(`${publicBase()}/${linking ? "settings" : "oauth-callback"}?oauth=${reason}`);
      }
    });
  }
  app.post("/oauth/result", { config: rate }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { provider, state } = z.object({ provider: providerSchema, state: z.string().max(200) }).parse(request.body);
    reply.clearCookie("ya_oauth_result", { path: "/api/auth" });
    let flow: OAuthFlow;
    try { flow = readFlow(request.cookies.ya_oauth_result, env.JWT_REFRESH_SECRET, provider, state); }
    catch { throw badRequest("Вход истёк — попробуйте снова"); }
    const result = await transaction(async client => {
      const row = await client.query<{ user_id: string; attempts: number }>("UPDATE auth_otps SET consumed_at=now() WHERE phone=$1 AND code_hash=$2 AND purpose='oauth-result' AND consumed_at IS NULL AND expires_at>now() RETURNING user_id,attempts",
        [`oauth-result:${digest(flow.state)}`, digest(flow.verifier)]);
      const account = row.rows[0];
      if (!account) throw badRequest("Вход истёк — попробуйте снова");
      const available = await client.query("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND blocked_at IS NULL", [account.user_id]);
      if (!available.rowCount) throw badRequest("Аккаунт недоступен");
      return { id: account.user_id, isNew: account.attempts === 1 };
    });
    return { token: await signAccessToken(result.id), isNew: result.isNew };
  });
}