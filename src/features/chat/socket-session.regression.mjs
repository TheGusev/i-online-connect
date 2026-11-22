import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSessionScope, subscribeSessionChanges } from '../../api/session-scope.mjs';
import { createSocketLease } from '../../api/socket-lease.mjs';
function setup(refresh = async()=>({kind:'ok',token:'A2'})) {
  let token='A', disposed=0, subscribers=0;
  const scope=createSessionScope({readToken:()=>token,writeToken:t=>{token=t;},refresh,onInvalid:()=>{}});
  const lease=createSocketLease({getRevision:()=>scope.capture().revision,isCurrent:scope.isCurrent,subscribe:fn=>{subscribers++;const off=subscribeSessionChanges(scope.getToken,fn);return()=>{subscribers--;off();};},onDispose:()=>disposed++});
  return {scope,lease,disposed:()=>disposed,subscribers:()=>subscribers,external:t=>{token=t;}};
}
test('socket: logout disposes synchronously',()=>{const s=setup();s.scope.setToken(null);assert.equal(s.disposed(),1);assert.equal(s.lease.isActive(),false);assert.equal(s.subscribers(),0);});
test('socket: A to B blocks saved callbacks immediately',()=>{const s=setup();let received=0;const frame=s.lease.guard(()=>received++);frame();s.scope.setToken('B');frame();assert.equal(received,1);assert.equal(s.disposed(),1);});
test('socket: explicit disposal is idempotent',()=>{const s=setup();s.lease.dispose();s.lease.dispose();s.scope.setToken('B');assert.equal(s.disposed(),1);assert.equal(s.subscribers(),0);});
test('socket: normal token rotation retains transport',async()=>{const s=setup();await s.scope.refreshAccessToken();assert.equal(s.scope.getToken(),'A2');assert.equal(s.lease.isActive(),true);assert.equal(s.disposed(),0);s.lease.dispose();});
test('socket: external storage change is detected on first observation',()=>{const s=setup();s.external('B');assert.equal(s.lease.isActive(),false);assert.equal(s.disposed(),1);});
test('socket: new B lease survives cleanup of A lease',()=>{const s=setup();s.scope.setToken('B');let closedB=0;const b=createSocketLease({getRevision:()=>s.scope.capture().revision,isCurrent:s.scope.isCurrent,subscribe:fn=>subscribeSessionChanges(s.scope.getToken,fn),onDispose:()=>closedB++});s.lease.dispose();assert.equal(b.isActive(),true);assert.equal(closedB,0);b.dispose();});
test('socket: independent session scopes do not invalidate each other',()=>{const a=setup(),b=setup();a.scope.setToken(null);assert.equal(b.lease.isActive(),true);assert.equal(b.disposed(),0);b.lease.dispose();});
test('socket: saved reconnect and outgoing callbacks cannot act after logout',()=>{const s=setup();let calls=0;const reconnect=s.lease.guard(()=>calls++),send=s.lease.guard(()=>calls++);s.scope.setToken(null);reconnect();send();assert.equal(calls,0);});
test('socket: same token installation is still a new session boundary',()=>{const s=setup();s.scope.setToken('A');assert.equal(s.disposed(),1);});
test('socket: unknown token reader fails closed',()=>{assert.throws(()=>subscribeSessionChanges(()=>null,()=>{}),/Unknown/);});
test('socket: listener failure does not prevent other disposals',()=>{const s=setup();const original=console.error;let logged=0;console.error=()=>logged++;const off=subscribeSessionChanges(s.scope.getToken,()=>{throw new Error('synthetic');});try{s.scope.setToken(null);assert.equal(s.disposed(),1);assert.equal(logged,1);}finally{off();console.error=original;}});

test('socket: reentrant subscriber cannot leave capture with an obsolete token',()=>{const s=setup();let once=false;const off=subscribeSessionChanges(s.scope.getToken,()=>{if(!once){once=true;s.scope.setToken('C');}});try{s.external('B');assert.equal(s.scope.capture().token,'C');assert.equal(s.scope.getToken(),'C');}finally{off();s.lease.dispose();}});

test('socket: current invalid refresh disposes transport',async()=>{const s=setup(async()=>({kind:'invalid'}));assert.equal((await s.scope.refreshAccessToken()).kind,'invalid');assert.equal(s.disposed(),1);assert.equal(s.scope.getToken(),null);});
test('socket: stale invalid refresh cannot dispose B transport',async()=>{let resolve;const pending=new Promise(r=>{resolve=r;});const s=setup(()=>pending);const old=s.scope.refreshAccessToken();await new Promise(r=>setImmediate(r));s.scope.setToken('B');let closed=0;const b=createSocketLease({getRevision:()=>s.scope.capture().revision,isCurrent:s.scope.isCurrent,subscribe:fn=>subscribeSessionChanges(s.scope.getToken,fn),onDispose:()=>closed++});try{resolve({kind:'invalid'});assert.equal((await old).kind,'stale');assert.equal(b.isActive(),true);assert.equal(s.scope.getToken(),'B');assert.equal(closed,0);}finally{b.dispose();}});

