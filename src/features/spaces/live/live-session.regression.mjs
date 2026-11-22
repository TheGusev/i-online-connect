import test from "node:test";
import assert from "node:assert/strict";
import { createRealLiveRoomHook } from "./real-live-room.mjs";
import { createSessionScope, subscribeSessionChanges } from "../../../api/session-scope.mjs";
const card = (id, extra = {}) => ({ id, kind: "note", authorId: id, text: id, status: "open", createdAt: "2026-11-20T00:00:00Z", clientTempId: `t-${id}`, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const cancelled = () => Object.assign(new Error("Session changed"), { name: "AbortError", code: "SESSION_CHANGED" });
const flush = () => new Promise(r => setImmediate(r));
// Card-rule doubles follow cards.ts; its own test suite remains authoritative for card rules.
const rules = {
  upsertCard(list, item) { const i=list.findIndex(c=>c.id===item.id||c.clientTempId===item.clientTempId); if(i<0)return [...list,item];const n=list.slice();n[i]=item;return n; },
  dropOptimistic: (list,id) => list.filter(c=>!(c.clientTempId===id&&c.id.startsWith("temp-"))),
  restoreCard(list,item) { return rules.upsertCard(list,item); },
  applyCardEvent(list,e) { if(e.type==="card_added")return rules.upsertCard(list,e.card);if(e.type==="card_removed")return list.filter(c=>c.id!==e.cardId);return list.map(c=>c.id===e.card.id?e.card:c); },
};
function setup({ refresh=async()=>({kind:"ok",token:"A2"}), guest=false }={}) {
  let token=guest?null:"A",cursor=0,next=0,dirty=false;
  const slots=[],effects=[],jobs=new Map();
  const h={ slots,jobs,sockets:[],errors:[],calls:[],space:"room",enabled:true,members:[],mounted:true,store:{user:guest?null:{id:"A"},status:guest?"guest":"authed",token} };
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial) { const i=cursor++;if(!slots[i])slots[i]={value:initial};const s=slots[i];return[s.value,value=>{if(!h.mounted)return;const n=typeof value==="function"?value(s.value):value;if(!Object.is(n,s.value)){s.value=n;dirty=true;}}]; },
    useRef(initial) { const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i]; },
    useMemo(fn,deps) { const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value; },
    useCallback(fn,deps) { return react.useMemo(()=>fn,deps); },
    useEffect(fn,deps) { const i=cursor++,old=slots[i];if(!old||!same(old.deps,deps)){const s={deps,cleanup:old?.cleanup};slots[i]=s;effects.push(()=>{s.cleanup?.();s.cleanup=fn();});} },
  };
  h.scope=createSessionScope({ readToken:()=>token,writeToken:t=>{token=t;},refresh,onInvalid:()=>{h.store={user:null,status:"guest",token:null};} });
  h.api={
    addLiveCard:async(space,input)=>{h.calls.push(["add",space]);return card("saved",{clientTempId:input.clientTempId});},
    addLivePhotoCard:async()=>{h.calls.push(["photo"]);return card("photo");},
    updateLiveCard:async()=>card("updated"),deleteLiveCard:async()=>{},
  };
  h.host=new EventTarget();h.host.setTimeout=(fn,delay)=>{const id=++next;jobs.set(id,{fn,delay});return id;};h.host.clearTimeout=id=>jobs.delete(id);
  const useRoom=createRealLiveRoomHook({react,session:{getToken:h.scope.getToken,getRevision:()=>h.scope.capture().revision,isCurrent:h.scope.isCurrent,subscribe:fn=>subscribeSessionChanges(h.scope.getToken,fn)},api:h.api,cards:rules,useSessionStore:fn=>fn(h.store),resolveWsUrl:()=>"wss://audit.invalid/ws",resumeEvent:"resume",getWindow:()=>h.host,randomUUID:()=>`uuid-${++next}`,showError:m=>h.errors.push(m),createSocket:url=>{const s={url,readyState:0,sent:[],closed:false,send(data){this.sent.push(JSON.parse(data));},close(){this.closed=true;this.readyState=3;}};h.sockets.push(s);return s;}});
  h.render=()=>{let room;for(let i=0;i<12;i++){dirty=false;cursor=0;room=useRoom(h.space,h.enabled,h.members);while(effects.length)effects.shift()();if(!dirty)return room;}throw new Error("Render did not settle");};
  h.open=(s=h.sockets.at(-1))=>{s.readyState=1;s.onopen?.({});};
  h.frame=(e,s=h.sockets.at(-1))=>s.onmessage({data:JSON.stringify(e)});
  h.snapshot=(list=[])=>h.frame({type:"snapshot",live:{active:true,startedBy:"A",mode:"talk",participants:["A"],speaking:[]},online:3,clips:[],cards:list});
  h.change=(id,installed=true)=>{h.scope.setToken(id);if(installed)h.store=id?{user:{id},status:"authed",token:id}:{user:null,status:"guest",token:null};return h.render();};
  h.fire=()=>{const [id,j]=[...jobs][0];jobs.delete(id);j.fn();};
  h.dispose=()=>{if(!h.mounted)return;h.mounted=false;for(const s of slots)s?.cleanup?.();};
  h.render();return h;
}

