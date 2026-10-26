import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
process.env.NODE_ENV='test';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID()+randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID()+randomUUID();
const { pool,query,queryOne,transaction }=await import('../src/db.ts');
const { oauthAccount,unlinkIdentity }=await import('../src/auth/oauth-account.ts');
const { createFlow, signFlow }=await import('../src/auth/oauth-security.ts');
const { saveOAuthState,consumeOAuthState }=await import('../src/routes/oauth.ts');
const { authRoutes }=await import('../src/routes/auth.ts');
const { signAccessToken }=await import('../src/auth/tokens.ts');
const { env }=await import('../src/env.ts');
const { registerErrorHandler }=await import('../src/http.ts');
const app=(await import('fastify')).default(); registerErrorHandler(app);
await app.register((await import('@fastify/cookie')).default);
await app.register(authRoutes,{prefix:'/api/auth'});
const ids=[];
function profile(extra={}) { return {subject:randomUUID(),name:'Имя',phoneVerified:false,...extra}; }
async function create(data=profile(),provider='yandex') { const result=await transaction(c=>oauthAccount(c,provider,data));ids.push(result.id);return result; }
try {
  await test('state redemption atomically refuses replay and forged PKCE verifier',async()=>{
    const flow=createFlow('telegram');await saveOAuthState(flow);
    await assert.rejects(()=>consumeOAuthState({...flow,verifier:createFlow('telegram').verifier}));
    await consumeOAuthState(flow); await assert.rejects(()=>consumeOAuthState(flow));
  });
  await test('identity-only account supports no contact and never merges by provider email',async()=>{
    const email=`${randomUUID()}@test.local`,id=randomUUID();ids.push(id);
    await query('INSERT INTO users(id,email) VALUES($1,$2)',[id,email]);
    const p=profile({email}),a=await create(p),b=await create(p);
    assert.notEqual(a.id,id);assert.equal(b.id,a.id);assert.equal(a.isNew,true);assert.equal(b.isNew,false);
    assert.deepEqual(await queryOne('SELECT email,phone,email_verified,phone_verified FROM users WHERE id=$1',[a.id]),{email:null,phone:null,email_verified:false,phone_verified:false});
  });
  await test('existing blocked or deleted identities cannot log in',async()=>{
    for(const column of ['blocked_at','deleted_at']) { const p=profile(),a=await create(p);await query(`UPDATE users SET ${column}=now() WHERE id=$1`,[a.id]);await assert.rejects(()=>transaction(c=>oauthAccount(c,'yandex',p)),e=>e.statusCode===403); }
  });
  await test('link start requires authorization; identity link cannot take another account',async()=>{
    assert.equal((await app.inject({method:'POST',url:'/api/auth/identities/yandex/link/start'})).statusCode,401);
    const p=profile(),a=await create(p),b=await create();
    await assert.rejects(()=>transaction(c=>oauthAccount(c,'yandex',p,b.id)),e=>e.statusCode===409);
    assert.equal((await queryOne('SELECT user_id FROM user_identities WHERE provider=$1 AND provider_user_id=$2',['yandex',p.subject])).user_id,a.id);
  });
  await test('DELETE refuses last login and permits unlink with another identity',async()=>{
    const a=await create(),token=await signAccessToken(a.id);
    const remove=()=>app.inject({method:'DELETE',url:'/api/auth/identities/yandex',headers:{authorization:`Bearer ${token}`}});
    assert.equal((await remove()).statusCode,409);
    await transaction(c=>oauthAccount(c,'telegram',profile(),a.id));
    assert.equal((await remove()).statusCode,204);
    assert.equal((await query('SELECT provider FROM user_identities WHERE user_id=$1',[a.id])).length,1);
  });
  await test('verified allowed free provider phone is claimed; unverified/foreign-prefix phones are not',async()=>{
    const phone=`+7999${String(Date.now()).slice(-7)}`;
    const a=await create(profile({phone,phoneVerified:true}),'telegram');
    assert.equal((await queryOne('SELECT phone_verified FROM users WHERE id=$1',[a.id])).phone_verified,true);
    assert.equal((await queryOne("SELECT user_id FROM user_identities WHERE provider='phone' AND provider_user_id=$1",[phone])).user_id,a.id);
    const b=await create(profile({phone,phoneVerified:false})),c=await create(profile({phone:'+12025550100',phoneVerified:true}));
    for(const id of [b.id,c.id]) assert.equal((await queryOne('SELECT phone FROM users WHERE id=$1',[id])).phone,null);
    const d=await create(profile({phone,phoneVerified:true}));assert.notEqual(d.id,a.id);
    assert.equal((await queryOne('SELECT phone FROM users WHERE id=$1',[d.id])).phone,null);
  });
  await test('disabled providers stay hidden in public config and callback fails in Russian-facing redirect',async()=>{
    const config=(await app.inject({url:'/api/auth/config'})).json();assert.equal(config.providers.yandex,false);assert.equal(config.providers.telegram,false);
    assert.equal((await app.inject({url:'/api/auth/yandex/start'})).statusCode,400);
    const result=await app.inject({url:'/api/auth/telegram/callback?state=invalid&code=invalid'});
    assert.equal(result.statusCode,302);assert.ok(result.headers.location.endsWith('/oauth-callback?oauth=failed'));
  });
} finally { await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await query("DELETE FROM auth_otps WHERE purpose IN ('oauth','oauth-result')");await app.close();await pool.end(); }