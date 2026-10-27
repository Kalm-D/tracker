'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {CloudState,validateFiles}=require('../server/ai/cloud-state.cjs'),{Gateway}=require('../server/ai/gateway.cjs'),{createApp,passwordHash}=require('../server/ai/server.cjs'),{waitForBackend}=require('../public/ai/wake.js');
const env={SUPABASE_URL:'https://fixture-project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key-not-real-123456'};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tracker-supabase-test-'));
const clean=d=>{assert.equal(path.dirname(d),os.tmpdir());assert.ok(path.basename(d).startsWith('tracker-supabase-test-'));fs.rmSync(d,{recursive:true,force:true});};
function fakeDB(){
 const db={files:{},owner:null,fail:false,actions:[]};db.fetch=async(url,options)=>{assert.equal(options.redirect,'error');const b=JSON.parse(options.body);db.actions.push(b.p_action);if(db.fail)return Response.json({error:'PRIVATE_INTERNAL_TEXT'},{status:503});
 if(b.p_action==='acquire'){if(db.owner&&db.owner!==b.p_owner)return Response.json({error:'writer_busy'},{status:409});db.owner=b.p_owner;return Response.json({ok:true,files:db.files});}
 if(db.owner!==b.p_owner)return Response.json({error:'writer_expired'},{status:409});if(b.p_action==='write')Object.assign(db.files,structuredClone(b.p_changes));if(b.p_action==='release')db.owner=null;return Response.json({ok:true});};return db;
}
const fixture=async()=>({date:'2026-10-23',sha256:'a'.repeat(64),engineVersion:'EXPLICIT CLOUD FIXTURE',tickers:['MBB'],metrics:[{ticker:'MBB',close:19800,m50:19952,dataQuality:'D0'}],regime:{key:'UNKNOWN'},meta:{source:'EXPLICIT CLOUD FIXTURE'},audit:{invalid:0},lastBars:{MBB:{close:19800}}});
test('Cloud config requires a server secret and HTTPS Supabase endpoint without credentials or query',()=>{for(const patch of [{SUPABASE_URL:'http://fixture.supabase.co'},{SUPABASE_URL:'https://evil.test'},{SUPABASE_URL:'https://fixture.supabase.co/path'},{SUPABASE_URL:'https://user:secret@fixture.supabase.co'},{SUPABASE_URL:'https://fixture.supabase.co?key=bad'},{SUPABASE_SERVICE_ROLE_KEY:''}])assert.throws(()=>new CloudState({...env,...patch}));assert.throws(()=>validateFiles({'../escape':{}}));assert.throws(()=>validateFiles({'gateway/usage.json':[]}));});
test('Cloud restores jobs, monitors and quota into a fresh ephemeral directory; second writer is refused',async()=>{
 const a=temp(),b=temp(),db=fakeDB(),id=crypto.randomUUID();let first,second;
 try{first=await new CloudState(env,{fetcher:db.fetch}).open(a);first.put('jobs/'+id+'.json',{id,question:'EXPLICIT FIXTURE'});first.put('monitoring/monitors.json',{version:'monitoring-0.3.0',records:[]});first.put('gateway/usage.json',{'2026-10-26':{attempts:2,reservedTokens:200,actualTokens:150}});await first.flush();
 second=new CloudState(env,{fetcher:db.fetch});await assert.rejects(second.open(b));await first.release();second=await new CloudState(env,{fetcher:db.fetch}).open(b);assert.equal(JSON.parse(fs.readFileSync(path.join(b,'jobs',id+'.json'))).id,id);assert.equal(JSON.parse(fs.readFileSync(path.join(b,'gateway','usage.json')))['2026-10-26'].attempts,2);assert.equal(second.status().healthy,true);
 }finally{await first?.release();await second?.release();clean(a);clean(b);}
});
test('Cloud failure never silently falls back to an empty local quota and does not leak database response',async()=>{
 const dir=temp(),db=fakeDB();let store;try{store=await new CloudState(env,{fetcher:db.fetch}).open(dir);db.fail=true;store.put('gateway/usage.json',{schemaVersion:1});await assert.rejects(store.flush(),/cloud/);assert.equal(store.status().healthy,false);assert.doesNotMatch(JSON.stringify(store.status()),/PRIVATE_INTERNAL_TEXT|fixture-service/);assert.throws(()=>store.put('gateway/usage.json',{}));}finally{await store?.release();clean(dir);}
});
test('Cloud lease expiry blocks writes, malformed restored paths never escape the private directory',async()=>{
 const dir=temp(),db=fakeDB();let now=1000,store;try{store=await new CloudState(env,{fetcher:db.fetch,clock:()=>now}).open(dir);now+=60001;assert.throws(()=>store.put('gateway/usage.json',{}),/hết hạn/);await store.release();db.files={'../escape':{}};await assert.rejects(new CloudState(env,{fetcher:db.fetch}).open(dir),/không hợp lệ/);assert.equal(db.owner,null);}finally{await store?.release();clean(dir);}
});
test('A generation POST is impossible until the reservation has reached Supabase',async()=>{
 const dir=temp(),db=fakeDB();let store,posts=0;try{store=await new CloudState(env,{fetcher:db.fetch}).open(dir);
 const g=new Gateway(path.join(dir,'gateway'),{GEMINI_API_KEY:'explicit-fixture-key',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,o)=>{if(!o.method)return Response.json({models:[{name:'models/test-model'}]});posts++;assert.equal(db.files['gateway/usage.json'].days[new Date().toISOString().slice(0,10)].attempts,1);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Thiếu dữ liệu.',claims:[],limitations:[]})}]}}],usageMetadata:{totalTokenCount:100}});},{durability:store});
 await g.analyze('technical','EXPLICIT FIXTURE',[]);assert.equal(posts,1);assert.equal(db.files['gateway/usage.json'].days[new Date().toISOString().slice(0,10)].actualTokens,100);
 }finally{await store?.release();clean(dir);}
});
test('A failed remote reservation produces zero generation POSTs even though a local file was written',async()=>{
 const dir=temp(),db=fakeDB();let store,posts=0;try{store=await new CloudState(env,{fetcher:db.fetch}).open(dir);
 const g=new Gateway(path.join(dir,'gateway'),{GEMINI_API_KEY:'fixture-key',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,o)=>{if(!o.method){db.fail=true;return Response.json({models:[{name:'models/test-model'}]});}posts++;},{durability:store});
 await assert.rejects(g.analyze('technical','EXPLICIT FIXTURE',[]));assert.equal(posts,0);assert.equal(g.status().usage.healthy,false);
 }finally{await store?.release();clean(dir);}
});
test('Owner API acknowledges a new job only after remote history exists and cloud failures block API/health',async()=>{
 const dir=temp(),db=fakeDB(),id='fixture-password-12345';let store,app;
 try{store=await new CloudState(env,{fetcher:db.fetch}).open(dir);app=createApp({dir,env:{TRACKER_AI_ENABLED:'true',TRACKER_AI_PASSWORD_HASH:passwordHash(id)},durability:store,tools:{snapshot:fixture}});await new Promise(r=>app.app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.app.address().port;
 const login=await fetch(base+'/api/ai/login',{method:'POST',headers:{Origin:base},body:JSON.stringify({password:id})}),session=await login.json(),headers={Origin:base,Cookie:login.headers.get('set-cookie').split(';')[0],'X-Tracker-CSRF':session.csrf};
 const response=await fetch(base+'/api/ai/jobs',{method:'POST',headers,body:JSON.stringify({question:'Kỹ thuật MBB',mode:'Quick',tickers:['MBB']})}),job=await response.json();assert.equal(response.status,202);assert.equal(db.files['jobs/'+job.id+'.json'].id,job.id);
 for(let i=0;i<200&&app.research.active;i++)await new Promise(r=>setTimeout(r,10));await new Promise(r=>setTimeout(r,30));await store.flush();assert.equal(db.files['jobs/'+job.id+'.json'].status,'completed');
 const health=await fetch(base+'/healthz');assert.deepEqual(await health.json(),{status:'ok'});db.fail=true;await assert.rejects(store.rpc('renew'));assert.equal((await fetch(base+'/healthz')).status,503);assert.equal((await fetch(base+'/api/ai/jobs',{headers})).status,503);
 }finally{if(app)await new Promise(r=>app.app.close(r));await store?.release();clean(dir);}
});
test('Wake flow retries loading HTML and 503, but performs GET only and stops after readiness',async()=>{
 let now=0,calls=0;await waitForBackend('https://fixture.test/healthz',{now:()=>now,delay:async ms=>now+=ms,fetcher:async(url,o)=>{assert.equal(o.method,'GET');assert.equal(o.credentials,'omit');calls++;return calls===1?new Response('Loading',{headers:{'content-type':'text/html'}}):calls===2?Response.json({status:'unavailable'},{status:503}):Response.json({status:'ok'});}});assert.equal(calls,3);assert.equal(now,4000);
});
test('Wake flow has a bounded wait, cancels immediately, and does not hide a bad endpoint',async()=>{
 let now=0;await assert.rejects(waitForBackend('https://fixture.test/healthz',{timeoutMs:6000,now:()=>now,delay:async ms=>now+=ms,fetcher:async()=>Response.json({status:'unavailable'},{status:503})}),/Chưa kết nối/);assert.equal(now,6000);
 const c=new AbortController();c.abort(Error('cancelled'));let calls=0;await assert.rejects(waitForBackend('https://fixture.test/healthz',{signal:c.signal,fetcher:async()=>calls++}),/cancelled/);assert.equal(calls,0);
 await assert.rejects(waitForBackend('https://fixture.test/healthz',{fetcher:async()=>new Response('',{status:404})}),/địa chỉ/);
});
