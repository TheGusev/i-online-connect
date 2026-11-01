import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.PHONE_LOGIN_ENABLED = 'false';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID() + randomUUID();
process.env.SMTP_HOST = '';
const { query, queryOne, pool } = await import('../src/db.ts');
const { env } = await import('../src/env.ts');
const { hashCode } = await import('../src/auth/phone.ts');
const { signAccessToken } = await import('../src/auth/tokens.ts');
const { hasVerifiedContact, verifiedContactSql } = await import('../src/auth/contact-rules.ts');
const { authRoutes } = await import('../src/routes/auth.ts');
const { profileRoutes } = await import('../src/routes/profile.ts');
const { confirmRoutes } = await import('../src/routes/confirm.ts');
const { listingRoutes } = await import('../src/routes/listings.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const app = (await import('fastify')).default();
registerErrorHandler(app);
await app.register((await import('@fastify/cookie')).default);
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(profileRoutes, { prefix: '/api/profiles' });
await app.register(confirmRoutes, { prefix: '/api/confirm' });
await app.register(listingRoutes, { prefix: '/api/listings' });
const ids = [];
async function user() {
  const id = randomUUID(); ids.push(id);
  await query('INSERT INTO users(id,email) VALUES($1,$2)', [id, `${id}@test.local`]);
  await query("INSERT INTO profiles(user_id,name,age,city) VALUES($1,'Тест',NULL,'')", [id]);
  await query('INSERT INTO privacy_settings(user_id) VALUES($1)', [id]);
  return { id, token: await signAccessToken(id) };
}
const call = (method, url, payload, who) => app.inject({ method, url, payload, headers: who ? { authorization: `Bearer ${who.token}` } : {} });
async function emailCode(who, expires = 10) {
  const account = await queryOne('SELECT email FROM users WHERE id=$1', [who.id]);
  await query("UPDATE contact_confirmations SET consumed_at=now() WHERE user_id=$1 AND channel='email'", [who.id]);
  await query("INSERT INTO contact_confirmations(user_id,channel,destination,code_hash,expires_at) VALUES($1,'email',$2,$3,now()+($4::int*interval '1 minute'))", [who.id,account.email,hashCode(`confirm:${who.id}:${account.email}`,'123456'),expires]);
}
try {
  await test('disabled SMS routes return 404 before validation/auth and leave OTP storage unchanged', async () => {
    const before = (await queryOne('SELECT count(*)::int AS n FROM auth_otps')).n;
    for (const path of ['request','verify','link/request','link/verify']) {
      assert.equal((await call('POST',`/api/auth/phone/${path}`,{})).statusCode,404);
    }
    assert.equal((await queryOne('SELECT count(*)::int AS n FROM auth_otps')).n,before);
    assert.equal((await app.inject({url:'/api/auth/config'})).json().phoneLoginEnabled,false);
  });
  await test('server rejects age 17, 101 and nonnumber; accepts 18 and 100 with explicit adult confirmation', async () => {
    for (const age of [17,101,'abc']) {
      const who = await user();
      assert.equal((await call('PATCH','/api/profiles/me',{name:'Тест',age,city:'Москва',adultConfirmed:true},who)).statusCode,400);
      assert.equal((await queryOne('SELECT age FROM profiles WHERE user_id=$1',[who.id])).age,null);
    }
    for (const age of [18,100]) {
      const who = await user();
      assert.equal((await call('PATCH','/api/profiles/me',{name:'Тест',age,city:'Москва'},who)).statusCode,400);
      assert.equal((await call('PATCH','/api/profiles/me',{name:'Тест',age,city:'Москва',adultConfirmed:true},who)).statusCode,200);
      assert.equal((await call('GET','/api/auth/me',undefined,who)).json().age,age);
    }
  });
  await test('urgent bid rejects no verified contact and accepts Yandex, Telegram, phone or confirmed email without weakening buyer checks', async () => {
    const seller = await user();
    const lot = await queryOne("INSERT INTO listings(author_id,category,title,city,urgent_type,price_start_minor,price_floor_minor,expires_at) VALUES($1,'urgent','Тест контакта','Москва','sell',15000,10000,now()+interval '6 hours') RETURNING id",[seller.id]);
    for (const provider of ['none','yandex','telegram','phone','email']) {
      const who = await user();
      if (provider === 'yandex' || provider === 'telegram') await query('INSERT INTO user_identities(user_id,provider,provider_user_id) VALUES($1,$2,$3)',[who.id,provider,randomUUID()]);
      if (provider === 'phone') await query('UPDATE users SET phone_verified=true WHERE id=$1',[who.id]);
      if (provider === 'email') {
        await emailCode(who);
        assert.equal((await call('POST','/api/confirm/email/verify',{code:'123456'},who)).statusCode,200);
      }
      const row = await queryOne(`SELECT ${verifiedContactSql} FROM users u WHERE id=$1`,[who.id]);
      assert.equal(hasVerifiedContact(row),provider !== 'none');
      const result = await call('PUT',`/api/listings/${lot.id}/bid`,{maxPriceMinor:10000},who);
      assert.equal(result.statusCode,provider === 'none' ? 403 : 200);
      if (provider === 'none') assert.equal(result.json().code,'CONTACT_NOT_VERIFIED');
    }
  });
  await test('email codes reject wrong, expired, replayed and exhausted attempts; parallel guesses commit no more than five', async () => {
    const who = await user();
    await emailCode(who);
    const responses = await Promise.all(Array.from({length:8},()=>call('POST','/api/confirm/email/verify',{code:'000000'},who)));
    assert.ok(responses.every(result=>result.statusCode===400));
    assert.equal((await queryOne('SELECT attempts FROM contact_confirmations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[who.id])).attempts,5);
    assert.equal((await call('POST','/api/confirm/email/verify',{code:'123456'},who)).statusCode,400);
    await emailCode(who,-1);
    assert.equal((await call('POST','/api/confirm/email/verify',{code:'123456'},who)).statusCode,400);
    await emailCode(who);
    assert.equal((await call('POST','/api/confirm/email/verify',{code:'123456'},who)).statusCode,200);
    assert.equal((await call('POST','/api/confirm/email/verify',{code:'123456'},who)).statusCode,400);
  });
  await test('changing email invalidates old confirmation destination', async () => {
    const who=await user(); await emailCode(who);
    await query('UPDATE users SET email=$2 WHERE id=$1',[who.id,`${randomUUID()}@test.local`]);
    assert.equal((await call('POST','/api/confirm/email/verify',{code:'123456'},who)).statusCode,400);
    assert.equal((await queryOne('SELECT email_verified FROM users WHERE id=$1',[who.id])).email_verified,false);
  });
  await test('SMTP off creates no code; account/IP request limits persist, code TTL is ten minutes', async () => {
    const who=await user();
    assert.equal((await call('POST','/api/confirm/email/request',{},who)).statusCode,503);
    assert.equal((await query('SELECT id FROM contact_confirmations WHERE user_id=$1',[who.id])).length,0);
    env.SMTP_HOST='127.0.0.1'; env.SMTP_PORT=1;
    try {
      assert.equal((await call('POST','/api/confirm/email/request',{},who)).statusCode,503);
      const row=await queryOne('SELECT expires_at,created_at FROM contact_confirmations WHERE user_id=$1',[who.id]);
      assert.equal(row.expires_at.getTime()-row.created_at.getTime(),600_000);
      assert.equal((await call('POST','/api/confirm/email/request',{},who)).statusCode,429);
      await query("UPDATE contact_confirmations SET created_at=now()-interval '2 minutes' WHERE user_id=$1",[who.id]);
      for(let i=0;i<19;i++) await query("INSERT INTO contact_confirmations(user_id,channel,destination,code_hash,expires_at,ip) VALUES($1,'email','test','hash',now(),'127.0.0.1')",[who.id]);
      const other=await user();
      assert.equal((await call('POST','/api/confirm/email/request',{},other)).statusCode,429);
    } finally { env.SMTP_HOST=''; }
  });
} finally {
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  await app.close(); await pool.end();
}