test("live: current snapshot and card events work",()=>{const h=setup();try{h.open();h.snapshot([card("A")]);h.frame({type:"card_added",card:card("B")});h.frame({type:"card_added",card:card("B")});assert.deepEqual(h.render().cards.map(c=>c.id),["A","B"]);assert.equal(h.render().online,3);}finally{h.dispose();}});
test("live: normal refresh retains transport",async()=>{const h=setup();try{await h.scope.refreshAccessToken();h.render();assert.equal(h.sockets.length,1);assert.equal(h.sockets[0].closed,false);assert.equal(h.scope.getToken(),"A2");}finally{h.dispose();}});
test("live: ordinary reconnect uses latest same-session token",async()=>{const h=setup();try{const a=h.sockets[0];a.readyState=3;a.onclose({code:1006});assert.equal([...h.jobs.values()][0].delay,1000);await h.scope.refreshAccessToken();h.fire();assert.equal(new URL(h.sockets[1].url).searchParams.get("token"),"A2");}finally{h.dispose();}});
test("live: A to B closes old OPEN socket",()=>{const h=setup();try{h.open();h.change("B");assert.equal(h.sockets[0].closed,true);assert.equal(h.sockets.length,2);}finally{h.dispose();}});
test("live: logout closes CONNECTING socket",()=>{const h=setup();try{h.change(null);assert.equal(h.sockets[0].closed,true);assert.equal(h.jobs.size,0);assert.equal(h.sockets.length,1);}finally{h.dispose();}});
test("live: saved old frame cannot update B",()=>{const h=setup();try{const frame=h.sockets[0].onmessage;h.change("B");frame({data:JSON.stringify({type:"presence",online:99})});assert.equal(h.render().online,null);}finally{h.dispose();}});
test("live: saved old retry cannot use B token",()=>{const h=setup();try{h.sockets[0].readyState=3;h.sockets[0].onclose({code:1006});const job=[...h.jobs.values()][0].fn;h.change("B");assert.equal(h.jobs.size,0);job();assert.equal(h.sockets.length,2);}finally{h.dispose();}});
test("live: saved old actions cannot send or add drafts",()=>{const h=setup();try{h.open();const a=h.render().actions;h.change("B");h.open();a.join();a.start();a.end();a.leave();a.speaking(true);a.addDraft({id:"old",clientTempId:"old"});assert.equal(h.sockets[1].sent.length,0);assert.equal(h.render().clips.length,0);}finally{h.dispose();}});
test("live: late add success is ignored and returns false",async()=>{const h=setup();try{const d=deferred();h.api.addLiveCard=()=>d.promise;const p=h.render().cardActions.addCard({kind:"note",text:"A"});h.change("B");h.snapshot([card("B")]);d.resolve(card("saved-A"));assert.equal(await p,false);assert.deepEqual(h.render().cards.map(c=>c.id),["B"]);}finally{h.dispose();}});
test("live: late update success cannot insert A card into B",async()=>{const h=setup();try{const d=deferred();h.api.updateLiveCard=()=>d.promise;h.render().cardActions.resolveCard(card("A"),"resolved");h.change("B");h.snapshot([card("B")]);d.resolve(card("A"));await flush();assert.deepEqual(h.render().cards.map(c=>c.id),["B"]);}finally{h.dispose();}});
test("live: late cancellation cannot restore A card or show toast to B",async()=>{const h=setup();try{const d=deferred();h.api.deleteLiveCard=()=>d.promise;h.snapshot([card("A")]);h.render().cardActions.removeCard(card("A"));h.change("B");h.snapshot([card("B")]);d.reject(cancelled());await flush();assert.deepEqual(h.render().cards.map(c=>c.id),["B"]);assert.deepEqual(h.errors,[]);}finally{h.dispose();}});
test("live: late cancellation after unmount cannot show toast",async()=>{const h=setup();const d=deferred();h.api.deleteLiveCard=()=>d.promise;h.render().cardActions.removeCard(card("A"));h.dispose();d.reject(cancelled());await flush();assert.deepEqual(h.errors,[]);});
test("live: current add succeeds",async()=>{const h=setup();try{assert.equal(await h.render().cardActions.addCard({kind:"note",text:"ok"}),true);assert.deepEqual(h.render().cards.map(c=>c.id),["saved"]);assert.equal(h.calls.length,1);}finally{h.dispose();}});
test("live: current error restores card and reports error",async()=>{const h=setup();try{h.api.deleteLiveCard=async()=>{throw new Error("current failure");};h.snapshot([card("A")]);h.render().cardActions.removeCard(card("A"));await flush();assert.deepEqual(h.render().cards.map(c=>c.id),["A"]);assert.deepEqual(h.errors,["current failure"]);}finally{h.dispose();}});
test("live: room switch clears participation intent and drafts",()=>{const h=setup();try{h.open();h.render().actions.join();h.render().actions.addDraft({id:"draft",clientTempId:"d"});h.space="other";h.render();h.open();assert.deepEqual(h.sockets[1].sent,[]);assert.deepEqual(h.render().clips,[]);}finally{h.dispose();}});
test("live: pending room-A operation cannot modify room-B",async()=>{const h=setup();try{const d=deferred();h.api.addLiveCard=()=>d.promise;const p=h.render().cardActions.addCard({kind:"note"});h.space="other";h.render();h.snapshot([card("B")]);d.resolve(card("saved-A"));assert.equal(await p,false);assert.deepEqual(h.render().cards.map(c=>c.id),["B"]);}finally{h.dispose();}});
test("live: resume does not duplicate CONNECTING socket",()=>{const h=setup();try{h.host.dispatchEvent(new Event("resume"));assert.equal(h.sockets.length,1);}finally{h.dispose();}});
test("live: auth rejection does not schedule retry",()=>{for(const code of [4401,4403]){const h=setup();try{h.sockets[0].onclose({code});assert.equal(h.jobs.size,0);}finally{h.dispose();}}});
test("live: malformed frames do not update state",()=>{const h=setup();try{for(const data of ["{","null","[]","{}",'{"type":"snapshot"}'])h.sockets[0].onmessage({data});assert.equal(h.render().active,false);}finally{h.dispose();}});
test("live: stale close from previous network socket cannot clear replacement",()=>{const h=setup();try{const close=h.sockets[0].onclose;h.sockets[0].readyState=3;close({code:1006});h.fire();h.open();close({code:1006});h.render().actions.join();assert.equal(h.sockets[1].sent.length,1);assert.equal(h.jobs.size,0);}finally{h.dispose();}});
test("live: rejoin after same-session reconnect is retained",()=>{const h=setup();try{h.open();h.render().actions.join();h.sockets[0].readyState=3;h.sockets[0].onclose({code:1006});h.fire();h.open();assert.deepEqual(h.sockets[1].sent,[{type:"join",spaceId:"room"}]);}finally{h.dispose();}});
test("live: guest cannot open transport or mutate cards",async()=>{const h=setup({guest:true});try{assert.equal(h.sockets.length,0);assert.equal(await h.render().cardActions.addCard({kind:"note"}),false);assert.equal(h.calls.length,0);}finally{h.dispose();}});
test("live: explicit same-account boundary reopens only after store installation",()=>{const h=setup();try{h.scope.setToken("A-new");h.render();assert.equal(h.sockets[0].closed,true);assert.equal(h.sockets.length,1);h.store={user:{id:"A"},status:"authed",token:"A-new"};h.render();assert.equal(h.sockets.length,2);}finally{h.dispose();}});
test("live: same-token session replacement invalidates old actions",()=>{const h=setup();try{const a=h.render().actions;h.scope.setToken("A");h.render();h.open();a.join();assert.equal(h.sockets.length,2);assert.deepEqual(h.sockets[1].sent,[]);}finally{h.dispose();}});
test("live: late invalid refresh A cannot dispose B",async()=>{const d=deferred(),h=setup({refresh:()=>d.promise});try{const p=h.scope.refreshAccessToken();await flush();h.change("B");d.resolve({kind:"invalid"});assert.equal((await p).kind,"stale");assert.equal(h.sockets[1].closed,false);assert.equal(h.scope.getToken(),"B");}finally{h.dispose();}});
test("live: current invalid refresh closes transport",async()=>{const h=setup({refresh:async()=>({kind:"invalid"})});try{await h.scope.refreshAccessToken();h.render();assert.equal(h.sockets[0].closed,true);assert.equal(h.sockets.length,1);}finally{h.dispose();}});
