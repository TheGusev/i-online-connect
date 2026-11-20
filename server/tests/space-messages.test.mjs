import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,access } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { assertArchiveTestDatabase } from '../scripts/isolated-archive-test.mjs';
await assertArchiveTestDatabase();
process.env.JWT_ACCESS_SECRET ||= randomUUID()+randomUUID();process.env.JWT_REFRESH_SECRET ||= randomUUID()+randomUUID();
const {pool,query,queryOne}=await import('../src/db.ts');const {signAccessToken}=await import('../src/auth/tokens.ts');
const {spaceRoutes}=await import('../src/routes/spaces.ts');const {registerErrorHandler}=await import('../src/http.ts');
const app=(await import('fastify')).default();registerErrorHandler(app);await app.register((await import('@fastify/multipart')).default);await app.register(spaceRoutes,{prefix:'/api/spaces'});
async function user(){const id=randomUUID();await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",[id,`${id}@test.invalid`]);await query("INSERT INTO profiles(user_id,name,city) VALUES($1,'Тест','Город')",[id]);return {id,token:await signAccessToken(id)};}
let host,author,member,outsider,spaceId,otherSpace;
async function space(){const s=await queryOne("INSERT INTO spaces(title,host_id,category) VALUES('Архив',$1,'city') RETURNING id",[host.id]);await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member'),($1,$4,'member')",[s.id,host.id,author.id,member.id]);return s.id;}
const call=(who,method,suffix,payload)=>app.inject({method,url:`/api/spaces/${spaceId}${suffix}`,headers:who?{authorization:`Bearer ${who.token}`}:{},...(payload===undefined?{}:{payload})});
const snapshot=id=>queryOne('SELECT text,edited_at,deleted_at,deleted_by,media_url FROM space_messages WHERE id=$1',[id]);
async function message(kind='text',hours=0,url=null){return queryOne("INSERT INTO space_messages(space_id,author_id,text,kind,created_at,media_url,media_mime) VALUES($1,$2,'Исходный текст',$3,now()-($4::text||' hours')::interval,$5,$6) RETURNING id",[spaceId,author.id,kind,String(hours),url,url?'image/png':null]);}
function denied(r){assert.equal(r.statusCode,403,r.body);assert.equal(r.json().message,'Архив общего обсуждения доступен только для чтения');}
async function history(){const r=await call(member,'GET','/messages');assert.equal(r.statusCode,200,r.body);assert.ok(Array.isArray(r.json()));return r.json();}
try {
  host=await user();author=await user();member=await user();outsider=await user();spaceId=await space();otherSpace=await space();
  await test('archive: author cannot edit and content stays intact',async()=>{const m=await message(),before=await snapshot(m.id);denied(await call(author,'PATCH',`/messages/${m.id}`,{text:'Правка'}));assert.deepEqual(await snapshot(m.id),before);});
  await test('archive: member and organizer cannot edit another author',async()=>{const m=await message(),before=await snapshot(m.id);for(const who of [member,host]) denied(await call(who,'PATCH',`/messages/${m.id}`,{text:'Правка'}));assert.deepEqual(await snapshot(m.id),before);});
  await test('archive: age does not permit edits',async()=>{for(const hours of [0,25]){const m=await message('text',hours),before=await snapshot(m.id);denied(await call(author,'PATCH',`/messages/${m.id}`,{text:'Правка'}));assert.deepEqual(await snapshot(m.id),before);}});
  await test('archive: member cannot delete another author',async()=>{const m=await message(),before=await snapshot(m.id);denied(await call(member,'DELETE',`/messages/${m.id}`));assert.deepEqual(await snapshot(m.id),before);});
  await test('archive: organizer cannot delete or generate deletion notification',async()=>{
    const m=await message(),before=await snapshot(m.id);const count=()=>queryOne("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='space_message_deleted'",[author.id]);const notes=await count();
    denied(await call(host,'DELETE',`/messages/${m.id}`));assert.deepEqual(await snapshot(m.id),before);assert.equal((await count()).n,notes.n);
  });
  await test('archive: denied deletion preserves media, gallery and disk file',async()=>{
    const dir=path.join(process.env.MEDIA_DIR,author.id);await mkdir(dir,{recursive:true});const name=randomUUID()+'.png';await writeFile(path.join(dir,name),Buffer.alloc(600),{flag:'wx',mode:0o600});
    const m=await message('image',0,`/api/media-file/${author.id}/${name}`),before=await snapshot(m.id);denied(await call(author,'DELETE',`/messages/${m.id}`));
    const r=await call(member,'GET','/media');assert.equal(r.statusCode,200,r.body);assert.ok(r.json().items.some(x=>x.id===m.id));assert.deepEqual(await snapshot(m.id),before);await access(path.join(dir,name));
  });
  await test('archive: historical deletions stay hidden from history and quotes',async()=>{
    const m=await message(),reply=await queryOne("INSERT INTO space_messages(space_id,author_id,text,reply_to_id) VALUES($1,$2,'Старый ответ',$3) RETURNING id",[spaceId,author.id,m.id]);
    await query('UPDATE space_messages SET deleted_at=now(),deleted_by=$2 WHERE id=$1',[m.id,host.id]);const items=await history();assert.equal(items.some(x=>x.id===m.id),false);const shown=items.find(x=>x.id===reply.id);assert.ok(shown);assert.equal(shown.replyTo,undefined);
  });
  await test('archive: historical replies readable but new replies cannot insert rows',async()=>{
    const m=await message(),reply=await queryOne("INSERT INTO space_messages(space_id,author_id,text,reply_to_id) VALUES($1,$2,'Старый ответ',$3) RETURNING id",[spaceId,author.id,m.id]);const shown=(await history()).find(x=>x.id===reply.id);assert.ok(shown);assert.equal(shown.replyTo.id,m.id);
    const foreign=await queryOne("INSERT INTO space_messages(space_id,author_id,text) VALUES($1,$2,'Другой архив') RETURNING id",[otherSpace,author.id]);const count=()=>queryOne('SELECT count(*)::int AS n FROM space_messages WHERE space_id=$1',[spaceId]);const before=await count();
    for(const id of [m.id,foreign.id]) denied(await call(author,'POST','/messages',{text:'Новый ответ',replyToId:id}));assert.equal((await count()).n,before.n);
  });
  await test('archive: guests and outsiders cannot read or mutate',async()=>{
    const m=await message(),before=await snapshot(m.id);for(const who of [null,outsider]){const status=who?403:401;for(const suffix of ['/messages','/media']) assert.equal((await call(who,'GET',suffix)).statusCode,status);assert.equal((await call(who,'POST','/messages',{text:'Запись'})).statusCode,status);assert.equal((await call(who,'PATCH',`/messages/${m.id}`,{text:'Правка'})).statusCode,status);assert.equal((await call(who,'DELETE',`/messages/${m.id}`)).statusCode,status);}assert.deepEqual(await snapshot(m.id),before);
  });
  await test('only organizer changes cover',async()=>{assert.equal((await call(author,'PATCH','/cover',{coverUrl:'/assets/test.png'})).statusCode,403);const r=await call(host,'PATCH','/cover',{coverUrl:'/assets/test.png'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().coverUrl,'/assets/test.png');assert.equal((await queryOne('SELECT cover_url FROM spaces WHERE id=$1',[spaceId])).cover_url,'/assets/test.png');});
} finally {try {await app.close();} finally {await pool.end();}}
