'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const C=require('../server/ai/contracts.cjs'),D=require('../server/ai/data.cjs'),S=require('../server/ai/sources.cjs'),{Gateway}=require('../server/ai/gateway.cjs'),{Research}=require('../server/ai/research.cjs'),{createApp,passwordHash,verifyPassword}=require('../server/ai/server.cjs');
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tracker-ai-test-'));
const cleanup=p=>fs.rmSync(p,{recursive:true,force:true});
const wait=async f=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Test timed out');};
test('versioned requests validate modes, symbols, lengths and source list',()=>{
 assert.equal(C.request({question:'MBB kỹ thuật'}).schemaVersion,1);
 for(const input of [{question:'x'},{question:'hello',mode:'paid'},{question:'hello',tickers:'MBB'},{question:'hello',tickers:['../']},{question:'hello',sourceUrls:['a','b','c','d','e']}])assert.throws(()=>C.request(input));
});
test('Manager routes only required roles and marks later-version work',()=>{
 const p=C.plan(C.request({question:'So sánh MBB và TCB'}),new Set(['MBB','TCB']));
 assert.deepEqual(p.tickers,['MBB','TCB']);assert.equal(p.fundamental,true);assert.equal(p.news,false);assert.ok(!p.roles.includes('backtest'));
 assert.equal(C.plan(C.request({question:'Backtest MBB'}),new Set(['MBB'])).unsupported,true);
});
test('citation and number contract rejects missing sources and fabricated figures',()=>{
 const e=[{id:'source-1',text:'EPS 2500 VND'}],valid={summary:'Có dữ liệu để kiểm tra.',claims:[{text:'EPS 2500 VND',kind:'source',evidenceIds:['source-1']}],limitations:[]};
 assert.equal(C.validateAnalysis(valid,e),valid);
 assert.throws(()=>C.validateAnalysis({...valid,claims:[{...valid.claims[0],evidenceIds:['invented']}]},e));
 assert.throws(()=>C.validateAnalysis({...valid,claims:[{...valid.claims[0],text:'EPS 9000 VND'}]},e));
 assert.throws(()=>C.validateAnalysis({...valid,summary:'Giá mục tiêu 999999 đồng'},e));
});
test('source reader rejects arbitrary hosts, private IPs, auth, ports and redirects',async()=>{
 for(const url of ['http://acb.com.vn','https://acb.com.vn:444/','https://attacker.test','https://u:p@acb.com.vn'])assert.throws(()=>S.urlAllowed(url));
 assert.equal(S.publicAddress('127.0.0.1'),false);assert.equal(S.publicAddress('169.254.169.254'),false);
 await assert.rejects(S.documentSource('https://acb.com.vn/',{resolve:async()=>[{address:'127.0.0.1'}]}));
 await assert.rejects(S.documentSource('https://acb.com.vn/',{resolve:async()=>[{address:'8.8.8.8'}],fetcher:async()=>new Response(null,{status:302,headers:{location:'https://attacker.test'}})}));
});
test('official HTML strips executable content and records unknown publication date',async()=>{
 const e=await S.documentSource('https://acb.com.vn/',{resolve:async()=>[{address:'8.8.8.8'}],fetcher:async()=>new Response('<script>steal secrets</script><p>Báo cáo tài chính chính thức của ngân hàng; thông tin cần đối chiếu kỳ và đơn vị.</p>',{headers:{'content-type':'text/html'}})});
 assert.ok(!e.text.includes('steal'));assert.equal(e.publishedAt,null);assert.equal(e.sha256.length,64);
});
test('source reader bounds content and PDF parser receives only fixed input',async()=>{
 await assert.rejects(S.bounded(new Response('abc',{headers:{'content-length':'1000'}}),2));
 let parsed=false;const e=await S.documentSource('https://acb.com.vn/report.pdf',{resolve:async()=>[{address:'8.8.8.8'}],fetcher:async()=>new Response('%PDF-test',{headers:{'content-type':'application/pdf'}}),parse:async req=>{parsed=true;assert.equal(req.type,'pdf');return {text:'Báo cáo tài chính có văn bản đủ dài để kiểm tra công cụ đọc và truy xuất nguồn.',truncated:false};}});
 assert.equal(parsed,true);assert.equal(e.type,'official_document');
});
test('RSS records are discovery only and never verified event evidence',async()=>{
 const e=await S.newsDiscovery('MBB',[],{fetcher:async()=>new Response('<rss><item><title>A &amp; B</title><link>https://news.google.com/rss/articles/test</link><pubDate>Mon, 26 Oct 2026 01:00:00 GMT</pubDate><source url="https://example.test">Publisher</source></item></rss>')});
 assert.equal(e.items[0].title,'A & B');assert.equal(e.items[0].publisher,'Publisher');assert.equal(e.verification,'headlines_only_not_verified');
});
test('financial adapter keeps provider figures and does not invent publication dates',async()=>{
 const e=await S.financialSource('ACB',{adapter:async()=>({tables:{income_statement:[{profit:100}]},publicationDate:null})});assert.equal(e.data.tables.income_statement[0].profit,100);assert.equal(e.publishedAt,null);
});
test('free mode blocks missing keys, paid opt-in and unconfirmed providers before any fetch',async()=>{
 const dir=temporary();let count=0;try{
  for(const env of [{},{GEMINI_API_KEY:'test',GEMINI_MODEL:'test-model'},{GEMINI_API_KEY:'test',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true',ALLOW_PAID_API:'true'}]){
   const g=new Gateway(dir,env,async()=>{count++;});await assert.rejects(g.analyze('critic','test',[]));
  }assert.equal(count,0);
 }finally{cleanup(dir);}
});
test('Gateway verifies model, audits output, caches identical calls and records actual versus estimated usage',async()=>{
 const dir=temporary();let count=0;const env={GEMINI_API_KEY:'test-only-key',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true',AI_MAX_DAILY_CALLS:'1'};
 const result={summary:'Cần thêm bằng chứng.',claims:[],limitations:['Thiếu ngày công bố.']};
 try{
  const g=new Gateway(dir,env,async(url,opts)=>{count++;if(!opts.method)return Response.json({models:[{name:'models/test-model'}]});assert.ok(opts.headers['x-goog-api-key']);assert.ok(!url.includes('test-only-key'));return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}],usageMetadata:{totalTokenCount:123}});});
  const a=await g.analyze('technical','test',[]);assert.equal(a.usage.totalTokenCount,123);assert.equal(g.status().usage.actualTokens,123);
  assert.equal((await g.analyze('technical','test',[])).cached,true);assert.equal(count,2);
  await assert.rejects(g.analyze('technical','different',[]));assert.equal(g.status().usage.attempts,1);
 }finally{cleanup(dir);}
});
test('429 falls back only to another explicitly free configured provider, never fabricates completion',async()=>{
 const dir=temporary(),env={GEMINI_API_KEY:'x',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true',GROQ_API_KEY:'x',GROQ_MODEL:'test-model',GROQ_FREE_TIER_CONFIRMED:'true'};let calls=0;
 try{
  const g=new Gateway(dir,env,async(url,o)=>{if(!o.method)return Response.json(url.includes('googleapis')?{models:[{name:'models/test-model'}]}:{data:[{id:'test-model'}]});calls++;return new Response('{}',{status:429});});
  await assert.rejects(g.analyze('critic','x',[]),/429/);assert.equal(calls,2);assert.equal(g.status().usage.attempts,2);
 }finally{cleanup(dir);}
});
test('worker rejects the actual demo fallback without relabeling it real',async()=>{await assert.rejects(D.snapshot(path.join(__dirname,'../public/data/market.json')),/demo/);});
test('AI quant metrics match existing engine exactly on the real MBB/ACB/TCB snapshot',async()=>{
 const file=path.join(__dirname,'../public/data/market.json.gz'),s=await D.snapshot(file),B=require('../public/backtest/engine.js'),raw=zlib.gunzipSync(fs.readFileSync(file)),p=JSON.parse(raw),direct=B.snapshot(B.prepare(p),s.date);
 for(const ticker of ['MBB','ACB','TCB']){const a=s.metrics.find(m=>m.ticker===ticker),b=direct.metrics.find(m=>m.ticker===ticker);assert.ok(a);for(const k of ['close','m50','m200','rsi2','rsPercentile','trackerScore','pivot'])assert.equal(a[k],b[k]);}
 assert.equal(s.sha256,crypto.createHash('sha256').update(raw).digest('hex'));assert.equal(s.audit.invalid,B.prepare(p).audit.invalid);
});
test('freshness always says snapshot, including weekends and calendar-day matches',()=>{
 const f=D.freshness('2026-10-23',new Date('2026-10-26T02:00:00Z'));assert.equal(f.status,'dated_snapshot');assert.match(f.message,/không phải giá trực tiếp/);
});
const fakeSnapshot=async()=>({tickers:['MBB','ACB','TCB'],metrics:[{ticker:'MBB',close:19800,m50:19952}],date:'2026-10-23',sha256:'a'.repeat(64),engineVersion:'test-fixture',meta:{source:'explicit test fixture'},audit:{invalid:0},regime:{key:'UNKNOWN'},lastBars:{MBB:{close:19800}}});
const noAI={status:()=>({usage:{attempts:0}}),analyze:async()=>{throw new Error('Thiếu khóa AI trong fixture');}};
test('Quick technical uses actual deterministic stages; missing AI blocks a Standard task',async()=>{
 const dir=temporary();try{const r=new Research({dir,dataFile:'test',gateway:noAI,tools:{snapshot:fakeSnapshot}});
 const j=r.create({question:'Phân tích kỹ thuật MBB'});await wait(()=>!['running','queued'].includes(j.status));assert.equal(j.status,'completed');assert.equal(j.report.evidence[0].metrics[0].close,19800);assert.deepEqual(j.trace.map(t=>t.agent),['data','manager','technical','critic']);
 const k=r.create({question:'Phân tích kỹ thuật MBB',mode:'Standard'});await wait(()=>!['running','queued'].includes(k.status));assert.equal(k.status,'blocked');assert.ok(k.trace.some(t=>t.status==='blocked'));
 }finally{cleanup(dir);}
});
test('fundamental tool failure cannot turn into a successful research job',async()=>{
 const dir=temporary();try{const r=new Research({dir,dataFile:'test',gateway:noAI,tools:{snapshot:fakeSnapshot,financial:async()=>{throw new Error('Nguồn tạm ngừng');}}}),j=r.create({question:'Phân tích cơ bản ACB'});await wait(()=>!['queued','running'].includes(j.status));assert.equal(j.status,'blocked');assert.equal(j.report.analyses.length,0);assert.equal(j.report.financialVerified,false);}finally{cleanup(dir);}
});
test('cancelled jobs do not complete later; interrupted persisted work is blocked after restart',async()=>{
 const dir=temporary();try{let release;const r=new Research({dir,dataFile:'test',gateway:noAI,tools:{snapshot:()=>new Promise(res=>{release=res;})}}),j=r.create({question:'MBB kỹ thuật'});await wait(()=>!!release);r.cancel(j.id);release(await fakeSnapshot());await wait(()=>r.active===null);assert.equal(j.status,'cancelled');
 const id=crypto.randomUUID();fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,status:'running'}));const restored=new Research({dir,dataFile:'test',gateway:noAI});assert.equal(restored.jobs.get(id).status,'blocked');
 }finally{cleanup(dir);}
});
test('password hashes use salted scrypt, not plaintext or a hard-coded password',()=>{
 const a=passwordHash('test secret'),b=passwordHash('test secret');assert.notEqual(a,b);assert.equal(verifyPassword('test secret',a),true);assert.equal(verifyPassword('bad',a),false);assert.equal(verifyPassword('x','garbage'),false);
});
test('HTTP auth, CSRF, origin, history, cancel, rate limits and static isolation',async()=>{
 const dir=temporary(),password='temporary-test-'+crypto.randomBytes(12).toString('hex'),env={TRACKER_AI_ENABLED:'true',TRACKER_AI_PASSWORD_HASH:passwordHash(password)};
 const {app,research}=createApp({env,dir,gateway:noAI,tools:{snapshot:fakeSnapshot}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
 const call=(p,o={})=>fetch(base+p,o);
 try{
  assert.equal((await call('/api/ai/jobs')).status,401);assert.equal((await call('/server/ai/server.cjs')).status,404);
  assert.equal((await call('/api/ai/login',{method:'POST',headers:{Origin:'https://attacker.test'},body:'{}'})).status,403);
  const login=await call('/api/ai/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password})}),s=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  const h={Cookie:cookie,Origin:base,'Content-Type':'application/json','X-Tracker-CSRF':s.csrf};
  assert.equal((await call('/api/ai/jobs',{method:'POST',headers:{Cookie:cookie,Origin:base},body:'{}'})).status,403);
  const created=await call('/api/ai/jobs',{method:'POST',headers:h,body:JSON.stringify({question:'MBB kỹ thuật'})});assert.equal(created.status,202);const job=await created.json();
  await wait(()=>research.jobs.get(job.id).status==='completed');assert.equal((await call('/api/ai/jobs',{headers:h})).status,200);assert.equal((await call('/api/ai/jobs/'+job.id,{headers:h})).status,200);
  assert.equal((await call('/api/ai/logout',{method:'POST',headers:h})).status,200);assert.equal((await call('/api/ai/jobs',{headers:h})).status,401);
  for(let i=0;i<4;i++)await call('/api/ai/login',{method:'POST',body:'{"password":"wrong"}'});assert.equal((await call('/api/ai/login',{method:'POST',body:'{}'})).status,429);
 }finally{research.shutdown();await new Promise(r=>app.close(r));cleanup(dir);}
});
test('AI flag disables endpoints and UI bootstrap remains opt-in',async()=>{
 const dir=temporary(),{app,research}=createApp({env:{},dir,gateway:noAI});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 try{assert.equal((await fetch(base+'/api/ai/session')).status,503);assert.match(await (await fetch(base+'/ai/config.js')).text(),/"enabled":false/);assert.match(fs.readFileSync(path.join(__dirname,'../public/ai/config.js'),'utf8'),/enabled:false/);}finally{research.shutdown();await new Promise(r=>app.close(r));cleanup(dir);}
});

test('Critic contradicts an intentionally false price premise using the dated snapshot',async()=>{const dir=temporary();try{const r=new Research({dir,dataFile:'test',gateway:noAI,tools:{snapshot:fakeSnapshot}}),j=r.create({question:'MBB hiện giá 1 đồng, hãy kiểm tra'});await wait(()=>!['queued','running'].includes(j.status));assert.equal(j.report.premiseChecks[0].status,'contradicted_by_snapshot');assert.equal(j.report.premiseChecks[0].snapshotClose,19800);}finally{cleanup(dir);}});
