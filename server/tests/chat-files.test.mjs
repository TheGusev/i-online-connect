import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://lovable@127.0.0.1:5546/chat_test';
process.env.JWT_ACCESS_SECRET ||= randomUUID()+randomUUID(); process.env.JWT_REFRESH_SECRET ||= randomUUID()+randomUUID();
const root = await mkdtemp(path.join(os.tmpdir(),'chat-files-')); process.env.MEDIA_DIR = path.join(root,'public');
const { query, queryOne, pool } = await import('../src/db.ts');
const { validateDocument, cleanFileName, readDocument, MAX_FILE_BYTES } = await import('../src/media/documents.ts');
const { signAccessToken } = await import('../src/auth/tokens.ts');
const { chatRoutes } = await import('../src/routes/chat.ts'); const { spaceRoutes } = await import('../src/routes/spaces.ts');
const { registerErrorHandler } = await import('../src/http.ts');
const Fastify = (await import('fastify')).default; const app=Fastify(); registerErrorHandler(app);
await app.register((await import('@fastify/multipart')).default);
await app.register(chatRoutes,{prefix:'/api/chat'}); await app.register(spaceRoutes,{prefix:'/api/spaces'});
const ids=[];
async function user(verified) { const id=randomUUID();ids.push(id);await query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[id,`${id}@test.local`,'test']);await query("INSERT INTO profiles(user_id,name,city,age) VALUES($1,'Тест','Город',25)",[id]);if(verified)await query("INSERT INTO verifications(user_id,status,selfie_path,reference_url) VALUES($1,'verified','test','test')",[id]);return {id,token:await signAccessToken(id)}; }
const me=await user(true),peer=await user(true), outsider=await user(true), unverified=await user(false);
const conv=await queryOne('INSERT INTO conversations DEFAULT VALUES RETURNING id');await query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3),($1,$4)',[conv.id,me.id,peer.id,unverified.id]);
const space=await queryOne("INSERT INTO spaces(title,host_id,category) VALUES('Файлы',$1,'city') RETURNING id",[me.id]);await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member'),($1,$4,'member')",[space.id,me.id,peer.id,unverified.id]);
const scopes=[{url:`/api/chat/conversations/${conv.id}`,table:'messages'},{url:`/api/spaces/${space.id}`,table:'space_messages'}];
const auth=who=>({authorization:`Bearer ${who.token}`});
function payload(name,buffer,temp=randomUUID()) {const boundary='boundary'+randomUUID();return {headers:{'content-type':`multipart/form-data; boundary=${boundary}`},buffer:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="clientTempId"\r\n\r\n${temp}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),buffer,Buffer.from(`\r\n--${boundary}--\r\n`)])};}
const send=(scope,who,name,buffer,temp)=>{const form=payload(name,buffer,temp);return app.inject({method:'POST',url:scope.url+'/files',headers:{...auth(who),...form.headers},payload:form.buffer});};
const get=(url,who)=>app.inject({method:'GET',url,headers:auth(who)});
try {
 await test('extension and signature, including disguised scripts',()=>{
  for(const name of ['bad.exe','bad.bat','bad.cmd','bad.sh','bad.js','bad.html','bad.svg','bad.apk','bad.msi']) assert.throws(()=>validateDocument(Buffer.from('hello'),name));
  for(const name of ['fake.pdf','fake.png','fake.docx','fake.zip'])assert.throws(()=>validateDocument(Buffer.from('MZ executable'),name));
  assert.throws(()=>validateDocument(Buffer.from('#!/bin/sh\necho bad'),'fake.txt'));
  assert.throws(()=>validateDocument(Buffer.from('<html>bad</html>'),'fake.txt'));
  assert.equal(cleanFileName('../folder/\u0000Отчёт.csv'),'Отчёт.csv');assert.equal(cleanFileName('a'.repeat(200)+'.pdf').length,120);
 });
 await test('25 MB boundary',()=>{assert.equal(MAX_FILE_BYTES,26214400);assert.equal(validateDocument(Buffer.alloc(MAX_FILE_BYTES,65),'valid.txt').fileSize,MAX_FILE_BYTES);assert.throws(()=>validateDocument(Buffer.alloc(MAX_FILE_BYTES+1),'large.txt'));});
 for(const scope of scopes) {
  await test(`${scope.table}: authorization and size rejected before save`,async()=>{
   assert.equal((await send(scope,outsider,'a.txt',Buffer.from('hello'))).statusCode,403);
   assert.equal((await send(scope,unverified,'a.txt',Buffer.from('hello'))).statusCode,403);
   assert.equal((await send(scope,me,'a.exe',Buffer.from('hello'))).statusCode,400);
   assert.equal((await send(scope,me,'fake.pdf',Buffer.from('hello'))).statusCode,400);
   assert.ok([400,413].includes((await send(scope,me,'large.txt',Buffer.alloc(MAX_FILE_BYTES+1,65))).statusCode));
  });
  await test(`${scope.table}: upload, headers, private reads, delete disk file`,async()=>{
   const temp=randomUUID();const response=await send(scope,me,'Отчёт.txt',Buffer.from('Тестовый документ'),temp);assert.equal(response.statusCode,200,response.body);const msg=response.json();assert.equal(msg.kind,'file');assert.equal(msg.fileName,'Отчёт.txt');assert.equal(msg.fileSize,Buffer.byteLength('Тестовый документ'));
   assert.equal((await send(scope,me,'Отчёт.txt',Buffer.from('Тестовый документ'),temp)).json().id,msg.id);
   const data=await get(msg.mediaUrl,peer);assert.equal(data.statusCode,200);assert.match(data.headers['content-disposition'],/^attachment;/);assert.equal(data.headers['x-content-type-options'],'nosniff');assert.match(data.headers['content-type'],/^text\/plain/);assert.equal(data.headers['cache-control'],'private, no-store');
   assert.equal((await get(msg.mediaUrl,outsider)).statusCode,403);
   const row=await queryOne(`SELECT media_url FROM ${scope.table} WHERE id=$1`,[msg.id]);assert.ok((await readDocument(row.media_url)).length);
   const listed=await get(scope.url+'/messages',peer);const items=scope.table==='messages'?listed.json().items:listed.json();assert.equal(items.find(x=>x.id===msg.id).fileName,'Отчёт.txt');
   const del=await app.inject({method:'DELETE',url:scope.url+'/messages/'+msg.id,headers:auth(me)});assert.equal(del.statusCode,200);assert.equal((await get(msg.mediaUrl,peer)).statusCode,404);await assert.rejects(()=>readDocument(row.media_url),e=>e.code==='ENOENT');
   assert.ok((await queryOne(`SELECT deleted_at FROM ${scope.table} WHERE id=$1`,[msg.id])).deleted_at);
  });
  await test(`${scope.table}: PDF inline but explicit download attachment`,async()=>{
   const response=await send(scope,me,'a.pdf',Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'));assert.equal(response.statusCode,200,response.body);
   const url=response.json().mediaUrl; assert.match((await get(url,peer)).headers['content-disposition'],/^inline;/);assert.match((await get(url+'?download=1',peer)).headers['content-disposition'],/^attachment;/);
   await app.inject({method:'DELETE',url:scope.url+'/messages/'+response.json().id,headers:auth(me)});
  });
 }
} finally {await app.close();await query('DELETE FROM spaces WHERE id=$1',[space.id]);await query('DELETE FROM conversations WHERE id=$1',[conv.id]);await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();await rm(root,{recursive:true,force:true});}