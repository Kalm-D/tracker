'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const A=require('../server/ai/backtest.cjs'),B=require('../public/backtest/engine.js'),C=require('../server/ai/contracts.cjs'),{Monitoring,transitions}=require('../server/ai/monitoring.cjs'),{Research}=require('../server/ai/research.cjs'),{projectEvidence}=require('../server/ai/gateway.cjs'),{createApp,passwordHash}=require('../server/ai/server.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tracker-v03-test-')),clean=p=>fs.rmSync(p,{recursive:true,force:true});
const wait=async f=>{for(let i=0;i<500;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Test timed out');};
const config={start:'2026-10-22',end:'2026-10-23',capital:100000000,acknowledge:true,method:'both'};
const dataFile=path.join(__dirname,'../public/data/market.json.gz');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const snapshot=(date='2026-10-23',close=110,h='a',quality='D0')=>({date,sha256:hash(h),engineVersion:'explicit-test-fixture',meta:{source:'TEST FIXTURE'},audit:{invalid:0},tickers:['MBB'],metrics:[{ticker:'MBB',close,m50:100,pivot:115,dataQuality:quality}],regime:{key:'UPTREND'},lastBars:{MBB:{close}}});
const job=()=>({id:crypto.randomUUID(),status:'completed',plan:{tickers:['MBB']},report:{evidence:[{type:'deterministic_calculation',dataDate:'2026-10-23',sha256:hash('a'),metrics:snapshot().metrics,regime:{key:'UPTREND'}}],strategies:[{ticker:'MBB',entryReference:{price:115,source:'user_assumption'},stopReference:{price:95,source:'user_assumption'},targetReference:{price:120,source:'user_assumption'}}]}});
const noAI={status:()=>({usage:{attempts:0,actualTokens:0}}),analyze:async()=>{throw new Error('No model in test');}};
test('Backtest requires explicit dates, bounded capital, acknowledgement and whitelist',()=>{
 assert.equal(A.config(config).capital,100000000);
 for(const patch of [{capital:undefined},{capital:1e13},{acknowledge:false},{start:'2026-02-30'},{end:'2026-09-01'},{outOfSampleStart:'2026-10-22'},{outOfSampleStart:'2026-10-24'},{tickers:['MBB']},{warmup:1},{fee:'0.1'},{maxPositions:21},{liquidate:'true'}])assert.throws(()=>A.config({...config,...patch}));
});
test('Router v3 keeps backtest technical comparison separate from fundamentals and strategy v2',()=>{
 const req=C.request({question:'Backtest so sánh MBB và ACB',backtest:config}),p=C.plan(req,new Set(['MBB','ACB']));assert.equal(req.schemaVersion,3);assert.equal(p.unsupported,false);assert.equal(p.fundamental,false);assert.ok(p.roles.includes('backtest'));assert.deepEqual(p.tickers,['MBB','ACB']);
 assert.throws(()=>C.request({question:'Backtest MBB',backtest:config,strategy:{kind:'swing'}}));
 assert.equal(C.request({question:'Kỹ thuật MBB'}).schemaVersion,1);
});
test('Backtest worker equals direct existing engine on real full-universe snapshot and stable hashes',{timeout:120000},async()=>{
 const raw=zlib.gunzipSync(fs.readFileSync(dataFile)),payload=JSON.parse(raw),sha=hash(raw),input={...config,outOfSampleStart:'2026-10-23'},tickers=['MBB','ACB'];
 const actual=await A.run(dataFile,input,{tickers,expectedHash:sha}),direct=B.run(payload,{...A.config(input),tickers}),expected=A.compact(direct,sha);
 assert.deepEqual(actual,expected);assert.equal(actual.audit.symbols,payload.symbols.length);assert.equal(actual.universe,'full_snapshot_before_ticker_filter');assert.equal(actual.results[0].periods[1].name,'out_of_sample');assert.equal(actual.benchmarks.find(b=>b.ticker==='VN30').available,false);
 assert.equal(A.compact(direct,sha).configurationHash,actual.configurationHash);assert.notEqual(A.compact({...direct,config:{...direct.config,fee:0.002}},sha).configurationHash,actual.configurationHash);
});
test('Backtest fails on snapshot race, demo, unknown symbols, too many sessions and bad warmup interval',{timeout:120000},async()=>{
 await assert.rejects(A.run(dataFile,config,{tickers:['MBB'],expectedHash:hash('changed')}),/đã đổi/);
 await assert.rejects(A.run(path.join(__dirname,'../public/data/market.json'),config,{tickers:['MBB']}),/demo/);
 await assert.rejects(A.run(dataFile,config,{tickers:['ZZZ']}),/không có/);
 await assert.rejects(A.run(dataFile,{...config,start:'2025-07-14'},{tickers:['MBB']}),/60 phiên/);
 await assert.rejects(A.run(dataFile,{...config,start:'2025-07-14',end:'2025-07-15'},{tickers:['MBB']}),/Khoảng hỗ trợ/);
 await assert.rejects(A.run(dataFile,config,{tickers:[]}),/1–5/);
});
test('Backtest terminates worker on cancellation and timeout without completing',async()=>{
 const controller=new AbortController();const work=A.run(dataFile,config,{tickers:['MBB'],signal:controller.signal});controller.abort(new Error('TEST CANCEL'));await assert.rejects(work,/TEST CANCEL/);
 await assert.rejects(A.run(dataFile,config,{tickers:['MBB'],timeoutMs:1}),/vượt thời gian/);
 await assert.rejects(A.run(dataFile,config,{tickers:['MBB'],signal:controller.signal}),/TEST CANCEL/);
});
test('Backtest evidence strips capital, holdings, cash P&L and quantities from model context',()=>{
 const projected=projectEvidence({id:'bt',type:'backtest_calculation',data:{config:{capital:123456789},results:[{method:'market',summary:{return:0.1,maxDrawdown:0.2,trades:2,winRate:0.5,finalEquity:987654321},trades:[{quantity:12345}],curve:[{equity:987654321}]}]}});
 assert.equal(projected.data.results[0].return,0.1);assert.doesNotMatch(JSON.stringify(projected),/capital|quantity|finalEquity|987654321|123456789/);
});
test('Research executes Backtest stage with matching snapshot and persists its report',async()=>{
 const dir=temp();try{let opts;const r=new Research({dir,dataFile:'fixture',gateway:noAI,tools:{snapshot:async()=>snapshot(),backtest:async(file,c,o)=>{opts=o;return {simulationOnly:true,snapshotHash:o.expectedHash};}}}),j=r.create({question:'Backtest MBB',backtest:config});await wait(()=>!['queued','running'].includes(j.status));assert.equal(j.status,'completed');assert.equal(opts.expectedHash,hash('a'));assert.deepEqual(opts.tickers,['MBB']);assert.ok(j.trace.some(t=>t.agent==='backtest'&&t.status==='completed'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,j.id+'.json'))).report.backtest.simulationOnly,true);}finally{clean(dir);}
});
test('Backtest worker error becomes blocked research with no invented result',async()=>{const dir=temp();try{const r=new Research({dir,dataFile:'fixture',gateway:noAI,tools:{snapshot:async()=>snapshot(),backtest:async()=>{throw new Error('TEST NO HISTORY');}}}),j=r.create({question:'Backtest MBB',backtest:config});await wait(()=>!['queued','running'].includes(j.status));assert.equal(j.status,'blocked');assert.equal(j.report.backtest,undefined);assert.match(j.report.warnings.join(),/TEST NO HISTORY/);}finally{clean(dir);}});
test('Monitoring captures immutable fixed levels, deduplicates creation and survives restart',()=>{
 const dir=temp();try{const m=new Monitoring({dir,autoStart:false}),j=job(),r=m.create(j);j.report.strategies[0].targetReference.price=999;assert.equal(r.levels.MBB.target.price,120);assert.equal(m.create(j).id,r.id);m.setEnabled(r.id,false);const restored=new Monitoring({dir,autoStart:false});assert.equal(restored.records.get(r.id).enabled,false);assert.equal(restored.records.get(r.id).baseline.hash,hash('a'));restored.remove(r.id);assert.equal(new Monitoring({dir,autoStart:false}).records.size,0);}finally{clean(dir);}
});
test('Monitoring only creates from valid finished reports and limits stored records',()=>{const dir=temp();try{const m=new Monitoring({dir,autoStart:false});assert.throws(()=>m.create({...job(),status:'running'}));assert.throws(()=>m.create({...job(),report:{evidence:[]}}));for(let i=0;i<20;i++)m.create(job());assert.throws(()=>m.create(job()),/20/);assert.throws(()=>m.setEnabled(m.list()[0].id,'true'));}finally{clean(dir);}});
test('Monitoring detects directional fixed-level and MA50 crossings from fresh daily bars',()=>{const dir=temp();try{const m=new Monitoring({dir,autoStart:false}),r=m.create(job());m.apply(r,snapshot('2026-10-26',90,'b'));assert.deepEqual(r.events.map(e=>e.type),['stop_cross','ma50_cross']);assert.equal(r.events[0].level,95);assert.equal(r.events[0].source,'user_assumption');m.apply(r,snapshot('2026-10-27',125,'c'));assert.ok(r.events.some(e=>e.type==='target_cross'));assert.ok(r.events.some(e=>e.type==='entry_cross'));}finally{clean(dir);}});
test('Same snapshot never repeats events; older and corrected same-date data cannot fabricate temporal crossings',()=>{const dir=temp();try{const m=new Monitoring({dir,autoStart:false}),r=m.create(job());m.apply(r,snapshot('2026-10-26',90,'b'));const count=r.events.length;m.apply(r,snapshot('2026-10-26',90,'b'));assert.equal(r.status,'unchanged');assert.equal(r.events.length,count);m.apply(r,snapshot('2026-10-22',130,'older'));assert.equal(r.status,'older_snapshot');assert.equal(r.checkpoint.date,'2026-10-26');m.apply(r,snapshot('2026-10-26',130,'revision'));assert.equal(r.events.at(-1).type,'snapshot_revision');assert.equal(r.events.filter(e=>e.type==='target_cross').length,0);}finally{clean(dir);}});
test('Missing/stale symbol data suppresses price crossings, and recovery does not bridge the gap',()=>{const dir=temp();try{const m=new Monitoring({dir,autoStart:false}),r=m.create(job());m.apply(r,{...snapshot('2026-10-26',90,'b'),metrics:[]});assert.equal(r.events[0].type,'data_quality');m.apply(r,snapshot('2026-10-27',130,'c'));assert.equal(r.events.filter(e=>e.type==='target_cross').length,0);assert.equal(transitions({close:110,m50:100,dataQuality:'D0',regime:'UPTREND'},{close:80,m50:100,dataQuality:'STALE',regime:'UPTREND'},{stop:{price:95}}).some(e=>e.type==='stop_cross'),false);}finally{clean(dir);}});
test('Paused/deleted monitors do not update during an in-flight shared check; concurrent checks coalesce',async()=>{const dir=temp();try{let release,calls=0;const m=new Monitoring({dir,autoStart:false,snapshot:()=>{calls++;return new Promise(r=>release=r);}}),r=m.create(job()),other=m.create(job());const p=m.checkAll(),q=m.checkAll();m.setEnabled(r.id,false);m.remove(other.id);release(snapshot('2026-10-26',90,'b'));await Promise.all([p,q]);assert.equal(calls,1);assert.equal(r.checkpoint.date,'2026-10-23');assert.equal(m.records.size,1);}finally{clean(dir);}});
test('Source failures keep monitoring checkpoint and record error without inventing alerts',async()=>{const dir=temp();try{const m=new Monitoring({dir,autoStart:false,snapshot:async()=>{throw new Error('TEST SOURCE FAILURE');}}),r=m.create(job());await m.checkAll();assert.equal(r.status,'source_error');assert.equal(r.events.length,0);assert.equal(r.checkpoint.hash,hash('a'));assert.match(r.error,/TEST SOURCE/);}finally{clean(dir);}});
test('Monitoring event retention is bounded, persisted and duplicate-free',()=>{const dir=temp();try{const m=new Monitoring({dir,autoStart:false}),r=m.create(job());for(let i=0;i<250;i++)m.apply(r,snapshot('2026-10-23',i+100,'revision-'+i));assert.equal(r.events.length,200);assert.equal(r.droppedEvents,50);m.save();const restored=new Monitoring({dir,autoStart:false});assert.equal(restored.list()[0].events.length,200);assert.equal(new Set(r.events.map(e=>e.id)).size,200);}finally{clean(dir);}});
test('Monitoring shutdown does not persist a late source response',async()=>{const dir=temp();try{let release;const m=new Monitoring({dir,autoStart:false,snapshot:()=>new Promise(r=>release=r)}),r=m.create(job()),p=m.checkAll();m.shutdown();release(snapshot('2026-10-26',90,'b'));await p;assert.equal(r.checkpoint.date,'2026-10-23');assert.equal(m.status().running,false);}finally{clean(dir);}});
test('Monitoring API shares owner auth and CSRF, supports create/check/pause/delete and closes scheduler',async()=>{
 const dir=temp(),password='TEST-'+crypto.randomUUID(),{app,research,monitoring}=createApp({dir,env:{TRACKER_AI_ENABLED:'true',TRACKER_AI_PASSWORD_HASH:passwordHash(password)},gateway:noAI,tools:{snapshot:async()=>snapshot()}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 try{assert.equal((await fetch(base+'/api/ai/monitors')).status,401);const login=await fetch(base+'/api/ai/login',{method:'POST',headers:{Origin:base},body:JSON.stringify({password})}),auth=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie,Origin:base,'X-Tracker-CSRF':auth.csrf,'Content-Type':'application/json'};
 const j=job();research.jobs.set(j.id,j);assert.equal((await fetch(base+'/api/ai/monitors',{method:'POST',headers:{Cookie:cookie,Origin:base},body:JSON.stringify({jobId:j.id})})).status,403);
 const created=await fetch(base+'/api/ai/monitors',{method:'POST',headers,body:JSON.stringify({jobId:j.id})});assert.equal(created.status,201);const r=await created.json();
 assert.equal((await fetch(base+'/api/ai/monitors/check',{method:'POST',headers})).status,200);
 const paused=await fetch(base+'/api/ai/monitors/'+r.id,{method:'POST',headers,body:JSON.stringify({enabled:false})});assert.equal(paused.status,200);assert.equal((await paused.json()).enabled,false);
 assert.equal((await fetch(base+'/api/ai/monitors/'+r.id,{method:'DELETE',headers})).status,200);assert.equal(monitoring.records.size,0);
 }finally{research.shutdown();await new Promise(r=>app.close(r));assert.equal(monitoring.stopped,true);clean(dir);}
});
