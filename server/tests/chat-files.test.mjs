import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp,rm,readdir,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertArchiveTestDatabase } from '../scripts/isolated-archive-test.mjs';
await assertArchiveTestDatabase();
process.env.JWT_ACCESS_SECRET ||= randomUUID()+randomUUID();
process.env.JWT_REFRESH_SECRET ||= randomUUID()+randomUUID();
const root=await mkdtemp(path.join(os.tmpdir(),'chat-files-'));
process.env.MEDIA_DIR=path.join(root,'public');
const {query,queryOne,pool}=await import('../src/db.ts');
const {validateDocument,cleanFileName,readDocument,saveDocument,MAX_FILE_BYTES}=await import('../src/media/documents.ts');
const {signAccessToken}=await import('../src/auth/tokens.ts');
const {chatRoutes}=await import('../src/routes/chat.ts');
const {spaceRoutes}=await import('../src/routes/spaces.ts');
const {registerErrorHandler}=await import('../src/http.ts');
const app=(await import('fastify')).default(); registerErrorHandler(app);
await app.register((await import('@fastify/multipart')).default);
await app.register(chatRoutes,{prefix:'/api/chat'}); await app.register(spaceRoutes,{prefix:'/api/spaces'});
async function user(verified) {
  const id=randomUUID(); await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",[id,`${id}@test.invalid`]);
  await query("INSERT INTO profiles(user_id,name,city,age) VALUES($1,'Тест','Город',25)",[id]);
  if(verified) await query("INSERT INTO verifications(user_id,status,selfie_path,reference_url) VALUES($1,'verified','test','test')",[id]);
  return {id,token:await signAccessToken(id)};
}
let me,peer,outsider,unverified,personal,archive,spaceId;
const auth=who=>who?{authorization:`Bearer ${who.token}`} : {};
function send(scope,who,name,bytes,temp=randomUUID()) {
  const b='boundary'+randomUUID();
  const payload=Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="clientTempId"\r\n\r\n${temp}\r\n--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),bytes,Buffer.from(`\r\n--${b}--\r\n`)]);
  return app.inject({method:'POST',url:scope+'/files',headers:{...auth(who),'content-type':`multipart/form-data; boundary=${b}`},payload});
}
const get=(url,who)=>app.inject({method:'GET',url,headers:auth(who)});
const del=(scope,id)=>app.inject({method:'DELETE',url:scope+'/messages/'+id,headers:auth(me)});
function denied(r) { assert.equal(r.statusCode,403,r.body); assert.equal(r.json().message,'Архив общего обсуждения доступен только для чтения'); }
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
async function historical(name,bytes) {
  const type=validateDocument(bytes,name),key=await saveDocument(bytes,type.ext);
  const row=await queryOne("INSERT INTO space_messages(space_id,author_id,text,kind,media_url,media_mime,file_name,file_size) VALUES($1,$2,'','file',$3,$4,$5,$6) RETURNING id",[spaceId,me.id,key,type.mime,type.fileName,type.fileSize]);
  return {id:row.id,key,url:archive+'/files/'+row.id};
}
try {
  me=await user(true);peer=await user(true);outsider=await user(true);unverified=await user(false);
  const conv=await queryOne('INSERT INTO conversations DEFAULT VALUES RETURNING id');
  await query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3),($1,$4)',[conv.id,me.id,peer.id,unverified.id]);
  const sp=await queryOne("INSERT INTO spaces(title,host_id,category) VALUES('Файлы',$1,'city') RETURNING id",[me.id]);spaceId=sp.id;
  await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member'),($1,$4,'member')",[spaceId,me.id,peer.id,unverified.id]);
  personal=`/api/chat/conversations/${conv.id}`; archive=`/api/spaces/${spaceId}`;
  await test('extension and signature, including disguised scripts',()=>{
    for(const n of ['bad.exe','bad.bat','bad.cmd','bad.sh','bad.js','bad.html','bad.svg','bad.apk','bad.msi']) assert.throws(()=>validateDocument(Buffer.from('hello'),n));
    for(const n of ['fake.pdf','fake.png','fake.docx','fake.zip']) assert.throws(()=>validateDocument(Buffer.from('MZ executable'),n));
    for(const s of ['#!/bin/sh\necho bad','<html>bad</html>']) assert.throws(()=>validateDocument(Buffer.from(s),'fake.txt'));
    assert.equal(cleanFileName('../folder/\u0000Отчёт.csv'),'Отчёт.csv');assert.equal(cleanFileName('a'.repeat(200)+'.pdf').length,120);
  });
  await test('25 MB boundary',()=>{assert.equal(MAX_FILE_BYTES,26214400);assert.equal(validateDocument(Buffer.alloc(MAX_FILE_BYTES,65),'valid.txt').fileSize,MAX_FILE_BYTES);assert.throws(()=>validateDocument(Buffer.alloc(MAX_FILE_BYTES+1),'large.txt'));});
  await test('OOXML must contain matching main part, ZIP must be structured',async()=>{
    const {execFileSync}=await import('node:child_process');
    execFileSync('python3',['-c',`import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>')
 z.writestr('word/document.xml','<document/>')`,path.join(root,'valid.docx')]);
    const bytes=await readFile(path.join(root,'valid.docx'));
    assert.equal(validateDocument(bytes,'valid.docx').mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.throws(()=>validateDocument(bytes,'fake.xlsx'));assert.equal(validateDocument(bytes,'archive.zip').mime,'application/zip');
  });
  await test('messages: authorization and size rejected before save',async()=>{
    assert.equal((await send(personal,null,'a.txt',Buffer.from('hello'))).statusCode,401);
    for(const who of [outsider,unverified]) assert.equal((await send(personal,who,'a.txt',Buffer.from('hello'))).statusCode,403);
    for(const n of ['a.exe','fake.pdf']) assert.equal((await send(personal,me,n,Buffer.from('hello'))).statusCode,400);
    assert.ok([400,413].includes((await send(personal,me,'large.txt',Buffer.alloc(MAX_FILE_BYTES+1,65))).statusCode));
  });
  await test('messages: upload, headers, private reads, delete disk file',async()=>{
    const bytes=Buffer.from('Тестовый документ'),temp=randomUUID(),r=await send(personal,me,'Отчёт.txt',bytes,temp);
    assert.equal(r.statusCode,200,r.body);const m=r.json();assert.equal(m.kind,'file');assert.equal(m.fileName,'Отчёт.txt');assert.equal(m.fileSize,bytes.length);
    const retry=await send(personal,me,'Отчёт.txt',bytes,temp);assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().id,m.id);
    const data=await get(m.mediaUrl,peer);assert.equal(data.statusCode,200,data.body);assert.deepEqual(data.rawPayload,bytes);
    assert.match(data.headers['content-disposition'],/^attachment;/);assert.equal(data.headers['x-content-type-options'],'nosniff');assert.match(data.headers['content-type'],/^text\/plain/);assert.equal(data.headers['cache-control'],'private, no-store');
    assert.equal((await get(m.mediaUrl,outsider)).statusCode,403);assert.equal((await get(m.mediaUrl,null)).statusCode,401);
    const row=await queryOne('SELECT media_url FROM messages WHERE id=$1',[m.id]);assert.deepEqual(await readDocument(row.media_url),bytes);
    const list=await get(personal+'/messages',peer);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().items.find(x=>x.id===m.id).fileName,'Отчёт.txt');
    assert.equal((await del(personal,m.id)).statusCode,200);assert.equal((await get(m.mediaUrl,peer)).statusCode,404);await assert.rejects(()=>readDocument(row.media_url),e=>e.code==='ENOENT');
    assert.ok((await queryOne('SELECT deleted_at FROM messages WHERE id=$1',[m.id])).deleted_at);
  });
  await test('messages: PDF inline but explicit download attachment',async()=>{
    const r=await send(personal,me,'a.pdf',pdf);assert.equal(r.statusCode,200,r.body);const m=r.json();
    for(const [suffix,mode] of [['',/^inline;/],['?download=1',/^attachment;/]]) {const d=await get(m.mediaUrl+suffix,peer);assert.equal(d.statusCode,200,d.body);assert.match(d.headers['content-disposition'],mode);}
    assert.equal((await del(personal,m.id)).statusCode,200);
  });
  await test('space archive: uploads denied before validation without rows or files',async()=>{
    const count=()=>queryOne('SELECT count(*)::int AS n FROM space_messages WHERE space_id=$1',[spaceId]);
    const disk=()=>readdir(path.resolve(process.env.MEDIA_DIR)+'-documents').then(x=>x.sort());
    const before=await count(),names=await disk();
    assert.equal((await send(archive,null,'a.txt',Buffer.from('hello'))).statusCode,401);
    assert.equal((await send(archive,outsider,'a.txt',Buffer.from('hello'))).statusCode,403);
    for(const who of [me,peer,unverified]) denied(await send(archive,who,'a.txt',Buffer.from('hello')));
    for(const name of ['a.exe','fake.pdf']) denied(await send(archive,me,name,Buffer.from('hello')));
    const large=await send(archive,me,'large.txt',Buffer.alloc(MAX_FILE_BYTES+1,65));assert.ok([403,413].includes(large.statusCode),large.body);if(large.statusCode===403) denied(large);
    assert.equal((await count()).n,before.n);assert.deepEqual(await disk(),names);
  });
  await test('space archive: historical documents stay private and denied delete preserves bytes',async()=>{
    const bytes=Buffer.from('Исторический документ'),m=await historical('Отчёт.txt',bytes);
    const d=await get(m.url,peer);assert.equal(d.statusCode,200,d.body);assert.deepEqual(d.rawPayload,bytes);
    assert.match(d.headers['content-disposition'],/^attachment;/);assert.match(d.headers['content-type'],/^text\/plain/);assert.equal(d.headers['x-content-type-options'],'nosniff');assert.equal(d.headers['cache-control'],'private, no-store');
    assert.equal((await get(m.url,null)).statusCode,401);assert.equal((await get(m.url,outsider)).statusCode,403);
    const list=await get(archive+'/messages',peer);assert.equal(list.statusCode,200,list.body);assert.equal(list.json().find(x=>x.id===m.id).fileName,'Отчёт.txt');
    denied(await del(archive,m.id));assert.equal((await get(m.url,peer)).statusCode,200);assert.deepEqual(await readDocument(m.key),bytes);
    assert.equal((await queryOne('SELECT deleted_at FROM space_messages WHERE id=$1',[m.id])).deleted_at,null);
    await query('DELETE FROM space_members WHERE space_id=$1 AND user_id=$2',[spaceId,peer.id]);
    try {assert.equal((await get(m.url,peer)).statusCode,403);} finally {await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'member')",[spaceId,peer.id]);}
    await query('UPDATE space_messages SET deleted_at=now() WHERE id=$1',[m.id]);
    assert.equal((await get(m.url,peer)).statusCode,404);assert.deepEqual(await readDocument(m.key),bytes);
  });
  await test('space archive: historical PDF inline and explicit download remain protected',async()=>{
    const m=await historical('a.pdf',pdf);
    for(const [suffix,mode] of [['',/^inline;/],['?download=1',/^attachment;/]]) {
      const d=await get(m.url+suffix,peer);assert.equal(d.statusCode,200,d.body);assert.deepEqual(d.rawPayload,pdf);assert.match(d.headers['content-disposition'],mode);
      assert.equal(d.headers['cache-control'],'private, no-store');assert.equal(d.headers['x-content-type-options'],'nosniff');assert.equal((await get(m.url+suffix,outsider)).statusCode,403);
    }
    denied(await del(archive,m.id));assert.deepEqual(await readDocument(m.key),pdf);
  });
} finally { try {await app.close();} finally {try {await pool.end();} finally {await rm(root,{recursive:true,force:true});}} }
