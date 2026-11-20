import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSessionScope } from './session-scope.mjs';
function deferred() { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function setup() {
  let token=null, invalid=0;
  const pending=[];
  const scope=createSessionScope({readToken:()=>token,writeToken:value=>{token=value;},refresh:()=>{const d=deferred();pending.push(d);return d.promise;},onInvalid:()=>invalid++});
  return {scope,pending,invalid:()=>invalid,external:value=>{token=value;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for (const [name,replacement,result] of [
  ['logout',null,{kind:'ok',token:'A2'}],
  ['account change','B',{kind:'ok',token:'A2'}],
  ['old invalid refresh','B',{kind:'invalid'}],
]) test('scope: rejects stale '+name,async()=>{
  const s=setup();s.scope.setToken('A');const p=s.scope.refreshAccessToken();await tick();s.scope.setToken(replacement);s.pending[0].resolve(result);
  assert.equal((await p).kind,'stale');assert.equal(s.scope.getToken(),replacement);assert.equal(s.invalid(),0);
});
test('scope: refresh rotation retains session revision and single flight',async()=>{
  const s=setup();s.scope.setToken('A');const before=s.scope.capture();const p=s.scope.refreshAccessToken();assert.strictEqual(s.scope.refreshAccessToken(),p);await tick();assert.equal(s.pending.length,1);
  s.pending[0].resolve({kind:'ok',token:'A2'});assert.equal((await p).token,'A2');assert.equal(s.scope.capture().revision,before.revision);assert.equal(s.scope.isCurrent(before.revision),true);
});
test('scope: old finally cannot erase a newer flight',async()=>{
  const s=setup();s.scope.setToken('A');const a=s.scope.refreshAccessToken();await tick();s.scope.setToken('B');const b=s.scope.refreshAccessToken();await tick();assert.notStrictEqual(a,b);assert.equal(s.pending.length,2);
  s.pending[0].resolve({kind:'ok',token:'A2'});await a;assert.strictEqual(s.scope.refreshAccessToken(),b);s.pending[1].resolve({kind:'ok',token:'B2'});await b;assert.equal(s.scope.getToken(),'B2');
});
test('scope: temporary error preserves token',async()=>{
  const s=setup();s.scope.setToken('A');const p=s.scope.refreshAccessToken();await tick();s.pending[0].resolve({kind:'temporary'});assert.equal((await p).kind,'temporary');assert.equal(s.scope.getToken(),'A');assert.equal(s.invalid(),0);
});
test('scope: current invalid refresh clears and signals once',async()=>{
  const s=setup();s.scope.setToken('A');const p=s.scope.refreshAccessToken();await tick();s.pending[0].resolve({kind:'invalid'});assert.equal((await p).kind,'invalid');assert.equal(s.scope.getToken(),null);assert.equal(s.invalid(),1);
});
test('scope: external storage change invalidates a captured revision',()=>{
  const s=setup();s.scope.setToken('A');const before=s.scope.capture();s.external('B');assert.throws(()=>s.scope.assertCurrent(before.revision),{name:'AbortError'});
});
test('scope: no token means no refresh network call',async()=>{
  const s=setup();assert.equal((await s.scope.refreshAccessToken()).kind,'stale');assert.equal(s.pending.length,0);
});
test('scope: logout before scheduled refresh prevents the call',async()=>{
  const s=setup();s.scope.setToken('A');const p=s.scope.refreshAccessToken();s.scope.setToken(null);assert.equal((await p).kind,'stale');assert.equal(s.pending.length,0);
});
test('scope: explicit same token installation still changes revision',()=>{
  const s=setup();s.scope.setToken('A');const before=s.scope.capture();s.scope.setToken('A');assert.equal(s.scope.isCurrent(before.revision),false);
});

test('integration: actual API client rejects old requests and XHR results',async()=>{
  const {default:ts}=await import('typescript');
  const source=await readFile(new URL('./client.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replaceAll('import.meta.env','({VITE_API_URL:"https://audit.invalid/api"})')
    .replace(/(["'])\.\/session-scope\.mjs\1/g,JSON.stringify(new URL('./session-scope.mjs',import.meta.url).href));
  const keys=['window','fetch','XMLHttpRequest'];const original=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const pending=[],events=[],xhrs=[],storage=new Map();
  class XHR {
    upload={};headers={};status=0;responseText='';
    constructor(){xhrs.push(this);} open(){} setRequestHeader(k,v){this.headers[k]=v;} send(){}
  }
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{origin:'https://audit.invalid'},dispatchEvent:e=>events.push(e.type)}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>{const d=deferred();pending.push(d);return d.promise;}});
  Object.defineProperty(globalThis,'XMLHttpRequest',{configurable:true,value:XHR});
  try {
    const api=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')+'#'+Date.now());
    api.setToken('A');const refresh=api.refreshAccessToken();await tick();api.setToken('B');pending.shift().resolve(new Response(JSON.stringify({token:'A2'}),{status:200}));assert.equal((await refresh).kind,'stale');assert.equal(api.getToken(),'B');assert.equal(events.length,0);
    api.setToken('A');const old=api.request('/private',{method:'POST',body:{text:'A'}});const oldCheck=assert.rejects(old,{name:'AbortError'});api.setToken('B');pending.shift().resolve(new Response('{}',{status:401}));await oldCheck;assert.equal(pending.length,0);
    api.setToken('A');const parsed=deferred();const profile=api.request('/auth/me');const profileCheck=assert.rejects(profile,{name:'AbortError'});pending.shift().resolve({ok:true,status:200,json:()=>parsed.promise});await tick();api.setToken('B');parsed.resolve({id:'A'});await profileCheck;
    api.setToken('A');const upload=api.upload('/files',new FormData());const uploadCheck=assert.rejects(upload,{name:'AbortError'});api.setToken('B');xhrs[0].status=401;await xhrs[0].onload();await uploadCheck;assert.equal(xhrs.length,1);assert.equal(pending.length,0);
  } finally {
    for(const key of keys){const d=original.get(key);if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}
  }
});
