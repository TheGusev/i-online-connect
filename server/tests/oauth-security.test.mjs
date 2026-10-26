import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
process.env.NODE_ENV='test';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID()+randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID()+randomUUID();
const { createFlow, signFlow, readFlow, pkceChallenge, verifyTelegramToken } = await import('../src/auth/oauth-security.ts');
const { authorizationUrl, yandexProfile } = await import('../src/auth/oauth-providers.ts');
const { canUnlink } = await import('../src/auth/oauth-account.ts');
const { env } = await import('../src/env.ts');
const secret = randomUUID()+randomUUID();
test('PKCE S256 matches RFC 7636 concrete vector and both authorization requests',()=>{
  assert.equal(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  for (const provider of ['yandex','telegram']) {
    const flow=createFlow(provider),url=new URL(authorizationUrl(flow));
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('code_challenge'),pkceChallenge(flow.verifier));
    assert.equal(url.searchParams.get('state'),flow.state);
    assert.equal(url.searchParams.get('nonce'),flow.nonce);
    assert.equal(url.searchParams.get('scope'),provider==='yandex'?'login:info login:email login:default_phone':'openid profile phone');
  }
});
test('signed 10-minute state cookie rejects tampering, wrong state/provider and expiry',()=>{
  const flow=createFlow('telegram'),cookie=signFlow(flow,secret);
  assert.equal(readFlow(cookie,secret,'telegram',flow.state).verifier,flow.verifier);
  assert.equal(flow.expires-Date.now()>599000,true);
  assert.throws(()=>readFlow(cookie+'x',secret,'telegram',flow.state));
  assert.throws(()=>readFlow(cookie,secret,'telegram','wrong'));
  assert.throws(()=>readFlow(cookie,secret,'yandex',flow.state));
  assert.throws(()=>readFlow(signFlow({...flow,expires:Date.now()-1},secret),secret,'telegram',flow.state));
});
const { publicKey, privateKey }=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const payload={iss:'https://oauth.telegram.org',aud:'telegram-client',sub:'stable-sub',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,nonce:'nonce',phone_number:'79991234567',phone_number_verified:true};
function jwt(claims=payload, signingKey=privateKey, alg='RS256') {
  const head=Buffer.from(JSON.stringify({alg,kid:'test-key'})).toString('base64url');
  const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256',Buffer.from(`${head}.${body}`),signingKey).toString('base64url')}`;
}
test('Telegram accepts RS256 signature, exact issuer/audience/nonce and uses sub',()=>{
  const result=verifyTelegramToken(jwt(),[key],'telegram-client','nonce');
  assert.equal(result.sub,'stable-sub'); assert.equal(result.phone_number_verified,true);
});
test('Telegram refuses invalid signature',()=>{
  const other=generateKeyPairSync('rsa',{modulusLength:2048});
  assert.throws(()=>verifyTelegramToken(jwt(payload,other.privateKey),[key],'telegram-client','nonce'));
});
test('Telegram refuses wrong aud',()=>assert.throws(()=>verifyTelegramToken(jwt({...payload,aud:'wrong'}),[key],'telegram-client','nonce')));
test('Telegram refuses wrong iss',()=>assert.throws(()=>verifyTelegramToken(jwt({...payload,iss:'https://attacker.test'}),[key],'telegram-client','nonce')));
test('Telegram refuses expired token, wrong nonce and non-RS256 algorithm',()=>{
  assert.throws(()=>verifyTelegramToken(jwt({...payload,exp:0}),[key],'telegram-client','nonce'));
  assert.throws(()=>verifyTelegramToken(jwt(),[key],'telegram-client','wrong'));
  assert.throws(()=>verifyTelegramToken(jwt(payload,privateKey,'HS256'),[key],'telegram-client','nonce'));
});
test('last identity cannot be unlinked without password or verified phone',()=>{
  assert.equal(canUnlink(false,false,0),false); assert.equal(canUnlink(true,false,0),true);
  assert.equal(canUnlink(false,true,0),true); assert.equal(canUnlink(false,false,1),true);
});
test('Yandex default_phone has no documented verification flag: remains unverified; email ignored',()=>{
  const profile=yandexProfile({id:'yandex-id',display_name:'Имя',default_email:'same@example.com',default_phone:{id:1,number:'+79991234567'},default_avatar_id:'foreign'});
  assert.equal(profile.subject,'yandex-id'); assert.equal(profile.phoneVerified,false);
  assert.equal(profile.phone,undefined); assert.equal(profile.email,undefined); assert.equal(profile.avatar,undefined);
});