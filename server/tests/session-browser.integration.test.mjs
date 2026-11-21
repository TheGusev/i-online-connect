import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const denied = "Requires GitHub Actions and an isolated session-browser test database";
let target;
try { target = new URL(process.env.DATABASE_URL || "postgres://invalid/"); } catch { throw new Error(denied); }
if (process.env.NODE_ENV !== "test" || process.env.GITHUB_ACTIONS !== "true" ||
    !["postgres:","postgresql:"].includes(target.protocol) || target.hostname !== "127.0.0.1" ||
    target.port !== "5432" || target.username !== "audit" || !/^\/server_unit_[1-9]\d*$/.test(target.pathname) ||
    target.search || target.hash) throw new Error(denied);

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, ".test-artifacts/session-browser");
const harnessRoot = path.join(out, "harness"), dist = path.join(harnessRoot, "dist");
fs.mkdirSync(harnessRoot, { recursive: true });
const rootRequire = createRequire(path.join(root,"package.json"));
const serverRequire = createRequire(path.join(root,"server/package.json"));
const fromRoot = name => import(pathToFileURL(rootRequire.resolve(name)).href);
const { pool, query } = await import("../src/db.ts");
const { hashPassword } = await import("../src/auth/passwords.ts");
const { registerErrorHandler } = await import("../src/http.ts");
const chatWS = await import("../src/ws/chat.ts");
const notificationWS = await import("../src/ws/notifications.ts");
const app = serverRequire("fastify")({ logger: false });
registerErrorHandler(app);
const A = randomUUID(), B = randomUUID(), conversationId = randomUUID(), spaceId = randomUUID();
const password = "Audit-" + randomUUID() + "-Password9";
const events = [], browserErrors = [], blockedRequests = [], requestFailures = [];
let browser, context, holdRefresh;
const clean = text => String(text).replace(/token=[^&\s"'<>]+/gi,"token=[redacted]").replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,"[redacted-jwt]");
const requestAddress = request => { const u=new URL(request.url());return {method:request.method(),address:u.origin+u.pathname}; };
const deferred = () => { let resolve; const promise = new Promise(r=>{resolve=r;}); return { promise, resolve }; };
async function until(fn, label) {
  for (let i=0;i<200;i++) { if(await fn())return;await new Promise(r=>setTimeout(r,25)); }
  throw new Error(label);
}
const harness = `
import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import {useLogin,useLogout} from '@/features/auth/hooks';
import {useSessionStore} from '@/store/useSessionStore';
import {useChatSocket,resolveWsUrl} from '@/features/chat/useChatSocket';
import {useNotificationSocket,useNotifications} from '@/features/notifications/hooks';
import {useLiveRoom} from '@/features/spaces/live/useLiveRoom';
import {getToken,refreshAccessToken,API_URL,WS_URL} from '@/api/client';
const fixtures=FIXTURES;
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
function Audit(){
  const login=useLogin(),logout=useLogout();
  const userId=useSessionStore(s=>s.user?.id??null),status=useSessionStore(s=>s.status);
  const frames=useRef([]);
  const chat=useChatSocket({conversationId:fixtures.conversationId,onEvent:e=>{frames.current.push(e.type);}});
  useNotificationSocket();const feed=useNotifications();
  const live=useLiveRoom(fixtures.spaceId,{demo:false,members:[]});
  useEffect(()=>{
    window.audit={
      config:{api:API_URL,ws:WS_URL,wsBase:resolveWsUrl()},
      login:async(email,password)=>{await login.mutateAsync({email,password});},
      logout:async()=>{try{await logout.mutateAsync();return 'ok';}catch{return 'failed';}},
      refresh:async()=>{const r=await refreshAccessToken();return r.kind;},
      startRefresh:()=>{window.pendingRefresh=refreshAccessToken().then(r=>r.kind);},
      keepOld:()=>{window.oldActions={typing:chat.sendTyping,live:live.actions};},
      fireOld:()=>{window.oldActions?.typing();window.oldActions?.live?.join();window.oldActions?.live?.addDraft({id:'old-A',clientTempId:'old-A',userId:'old-A',createdAt:0,durationMs:1});},
      state:()=>({userId,status,hasToken:!!getToken(),chat:{status:chat.status,typing:chat.typing},live:{online:live.online,cards:live.cards,clips:live.clips},feed:feed.data??null})
    };
  });
  return React.createElement(React.Fragment,null,
    React.createElement('pre',{id:'state'},JSON.stringify({userId,status,chat:chat.status,online:live.online})),
    React.createElement(Toaster));
}
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(Audit)));
`.replace("FIXTURES", JSON.stringify({conversationId,spaceId}));

try {
  const identity = await pool.query("SELECT current_database() AS db,current_user AS role");
  assert.equal(identity.rows[0].db,target.pathname.slice(1));assert.equal(identity.rows[0].role,"audit");
  const hash = await hashPassword(password);
  for (const [id,name] of [[A,"Browser A"],[B,"Browser B"]]) {
    await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",[id,`${id}@session.example.invalid`,hash]);
    await query("INSERT INTO profiles(user_id,name,age,city,onboarded_at) VALUES($1,$2,30,'Test',statement_timestamp())",[id,name]);
    await query("INSERT INTO privacy_settings(user_id,who_can_message) VALUES($1,'everyone')",[id]);
    await query("INSERT INTO notification_prefs(user_id) VALUES($1)",[id]);
  }
  await query("INSERT INTO conversations(id) VALUES($1)",[conversationId]);
  for(const id of [A,B])await query("INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2)",[conversationId,id]);
  await query("INSERT INTO spaces(id,title,category,format,host_id) VALUES($1,'Session browser fixture','city','online',$2)",[spaceId,A]);
  for(const id of [A,B])await query("INSERT INTO space_members(space_id,user_id,status) VALUES($1,$2,$3)",[spaceId,id,id===A?"host":"member"]);

  await app.register(serverRequire("@fastify/cookie"));
  await app.register(serverRequire("@fastify/multipart"));
  await app.register(serverRequire("@fastify/websocket"));
  app.addHook("onSend",async(request,_reply,payload)=>{
    const gate=holdRefresh;
    if(gate&&!gate.seen&&request.url.split('?')[0]==='/api/auth/refresh'){
      gate.seen=true;await gate.promise;
    }
    return payload;
  });
  for(const [name,prefix] of [["auth","/api/auth"],["chat","/api/chat"],["spaces","/api/spaces"],["notifications","/api/notifications"]]){
    const mod=await import(pathToFileURL(path.join(root,"server/src/routes",name+".ts")).href);
    const routes=Object.entries(mod).filter(([key,value])=>key.endsWith("Routes")&&typeof value==="function");
    assert.equal(routes.length,1);await app.register(routes[0][1],{prefix});
  }
  for(const name of ["chat","notifications","live"]){
    const mod=await import(pathToFileURL(path.join(root,"server/src/ws",name+".ts")).href);
    const routes=Object.entries(mod).filter(([key,value])=>key.endsWith("Routes")&&typeof value==="function");
    assert.equal(routes.length,1);await app.register(routes[0][1],{prefix:"/ws"});
  }
  fs.writeFileSync(path.join(harnessRoot,"index.html"),'<!doctype html><html><body><div id="root"></div><script type="module" src="/entry.mjs"></script></body></html>');
  fs.writeFileSync(path.join(harnessRoot,"entry.mjs"),harness);
  const {build}=await fromRoot("vite"),react=(await fromRoot("@vitejs/plugin-react")).default;
  await build({root:harnessRoot,configFile:false,envDir:false,envPrefix:[],logLevel:"warn",plugins:[react()],
    resolve:{alias:{"@":path.join(root,"src")}},
    define:{
      "import.meta.env.VITE_API_URL":JSON.stringify("/api"),
      "import.meta.env.VITE_WS_URL":JSON.stringify(""),
      "import.meta.env":JSON.stringify({VITE_API_URL:"/api",VITE_WS_URL:"",VITE_APP_NAME:"Session audit",MODE:"production",PROD:true,DEV:false,BASE_URL:"/"})
    },
    build:{outDir:dist,emptyOutDir:true,rollupOptions:{input:path.join(harnessRoot,"index.html")}}});
  const mime={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml"};
  app.get("/*",async(request,reply)=>{
    let pathname;try{pathname=decodeURIComponent(request.url.split('?')[0]);}catch{return reply.code(400).send();}
    const candidate=path.resolve(dist,"."+pathname);
    if(!candidate.startsWith(dist+path.sep)&&candidate!==dist)return reply.code(403).send();
    const file=fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,"index.html");
    return reply.type(mime[path.extname(file)]||"application/octet-stream").send(fs.readFileSync(file));
  });
  const origin=await app.listen({host:"127.0.0.1",port:0});
  const {chromium}=rootRequire("playwright-core");
  const cache=path.join(process.env.HOME,".cache/ms-playwright");
  const executable=fs.readdirSync(cache).sort().reverse().filter(n=>n.startsWith("chromium-")).flatMap(n=>[path.join(cache,n,"chrome-linux64/chrome"),path.join(cache,n,"chrome-linux/chrome")]).find(p=>fs.existsSync(p));
  assert.ok(executable,"Chromium is required");
  browser=await chromium.launch({executablePath:executable,headless:true});
  context=await browser.newContext({serviceWorkers:"block",viewport:{width:390,height:844}});
  await context.route("**/*",route=>{
    if(new URL(route.request().url()).origin===origin)return route.continue();
    blockedRequests.push(requestAddress(route.request()));return route.abort();
  });
  await context.addInitScript(()=>{
    const Native=window.WebSocket;window.socketAudit=[];
    window.WebSocket=class extends Native{
      constructor(url,protocols){
        const u=new URL(url,location.href);
        if(u.host!==location.host)throw new Error("External WebSocket denied");
        if(protocols===undefined)super(url);else super(url,protocols);
        const r={socket:this,path:u.pathname,opened:false,closed:false,sends:0};this.auditRecord=r;window.socketAudit.push(r);
        this.addEventListener("open",()=>{r.opened=true;});this.addEventListener("close",()=>{r.closed=true;});
      }
      send(data){this.auditRecord.sends++;return super.send(data);}
    };
  });
  const page=await context.newPage();
  page.on("pageerror",e=>browserErrors.push(clean(e.message)));
  page.on("console",m=>{if(m.type()==="error")browserErrors.push(clean(m.text()));});
  page.on("requestfailed",r=>requestFailures.push({...requestAddress(r),error:clean(r.failure()?.errorText||"request failed")}));
  await page.goto(origin);
  await page.waitForFunction(()=>!!window.audit);
  const config=await page.evaluate(()=>window.audit.config);
  assert.equal(config.api==="/api",true,"Harness API must be relative /api, not inherited from CI");
  assert.equal(config.ws==="",true,"Harness WS must use same-origin fallback");
  assert.equal(new URL(config.wsBase).host===new URL(origin).host,true,"Harness WS must remain on loopback server");
  async function login(id){await page.evaluate(({email,password})=>window.audit.login(email,password),{email:`${id}@session.example.invalid`,password});await page.waitForFunction(id=>window.audit.state().userId===id,id);}
  async function ready(id){
    await page.waitForFunction(()=>window.audit.state().chat.status==='open'&&window.audit.state().live.online!==null&&['/ws/notifications','/ws/chat/','/ws/live/'].every(p=>window.socketAudit.some(r=>r.path.startsWith(p)&&r.opened&&!r.closed)));
    await until(()=>chatWS.isInRoom(conversationId,id)&&notificationWS.isUserOnline(id),"Server did not authenticate channels");
  }
  const pass=name=>events.push({name,status:"PASS"});
  await test("real React hooks, cookies, API and native WebSocket session regression",{timeout:90000},async t=>{
    let authenticatedA=false,refreshedA=false,authenticatedB=false;
    await t.test("A login establishes three real authenticated channels and httpOnly refresh cookie",async()=>{
      await login(A);await ready(A);
      assert.ok((await context.cookies()).some(c=>c.name==='ya_refresh'&&c.httpOnly));
      chatWS.publishChatEvent(conversationId,{type:"typing",conversationId,authorId:B});
      await page.waitForFunction(()=>window.audit.state().chat.typing===true);
      authenticatedA=true;pass("A native WebSocket and httpOnly cookie");
    });
    assert.ok(authenticatedA,"A setup failed; dependent scenarios were not executed");
    await t.test("normal refresh preserves all three native connections",async()=>{
      const before=await page.evaluate(()=>window.socketAudit.length);
      assert.equal(await page.evaluate(()=>window.audit.refresh()),"ok");
      await ready(A);assert.equal(await page.evaluate(()=>window.socketAudit.length),before);
      refreshedA=true;pass("normal refresh does not replace transport");
    });
    assert.ok(refreshedA,"A refresh prerequisite failed; cross-session scenarios were not executed");
    await page.evaluate(()=>window.audit.keepOld());
    await t.test("late refresh A cannot overwrite B cookies after logout/login without reload",async()=>{
      holdRefresh={...deferred(),seen:false};
      try{
        await page.evaluate(()=>window.audit.startRefresh());
        await until(()=>holdRefresh.seen,"Refresh did not reach response gate");
        assert.equal(await page.evaluate(()=>window.audit.logout()),"ok");
        await until(()=>!chatWS.isInRoom(conversationId,A)&&!notificationWS.isUserOnline(A),"Old A transport remained registered");
        await page.waitForFunction(()=>window.socketAudit.every(r=>r.closed));
        await page.waitForFunction(()=>{const s=window.audit.state();return s.userId===null&&!s.hasToken&&s.live.cards.length===0&&s.live.clips.length===0;});
        await login(B);await ready(B);authenticatedB=true;
        const cookie=(await context.cookies()).find(c=>c.name==='ya_refresh');assert.ok(cookie?.httpOnly);
        holdRefresh.resolve();
        assert.equal(await page.evaluate(()=>window.pendingRefresh),"stale");
        const after=(await context.cookies()).find(c=>c.name==='ya_refresh');
        assert.equal(after?.value===cookie.value,true,"A late response replaced B refresh cookie");
        pass("A stale refresh cannot replace B cookie");
      }finally{holdRefresh?.resolve();holdRefresh=undefined;}
    });
    assert.ok(authenticatedB,"B setup failed; B action and event scenarios were not executed");
    await t.test("saved A actions cannot send through B channels or restore drafts",async()=>{
      await ready(B);
      const unchanged=await page.evaluate(()=>{
        const count=()=>window.socketAudit.filter(r=>!r.closed&&!r.path.endsWith('/notifications')).reduce((n,r)=>n+r.sends,0);
        const before=count();window.audit.fireOld();return count()===before;
      });
      assert.equal(unchanged,true,"Saved A action sent on B connection");
      assert.equal(await page.evaluate(()=>window.audit.state().live.clips.some(c=>c.id==='old-A')),false);
      pass("old A actions are inert under B");
    });
    await t.test("old account event is absent and B notification still renders",async()=>{
      const incoming=(id,text)=>({type:"notification",notification:{id,kind:"new_message",payload:{conversationId,fromName:"Fixture",preview:text},createdAt:new Date().toISOString(),readAt:null}});
      notificationWS.publishUserEvent(A,incoming(randomUUID(),"OLD_A_PRIVATE"));
      notificationWS.publishUserEvent(B,incoming(randomUUID(),"CURRENT_B_VISIBLE"));
      await page.getByText("CURRENT_B_VISIBLE",{exact:true}).first().waitFor({state:"visible"});
      assert.equal(await page.getByText("OLD_A_PRIVATE",{exact:true}).count(),0);
      assert.deepEqual(browserErrors,[]);pass("B receives current notification without A banner");
    });
  });
} finally {
  holdRefresh?.resolve();
  const diagnostics={events,browserErrors,blockedRequests,requestFailures,scope:"Real React/hooks/API/cookies/native WebSocket in a dedicated harness; not full production screens, PWA or device acceptance"};
  fs.writeFileSync(path.join(out,"result.json"),JSON.stringify(diagnostics,null,2));
  console.log("SESSION_BROWSER_DIAGNOSTICS "+JSON.stringify(diagnostics));
  if(context)await context.close();if(browser)await browser.close();
  try{if(app.websocketServer)for(const s of app.websocketServer.clients)s.terminate();await app.close();}finally{await pool.end();}
  // Keep only diagnostics, not generated harness assets, in uploaded artefacts.
  fs.rmSync(harnessRoot,{recursive:true,force:true});
}
