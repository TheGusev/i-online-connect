import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:5546/space_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID() + randomUUID();
process.env.MEDIA_DIR ||= '/tmp/space-tests/media';
const { pool, query, queryOne } = await import('../src/db.ts');
const { signAccessToken } = await import('../src/auth/tokens.ts');
const { spaceRoutes } = await import('../src/routes/spaces.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const Fastify = (await import('fastify')).default;
const app = Fastify();
registerErrorHandler(app);
await app.register((await import('@fastify/multipart')).default);
await app.register(spaceRoutes, { prefix: '/api/spaces' });
const ids = [];
const spaces = [];
async function user() {
  const id = randomUUID(); ids.push(id);
  await query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [id, `${id}@test.local`, 'unused-test-hash']);
  await query("INSERT INTO profiles(user_id,name,city) VALUES($1,'Тест','Новосибирск')", [id]);
  return { id, token: await signAccessToken(id) };
}
const host = await user(); const author = await user(); const member = await user(); const outsider = await user();
async function space() {
  const result = await queryOne("INSERT INTO spaces(title,host_id) VALUES('Тест сообщества',$1) RETURNING id", [host.id]);
  spaces.push(result.id);
  await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member'),($1,$4,'member')", [result.id,host.id,author.id,member.id]);
  return result.id;
}
const spaceId = await space(); const otherSpace = await space();
async function message(kind='text', ageHours=0, mediaUrl=null) {
  return queryOne(`INSERT INTO space_messages(space_id,author_id,text,kind,created_at,media_url,media_mime)
    VALUES($1,$2,'Исходный текст',$3,now()-($4::text||' hours')::interval,$5,$6) RETURNING id`,
    [spaceId,author.id,kind,String(ageHours),mediaUrl,mediaUrl?'image/png':null]);
}
const call = (who, method, suffix, payload) => app.inject({ method, url:`/api/spaces/${spaceId}${suffix}`, headers:{ authorization:`Bearer ${who.token}` }, payload });
try {
 await test('author edits own text', async () => {
   const m=await message(); const response=await call(author,'PATCH',`/messages/${m.id}`,{text:'Новый текст'});
   assert.equal(response.statusCode,200); assert.equal(response.json().text,'Новый текст'); assert.ok(response.json().editedAt);
 });
 await test('member and organizer cannot edit someone else', async () => {
   const m=await message();
   for (const who of [member,host]) assert.equal((await call(who,'PATCH',`/messages/${m.id}`,{text:'Чужая правка'})).statusCode,403);
 });
 await test('edit window is 24 hours', async () => {
   const m=await message('text',25); assert.equal((await call(author,'PATCH',`/messages/${m.id}`,{text:'Поздняя правка'})).statusCode,400);
 });
 await test('member cannot delete someone else', async () => {
   const m=await message(); assert.equal((await call(member,'DELETE',`/messages/${m.id}`)).statusCode,403);
 });
 await test('organizer deletes any message', async () => {
   const m=await message(); assert.equal((await call(host,'DELETE',`/messages/${m.id}`)).statusCode,200);
   const row=await queryOne('SELECT text,deleted_at FROM space_messages WHERE id=$1',[m.id]); assert.equal(row.text,''); assert.ok(row.deleted_at);
 });
 await test('deleted media is erased and excluded from gallery', async () => {
   const dir=path.join(process.env.MEDIA_DIR,author.id); await mkdir(dir,{recursive:true});
   const filename=`${randomUUID()}.png`; await writeFile(path.join(dir,filename),Buffer.alloc(600));
   const m=await message('image',0,`/api/media-file/${author.id}/${filename}`);
   assert.equal((await call(author,'DELETE',`/messages/${m.id}`)).statusCode,200);
   const gallery=await call(author,'GET','/media'); assert.equal(gallery.json().items.some(i=>i.id===m.id),false);
   const row=await queryOne('SELECT media_url,deleted_at FROM space_messages WHERE id=$1',[m.id]); assert.equal(row.media_url,null); assert.ok(row.deleted_at);
   await assert.rejects(access(path.join(dir,filename)));
 });
 await test('reply stays in same community', async () => {
   const m=await message(); const ok=await call(author,'POST','/messages',{text:'Ответ',replyToId:m.id});
   assert.equal(ok.statusCode,200); assert.equal(ok.json().replyTo.id,m.id);
   const wrong=await queryOne("INSERT INTO space_messages(space_id,author_id,text) VALUES($1,$2,'Чужой чат') RETURNING id",[otherSpace,author.id]);
   assert.equal((await call(author,'POST','/messages',{text:'Ответ',replyToId:wrong.id})).statusCode,400);
 });
 await test('outsider cannot mutate messages', async () => {
   const m=await message(); assert.equal((await call(outsider,'DELETE',`/messages/${m.id}`)).statusCode,403);
 });
 await test('only organizer changes cover', async () => {
   assert.equal((await call(author,'PATCH','/cover',{coverUrl:'/assets/test.png'})).statusCode,403);
   const ok=await call(host,'PATCH','/cover',{coverUrl:'/assets/test.png'}); assert.equal(ok.statusCode,200); assert.equal(ok.json().coverUrl,'/assets/test.png');
 });
} finally {
 await app.close();
 await query('DELETE FROM spaces WHERE id=ANY($1::uuid[])',[spaces]);
 await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
 await pool.end();
}
