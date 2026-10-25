import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID() + randomUUID();
process.env.SMTP_HOST = '';
const { env } = await import('../src/env.ts');
const { pool, query, queryOne } = await import('../src/db.ts');
const { hashCode } = await import('../src/auth/phone.ts');
const { hashPassword, verifyPassword } = await import('../src/auth/passwords.ts');
const { signAccessToken, issueRefreshToken, rotateRefreshToken } = await import('../src/auth/tokens.ts');
const { authRoutes } = await import('../src/routes/auth.ts');
const { settingsRoutes } = await import('../src/routes/settings.ts');
const { confirmRoutes } = await import('../src/routes/confirm.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const app = (await import('fastify')).default();
registerErrorHandler(app);
await app.register((await import('@fastify/cookie')).default);
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(settingsRoutes, { prefix: '/api/settings' });
await app.register(confirmRoutes, { prefix: '/api/confirm' });
const ids = [], phones = [], emails = [];
const post = (url, payload, token) => app.inject({ method: 'POST', url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
async function user(verified = false, phone = null) {
  const id = randomUUID(), email = `${id}@test.local`;
  ids.push(id); emails.push(email);
  await query('INSERT INTO users (id,email,password_hash,email_verified,phone,phone_verified) VALUES ($1,$2,$3,$4,$5,$6)', [id,email,await hashPassword('OldPassword123'),verified,phone,false]);
  await query("INSERT INTO profiles (user_id,name) VALUES ($1,'Тест')", [id]);
  return { id, email, token: await signAccessToken(id) };
}
function phone() { const value = `+7999${String(Date.now()).slice(-7)}`; phones.push(value); return value; }
async function smsCode(number, purpose = 'login', userId = null) {
  await query('INSERT INTO auth_otps (phone,code_hash,expires_at,purpose,user_id) VALUES ($1,$2,now()+interval \'5 minutes\',$3,$4)', [number,hashCode(number,'123456'),purpose,userId]);
}
async function emailCode(email, minutes = 15) {
  await query('UPDATE auth_email_codes SET consumed_at=now() WHERE email=$1',[email]);
  await query("INSERT INTO auth_email_codes (email,code_hash,expires_at) VALUES ($1,$2,now()+($3::int*interval '1 minute'))", [email,hashCode(`reset:${email}`,'123456'),minutes]);
}
try {
  await test('SMS login never opens a legacy unverified phone account', async () => {
    const number = phone(), legacy = await user(false,number);
    await smsCode(number);
    const response = await post('/api/auth/phone/verify',{phone:number,code:'123456'});
    assert.equal(response.statusCode,200);
    assert.notEqual(response.json().user.id,legacy.id);
    ids.push(response.json().user.id);
    assert.equal(response.json().isNew,true);
    assert.deepEqual(await queryOne('SELECT phone,phone_verified FROM users WHERE id=$1',[legacy.id]),{phone:null,phone_verified:false});
  });
  await test('settings reject direct phone writes and linking requires an authenticated scoped SMS code', async () => {
    const who = await user(), other = await user(), number = phone();
    const patch = await app.inject({method:'PATCH',url:'/api/settings/account',headers:{authorization:`Bearer ${who.token}`},payload:{phone:number}});
    assert.equal(patch.statusCode,400);
    assert.equal((await post('/api/auth/phone/link/request',{phone:number})).statusCode,401);
    assert.equal((await post('/api/auth/phone/link/verify',{phone:number,code:'123456'},who.token)).statusCode,400);
    await smsCode(number); // login codes cannot link a phone
    assert.equal((await post('/api/auth/phone/link/verify',{phone:number,code:'123456'},who.token)).statusCode,400);
    await smsCode(number,'link',who.id);
    assert.equal((await post('/api/auth/phone/link/verify',{phone:number,code:'123456'},other.token)).statusCode,400);
    assert.equal((await post('/api/auth/phone/link/verify',{phone:number,code:'123456'},who.token)).statusCode,200);
    assert.equal((await queryOne('SELECT phone_verified FROM users WHERE id=$1',[who.id])).phone_verified,true);
    assert.equal((await queryOne("SELECT user_id FROM user_identities WHERE provider='phone' AND provider_user_id=$1",[number])).user_id,who.id);
    await smsCode(number,'link',other.id);
    assert.equal((await post('/api/auth/phone/link/verify',{phone:number,code:'123456'},other.token)).statusCode,409);
  });
  await test('legacy phone confirmation endpoints return 410', async () => {
    const who = await user();
    for (const suffix of ['request','verify']) assert.equal((await post(`/api/confirm/phone/${suffix}`,{code:'123456'},who.token)).statusCode,410);
  });
  await test('email change requires the current password and resets verification', async () => {
    const who = await user(true), email = `${randomUUID()}@test.local`; emails.push(email);
    const patch = payload => app.inject({method:'PATCH',url:'/api/settings/account',headers:{authorization:`Bearer ${who.token}`},payload});
    assert.equal((await patch({email})).statusCode,401);
    assert.equal((await patch({email,currentPassword:'wrong'})).statusCode,401);
    assert.equal((await patch({email,currentPassword:'OldPassword123'})).statusCode,200);
    assert.equal((await queryOne('SELECT email_verified FROM users WHERE id=$1',[who.id])).email_verified,false);
  });
  await test('SMTP disabled: config hides reset and requests remain indistinguishable', async () => {
    const who = await user(true), unknown = `${randomUUID()}@test.local`; emails.push(unknown);
    assert.equal((await app.inject({url:'/api/auth/config'})).json().passwordResetEnabled,false);
    for (const email of [who.email,unknown]) {
      const result = await post('/api/auth/password/reset/request',{email});
      assert.equal(result.statusCode,204); assert.equal(result.body,'');
      assert.equal((await query('SELECT id FROM auth_email_codes WHERE email=$1',[email])).length,0);
    }
  });
  await test('SMTP enabled: requests for verified, unverified and absent emails have the same 204 and persistent limits', async () => {
    const verified = await user(true), unverified = await user(false), unknown = `${randomUUID()}@test.local`; emails.push(unknown);
    env.SMTP_HOST = '127.0.0.1'; env.SMTP_PORT = 1;
    try {
      for (const email of [verified.email,unverified.email,unknown]) {
        const response = await post('/api/auth/password/reset/request',{email});
        assert.equal(response.statusCode,204); assert.equal(response.body,'');
        assert.equal((await post('/api/auth/password/reset/request',{email})).statusCode,204);
        const codes = await query('SELECT code_hash FROM auth_email_codes WHERE email=$1',[email]);
        assert.equal(codes.length,1); assert.equal(codes[0].code_hash.length,64);
      }
    } finally { env.SMTP_HOST = ''; }
  });
  await test('verified email reset changes password, consumes code and revokes every refresh token', async () => {
    const who = await user(true), refresh = await issueRefreshToken(who.id);
    await issueRefreshToken(who.id); await emailCode(who.email);
    const body = {email:who.email,code:'123456',newPassword:'NewPassword456'};
    assert.equal((await post('/api/auth/password/reset/confirm',body)).statusCode,204);
    assert.ok(await verifyPassword((await queryOne('SELECT password_hash FROM users WHERE id=$1',[who.id])).password_hash,body.newPassword));
    assert.equal((await query('SELECT id FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL',[who.id])).length,0);
    await assert.rejects(() => rotateRefreshToken(refresh));
    assert.equal((await post('/api/auth/password/reset/confirm',body)).statusCode,400);
  });
  await test('unverified emails cannot reset passwords even with a correct code', async () => {
    const who = await user(false); await emailCode(who.email);
    assert.equal((await post('/api/auth/password/reset/confirm',{email:who.email,code:'123456',newPassword:'NewPassword456'})).statusCode,400);
    assert.ok(await verifyPassword((await queryOne('SELECT password_hash FROM users WHERE id=$1',[who.id])).password_hash,'OldPassword123'));
  });
  await test('reset codes expire after 15 minutes and burn after five attempts; registration strength is enforced', async () => {
    const who = await user(true); await emailCode(who.email);
    const body = {email:who.email,code:'000000',newPassword:'NewPassword456'};
    assert.equal((await post('/api/auth/password/reset/confirm',{...body,code:'123456',newPassword:'abcdefghijk'})).statusCode,400);
    for(let i=0;i<5;i++) assert.equal((await post('/api/auth/password/reset/confirm',body)).statusCode,400);
    assert.equal((await queryOne('SELECT attempts FROM auth_email_codes WHERE email=$1 ORDER BY created_at DESC LIMIT 1',[who.email])).attempts,5);
    assert.equal((await post('/api/auth/password/reset/confirm',{...body,code:'123456'})).statusCode,400);
    await emailCode(who.email,-1);
    assert.equal((await post('/api/auth/password/reset/confirm',{...body,code:'123456'})).statusCode,400);
  });
} finally {
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM auth_otps WHERE phone=ANY($1::text[])',[phones]);
  await query('DELETE FROM auth_email_codes WHERE email=ANY($1::text[])',[emails]);
  await app.close(); await pool.end();
}