test('integration: actual chat hook blocks old callbacks and closes connecting sockets',async()=>{
  const {default:ts}=await import('typescript');
  const key='__socket_session_audit_'+Date.now();
  const h={scope:null,store:{user:{id:'A'},status:'authed'},states:[],refs:[],effects:[],sockets:[],frames:[]};
  let token='A';h.scope=createSessionScope({readToken:()=>token,writeToken:t=>{token=t;},refresh:async()=>({kind:'ok',token:'A2'}),onInvalid:()=>{}});
  globalThis[key]=h;
  const uri=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  const prefix=`const h=globalThis[${JSON.stringify(key)}];`;
  const react=uri(prefix+`export const useCallback=f=>f;export const useRef=v=>{const r={current:v};h.refs.push(r);return r;};export const useState=v=>{const a=h.states,i=a.length;a.push(v);return[v,x=>{a[i]=typeof x==='function'?x(a[i]):x;}];};export const useEffect=f=>{h.effects.push(f);};`);
  const api=uri(prefix+`export const API_URL='https://audit.invalid/api',WS_URL='wss://audit.invalid/ws',RESUME_EVENT='ya-online:resume';export const getToken=h.scope.getToken;export const getSessionRevision=()=>h.scope.capture().revision;export const isSessionCurrent=h.scope.isCurrent;`);
  const store=uri(prefix+`export const useSessionStore=selector=>selector(h.store);`);
  const source=await readFile(new URL('./useChatSocket.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/(["'])react\1/g,JSON.stringify(react)).replace(/(["'])@\/api(?:\/client)?\1/g,JSON.stringify(api))
    .replace(/(["'])@\/api\/session-scope\.mjs\1/g,JSON.stringify(new URL('../../api/session-scope.mjs',import.meta.url).href))
    .replace(/(["'])@\/api\/socket-lease\.mjs\1/g,JSON.stringify(new URL('../../api/socket-lease.mjs',import.meta.url).href))
    .replace(/(["'])@\/store\/useSessionStore\1/g,JSON.stringify(store));
  const keys=['window','document','WebSocket'],original=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  class WS {static CONNECTING=0;static OPEN=1;static CLOSED=3;readyState=0;sent=[];constructor(url){this.url=url;h.sockets.push(this);}close(){this.readyState=3;this.closed=true;}send(data){this.sent.push(data);}}
  const windowTarget=new EventTarget();windowTarget.location={origin:'https://audit.invalid'};
  const documentTarget=new EventTarget();documentTarget.visibilityState='visible';
  Object.defineProperty(globalThis,'window',{configurable:true,value:windowTarget});Object.defineProperty(globalThis,'document',{configurable:true,value:documentTarget});Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:WS});
  let cleanupA,cleanupB;
  try {
    const {useChatSocket}=await import(uri(compiled));
    const a=useChatSocket({conversationId:'room-a',onEvent:e=>h.frames.push(e)});cleanupA=h.effects[0]();const first=h.sockets[0];first.readyState=1;first.onopen({});const lateFrame=first.onmessage,lateClose=first.onclose,lateOpen=first.onopen;
    first.onmessage({data:JSON.stringify({type:'typing',conversationId:'room-a',mode:'voice'})});assert.equal(h.states[1],true);assert.equal(h.states[2],true);a.sendTyping();assert.equal(first.sent.length,1);
    await h.scope.refreshAccessToken();assert.equal(first.closed,undefined);
    h.scope.setToken('B');assert.equal(first.closed,true);assert.equal(h.states[1],false);assert.equal(h.states[2],false);const count=h.frames.length;lateFrame({data:JSON.stringify({type:'message',conversationId:'room-a'})});lateClose({code:1006});lateOpen({});a.sendTyping();windowTarget.dispatchEvent(new Event('online'));assert.equal(h.frames.length,count);assert.equal(h.sockets.length,1);assert.equal(first.sent.length,1);
    h.states=[];h.refs=[];h.effects=[];h.store={user:{id:'B'},status:'authed'};useChatSocket({conversationId:'room-b',onEvent:e=>h.frames.push(e)});cleanupB=h.effects[0]();const second=h.sockets[1];assert.match(second.url,/token=B/);cleanupA();assert.equal(second.closed,undefined);h.scope.setToken(null);assert.equal(second.closed,true);
  } finally {
    cleanupA?.();cleanupB?.();for(const k of keys){const d=original.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}delete globalThis[key];
  }
});
