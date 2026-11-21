import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLogoutController } from '../../api/logout-controller.mjs';
import { cleanupLogoutState } from './logout-cleanup.mjs';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(timeoutMs=1000){let token='A';const pending=[];const controller=createLogoutController({getToken:()=>token,setToken:value=>{token=value;},timeoutMs,revoke:(access,signal)=>{const d=deferred();pending.push({...d,access,signal});return d.promise;}});return {controller,pending,get:()=>token,set:value=>{token=value;}};}
test('logout: clears immediately and late success preserves B',async()=>{const s=setup();const p=s.controller.logout();assert.equal(s.get(),null);await tick();assert.equal(s.pending[0].access,'A');s.set('B');s.pending[0].resolve();await p;assert.equal(s.get(),'B');});
test('logout: late failure preserves B and remains observable',async()=>{const s=setup();const p=s.controller.logout(),check=assert.rejects(p,/offline/);await tick();s.set('B');s.pending[0].reject(new Error('offline'));await check;assert.equal(s.get(),'B');await s.controller.waitForLogout();});
test('logout: concurrent calls share one revoke',async()=>{const s=setup();const a=s.controller.logout(),b=s.controller.logout();assert.strictEqual(a,b);await tick();assert.equal(s.pending.length,1);s.pending[0].resolve();await a;});
test('logout: next auth waits for the current revoke',async()=>{const s=setup();const p=s.controller.logout();let entered=false;const wait=s.controller.waitForLogout().then(()=>{entered=true;});await tick();assert.equal(entered,false);s.pending[0].resolve();await Promise.all([p,wait]);assert.equal(entered,true);});
test('logout: timeout aborts and releases a non-cooperative revoke',async()=>{const s=setup(10);const p=s.controller.logout(),check=assert.rejects(p,e=>e.code==='LOGOUT_TIMEOUT');await check;assert.equal(s.get(),null);assert.equal(s.pending[0].signal.aborted,true);await s.controller.waitForLogout();s.set('B');s.pending[0].resolve();await tick();assert.equal(s.get(),'B');});
test('logout: invalid timeout is rejected',()=>{assert.throws(()=>setup(0),/timeout/);});
test('logout: another logout can start after the first settles',async()=>{const s=setup();const a=s.controller.logout();await tick();s.pending[0].resolve();await a;s.set('B');const b=s.controller.logout();await tick();assert.equal(s.pending[1].access,'B');s.pending[1].resolve();await b;});
test('logout: stale cleanup does not touch the new session',async()=>{const events=[];await cleanupLogoutState({clearSession:()=>events.push('guest'),cancelQueries:async()=>events.push('cancel'),clearCache:()=>events.push('clear'),isCurrent:()=>false});assert.deepEqual(events,[]);});
test('logout: delayed cancellation cannot clear B cache',async()=>{const d=deferred();let current=true;const cache=new Map([['private','A']]);const p=cleanupLogoutState({clearSession:()=>{},cancelQueries:()=>d.promise,clearCache:()=>cache.clear(),isCurrent:()=>current});assert.equal(cache.size,0);current=false;cache.set('private','B');d.resolve();await p;assert.equal(cache.get('private'),'B');});
test('logout: cancellation rejection cannot clear B cache',async()=>{const d=deferred();let current=true;const cache=new Map([['private','A']]);const p=cleanupLogoutState({clearSession:()=>{},cancelQueries:()=>d.promise,clearCache:()=>cache.clear(),isCurrent:()=>current}),check=assert.rejects(p,/cancel/);current=false;cache.set('private','B');d.reject(new Error('cancel'));await check;assert.equal(cache.get('private'),'B');});

test('integration: actual auth API and session store respect logout boundaries',async()=>{
  const {default:ts}=await import('typescript');
  const compile=async file=>ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const uri=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  const clientCode=(await compile('../../api/client.ts')).replaceAll('import.meta.env','({VITE_API_URL:"https://audit.invalid/api"})').replace(/(["'])\.\/session-scope\.mjs\1/g,JSON.stringify(new URL('../../api/session-scope.mjs',import.meta.url).href));
  const clientURL=uri(clientCode)+'#transitions-'+Date.now();
  const authCode=(await compile('../../api/endpoints/auth.ts')).replace(/(["'])\.\.\/client\1/g,JSON.stringify(clientURL)).replace(/(["'])\.\.\/logout-controller\.mjs\1/g,JSON.stringify(new URL('../../api/logout-controller.mjs',import.meta.url).href));
  const keys=['window','fetch'],original=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));const values=new Map(),pending=[];
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{origin:'https://audit.invalid'},dispatchEvent:()=>{}}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:(url,options)=>{const d=deferred();pending.push({...d,url,options});return d.promise;}});
  try {
    const client=await import(clientURL),api=await import(uri(authCode));
    client.setToken('A');const oldLogout=api.logout();assert.equal(client.getToken(),null);await tick();assert.equal(pending[0].options.headers.Authorization,'Bearer A');client.setToken('B');pending.shift().resolve(new Response(null,{status:204}));await oldLogout;assert.equal(client.getToken(),'B');
    client.setToken('A');const logout=api.logout();const login=api.login('b@test.invalid','synthetic');await tick();assert.equal(pending.length,1);assert.match(pending[0].url,/auth\/logout$/);pending.shift().resolve(new Response(null,{status:204}));await logout;await tick();assert.equal(pending.length,1);assert.match(pending[0].url,/auth\/login$/);pending.shift().resolve(new Response(JSON.stringify({token:'B',user:{id:'B'}}),{status:200}));assert.equal((await login).token,'B');
    const rejected=api.logout(),rejectedCheck=assert.rejects(rejected,e=>e.status===401);await tick();pending.shift().resolve(new Response(JSON.stringify({message:'invalid'}),{status:401}));await rejectedCheck;assert.equal(pending.length,0);assert.equal(client.getToken(),null);
    const late=api.register('a@test.invalid','synthetic','A'),lateCheck=assert.rejects(late,{name:'AbortError'});await tick();client.setToken('B');pending.shift().resolve(new Response(JSON.stringify({token:'A',user:{id:'A'}}),{status:200}));await lateCheck;assert.equal(client.getToken(),'B');
    const storeCode=(await compile('../../store/useSessionStore.ts')).replace(/(["'])zustand\1/g,JSON.stringify(import.meta.resolve('zustand'))).replace(/(["'])@\/api\/client\1/g,JSON.stringify(clientURL));
    const {useSessionStore}=await import(uri(storeCode));useSessionStore.getState().setSession({token:'B',user:{id:'B'}});useSessionStore.getState().setSession({token:'A',user:{id:'A'}});assert.equal(useSessionStore.getState().user.id,'B');
  } finally {for(const key of keys){const d=original.get(key);if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});
