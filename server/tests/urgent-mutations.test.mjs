import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as rules from '../src/listings/urgent.ts';

// Run the actual modules with injected dependencies, not a PostgreSQL connection.
function load(relative, dependencies) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Missing test dependency: ${name}`);
    return dependencies[name];
  }, Date, Intl, console });
  return exports;
}
function jobs(db = {}, publish = () => {}) {
  return load('../src/listings/urgent-jobs.ts', {
    '../db.ts': db, '../ws/notifications.ts': { publishUserEvent: publish }, './urgent.ts': rules,
  });
}
const id = '00000000-0000-4000-8000-000000000001';
const lot = () => ({ id, author_id: 'seller', category: 'urgent', urgent_type: 'sell', state: 'active', is_seed: false,
  price_start_minor: 15000, price_floor_minor: 10000, created_at: new Date(Date.now()-60000), expires_at: new Date(Date.now()+60000) });
class HttpError extends Error {
  constructor(statusCode, message, code) { super(message); this.statusCode=statusCode; this.code=code; }
}
async function routes(client, urgent, onCommit = () => {}) {
  const handlers = new Map();
  const app = { addHook() {} };
  for (const method of ['get','post','put','patch','delete']) app[method] = (path, ...args) => handlers.set(`${method} ${path}`, args.at(-1));
  const http = { HttpError, badRequest: message => new HttpError(400,message), forbidden: () => new HttpError(403), notFound: () => new HttpError(404) };
  const module = load('../src/routes/listings.ts', {
    'zod': { z }, '../db.ts': { transaction: async fn => { const result=await fn(client); onCommit(); return result; } },
    '../http.ts': http, '../listings/photos.ts': {}, '../auth/middleware.ts': { currentUserId: request => request.userId },
    '../listings/notify.ts': {}, '../media/store.ts': {}, '../ws/notifications.ts': {},
    '../profile/completeness.ts': {}, '../listings/durations.ts': {}, '../env.ts': { env: {} },
    '../listings/urgent.ts': rules, '../listings/urgent-jobs.ts': { expireReservations: async () => {}, ...urgent },
  });
  await module.listingRoutes(app);
  return handlers;
}
const request = (userId='buyer', body={arriveInMinutes:15}) => ({ userId, params:{id}, body });

test('repeat manual and auto notifications delete only the same user/kind/lot before insert', async () => {
  for (const kind of ['urgent_reserved','urgent_auto_reserved','urgent_final_call']) {
    const calls=[];
    const client={query:async (sql,params) => {calls.push({sql,params}); return {rows:sql.startsWith('INSERT')?[{id:'notice',created_at:new Date(0)}]:[]};}};
    const notice=await jobs().insertUrgentNotification(client,'seller',kind,{listingId:id});
    assert.equal(notice.notification.kind,kind);
    assert.equal(calls.length,kind==='urgent_final_call'?1:2);
    if (kind!=='urgent_final_call') {
      assert.match(calls[0].sql,/DELETE FROM notifications WHERE user_id=\$1 AND kind=\$2 AND payload->>'listingId'=\$3/);
      assert.deepEqual(Array.from(calls[0].params),['seller',kind,id]);
      assert.match(calls[1].sql,/INSERT INTO notifications/);
    }
  }
});
test('manual reserve persists exact seller payload before commit and delivers after commit', async () => {
  let committed=false;
  const j=jobs();
  const client={query:async sql => ({rows:sql.includes('FROM listings')?[lot()]:sql.startsWith('INSERT INTO notifications')?[{id:'notice',created_at:new Date(0)}]:[],rowCount:0})};
  const reserved={reservationId:'hold',expiresAt:new Date(90000).toISOString(),priceMinor:10000,source:'manual',conversationId:'chat'};
  const handlers=await routes(client,{
    buyerAllowed:async()=>true, reserveLot:async()=>reserved,
    insertUrgentNotification:async (...args)=>{ assert.equal(committed,false); return j.insertUrgentNotification(...args); },
    deliverUrgent:notices=>{assert.equal(committed,true); assert.equal(notices[0].userId,'seller'); assert.deepEqual(JSON.parse(JSON.stringify(notices[0].notification.payload)),{listingId:id,reservationId:'hold',expiresAt:reserved.expiresAt,priceMinor:10000,source:'manual'});},
  },()=>{committed=true;});
  // Phone verification lookup is required before reservation.
  const query=client.query;
  client.query=async sql=>sql.includes('phone_verified')?{rows:[{phone_verified:true}]}:query(sql);
  const response=await handlers.get('post /:id/reserve')(request());
  assert.equal(response.reservationId,'hold');
});
test('reservation message advances conversation timestamp without marking participants read', async () => {
  const calls=[];
  const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('INSERT INTO listing_reservations')?[{id:'hold',expires_at:new Date(90000)}]:sql.includes('SELECT conversation_id')?[{conversation_id:'chat'}]:[]};}};
  await jobs().reserveLot(client,lot(),'buyer',15,'manual');
  const message=calls.findIndex(call=>call.sql.startsWith('INSERT INTO messages'));
  assert.ok(message>=0);
  assert.equal(calls[message+1].sql,'UPDATE conversations SET last_message_at = now() WHERE id = $1');
  assert.deepEqual(Array.from(calls[message+1].params),['chat']);
  assert.equal(calls.some(call=>call.sql.includes('last_read_at')),false);
});
test('only active reservation index violations become ALREADY_RESERVED', async () => {
  for (const constraint of ['listing_reservations_one_active','notifications_user_kind_listing',undefined]) {
    const original=Object.assign(new Error('duplicate'),{code:'23505',constraint});
    const handlers=await routes({query:async()=>{throw original;}},{});
    await assert.rejects(handlers.get('post /:id/reserve')(request()), error => constraint==='listing_reservations_one_active'
      ? error.statusCode===409 && error.code==='ALREADY_RESERVED' : error===original);
  }
});
test('seller completes sold after lot expiry while reservation is active', async () => {
  const expired={...lot(),expires_at:new Date(0)};
  const calls=[];
  const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('FROM listings')?[expired]:sql.includes('FROM listing_reservations')?[{id:'hold',price_minor:10000}]:[],rowCount:0};}};
  const handlers=await routes(client,{urgentEvent:async()=>{}});
  const response=await handlers.get('post /:id/complete')(request('seller',{outcome:'sold'}));
  assert.equal(response.outcome,'sold');
  assert.equal(response.finalPriceMinor,10000);
  assert.deepEqual(Array.from(calls.find(call=>call.sql.startsWith('UPDATE listings')).params),[id,'sold',10000]);
});
test('worker does not close expired lot or expire ongoing hold', async () => {
  const calls=[];
  const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('pg_try_advisory')?[{locked:true}]:sql.startsWith('SELECT * FROM listings')?[{...lot(),expires_at:new Date(0)}]:sql.startsWith('SELECT expires_at')?[{expires_at:new Date(Date.now()+60000)}]:[],rowCount:0};}};
  await jobs({transaction:async fn=>fn(client)}).runUrgentJobs();
  assert.equal(calls.some(call=>call.sql.startsWith('UPDATE listings')),false);
  const expiration=calls.filter(call=>call.sql.startsWith('UPDATE listing_reservations'));
  assert.equal(expiration.length,1);
  assert.match(expiration[0].sql,/expires_at <= now\(\)/);
});