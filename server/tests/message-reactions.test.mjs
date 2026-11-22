import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { assertArchiveTestDatabase } from '../scripts/isolated-archive-test.mjs';
await assertArchiveTestDatabase();
process.env.JWT_ACCESS_SECRET ||= randomUUID()+randomUUID();process.env.JWT_REFRESH_SECRET ||= randomUUID()+randomUUID();
const {pool,query,queryOne}=await import('../src/db.ts');
const {signAccessToken}=await import('../src/auth/tokens.ts');
const {chatRoutes}=await import('../src/routes/chat.ts');const {spaceRoutes}=await import('../src/routes/spaces.ts');
const {registerErrorHandler}=await import('../src/http.ts');const {planReaction}=await import('../src/chat/reactions.ts');
const app=(await import('fastify')).default();registerErrorHandler(app);
await app.register((await import('@fastify/multipart')).default);await app.register(chatRoutes,{prefix:'/api/chat'});await app.register(spaceRoutes,{prefix:'/api/spaces'});
async function user(){const id=randomUUID();await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",[id,`${id}@test.invalid`]);await query("INSERT INTO profiles(user_id,name,city) VALUES($1,'Тест','Город')",[id]);return {id,token:await signAccessToken(id)};}
const auth=who=>who?{authorization:`Bearer ${who.token}`} : {};
let me,peer,outsider,chatUrl,spaceUrl,historyUrl,smsg;
const mutate=(url,who,method,emoji)=>app.inject({method,url,headers:auth(who),payload:{emoji}});
async function list(who){const r=await app.inject({method:'GET',url:chatUrl.replace(/\/messages\/.*/, '/messages'),headers:auth(who)});assert.equal(r.statusCode,200,r.body);return r.json().items[0].reactions;}
try {
  me=await user();peer=await user();outsider=await user();
  const c=await queryOne('INSERT INTO conversations DEFAULT VALUES RETURNING id');await query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)',[c.id,me.id,peer.id]);
  const m=await queryOne("INSERT INTO messages(conversation_id,author_id,text) VALUES($1,$2,'Привет') RETURNING id",[c.id,peer.id]);chatUrl=`/api/chat/conversations/${c.id}/messages/${m.id}/reactions`;
  const sp=await queryOne("INSERT INTO spaces(title,host_id,category) VALUES('Реакции',$1,'city') RETURNING id",[me.id]);await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,'host'),($1,$3,'member')",[sp.id,me.id,peer.id]);
  smsg=await queryOne("INSERT INTO space_messages(space_id,author_id,text) VALUES($1,$2,'История') RETURNING id",[sp.id,peer.id]);historyUrl=`/api/spaces/${sp.id}/messages`;spaceUrl=`${historyUrl}/${smsg.id}/reactions`;
  await test('reaction limit: replacement and REACTION_LIMIT',()=>{assert.deepEqual(planReaction(['👍'],'🔥',1),{remove:['👍'],add:true});assert.throws(()=>planReaction(['👍','🔥','😂'],'😮',3),e=>e.code==='REACTION_LIMIT'&&e.statusCode===400);});
  await test('personal reactions: add, replace, remove',async()=>{
    assert.equal((await mutate(chatUrl,me,'PUT','👍')).statusCode,200);assert.deepEqual(await list(me),[{emoji:'👍',count:1,mine:true}]);
    const r=await mutate(chatUrl,me,'PUT','🔥');assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().reactions,[{emoji:'🔥',count:1,mine:true}]);
    assert.equal((await mutate(chatUrl,me,'DELETE','🔥')).statusCode,200);assert.deepEqual(await list(me),[]);
  });
  await test('personal reactions: peer count and ownership',async()=>{
    for(const who of [peer,me]) assert.equal((await mutate(chatUrl,who,'PUT','❤️')).statusCode,200);
    assert.deepEqual(await list(peer),[{emoji:'❤️',count:2,mine:true}]);assert.equal((await mutate(chatUrl,me,'DELETE','❤️')).statusCode,200);assert.deepEqual(await list(me),[{emoji:'❤️',count:1,mine:false}]);
  });
  await test('outsider forbidden and invalid personal emoji rejected',async()=>{
    for(const url of [chatUrl,spaceUrl]) assert.equal((await mutate(url,outsider,'PUT','👍')).statusCode,403);
    assert.equal((await mutate(chatUrl,me,'PUT','🦄')).statusCode,400);
  });
  await test('archive reactions: historical summary stays readable and all mutations denied',async()=>{
    await query("INSERT INTO space_message_reactions(message_id,user_id,emoji) VALUES($1,$2,'👍'),($1,$3,'👍')",[smsg.id,me.id,peer.id]);
    const rows=()=>query('SELECT user_id,emoji,created_at FROM space_message_reactions WHERE message_id=$1 ORDER BY user_id,emoji',[smsg.id]);const before=await rows();
    for(const who of [me,peer]) for(const method of ['PUT','DELETE']) {
      const r=await mutate(spaceUrl,who,method,method==='PUT'?'😂':'👍');assert.equal(r.statusCode,403,r.body);assert.equal(r.json().message,'Архив общего обсуждения доступен только для чтения');
    }
    assert.deepEqual(await rows(),before);
    for(const who of [me,peer]) {const r=await app.inject({method:'GET',url:historyUrl,headers:auth(who)});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().find(x=>x.id===smsg.id).reactions,[{emoji:'👍',count:2,mine:true}]);}
    assert.equal((await app.inject({method:'GET',url:historyUrl,headers:auth(outsider)})).statusCode,403);
    assert.equal((await mutate(spaceUrl,null,'PUT','👍')).statusCode,401);
  });
} finally {try {await app.close();} finally {await pool.end();}}
