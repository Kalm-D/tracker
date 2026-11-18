'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),Q=require('../public/shared/data-quality.js'),P=require('../tools/publish-snapshot.cjs'),A=require('../tools/prepare-automatic-pages.cjs'),C=require('../public/shared/automatic-data.js'),E=require('../tools/run-automatic-eod.cjs');
const now=new Date('2026-11-14T02:00:00Z');
// Cấu hình giả chỉ dùng trong test; không phải bằng chứng quyền nguồn thật.
const fixtureConfig={enabled:true,provider:'KBS',rights:{status:'verified',reference:'TEST FIXTURE — không dùng production'}};
function fixture(){
  const rows=[];let day='2026-11-13';while(rows.length<220){if(Q.trading(day))rows.unshift([day,10,11,9,10,1000]);day=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);}
  return {meta:{schema:'shared-market-v1',isDemo:false,asOf:'2026-11-13',source:'KBS · TEST FIXTURE',sourceProviders:['KBS'],snapshotKind:'EOD',symbolCount:2,rowCount:440,coverage:{attempted:2,failedTickers:[]}},symbols:[{ticker:'VNINDEX',exchange:'INDEX',rows},{ticker:'AAA',exchange:'HOSE',rows:structuredClone(rows)}]};
}
function folder(){fs.mkdirSync(path.join(root,'work'),{recursive:true});return fs.mkdtempSync(path.join(root,'work/auto-eod-test-'));}
function dataset(dir){const file=path.join(dir,'candidate.json');fs.writeFileSync(file,JSON.stringify(fixture()));const out=path.join(dir,'published');P.publish(file,out,{now});return out;}
test('Production vẫn chặn quyền chưa xác minh; không tạo artifact hay bật policy',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'config/public-eod.json'),'utf8'));
  assert.throws(()=>A.prepare({config,dataDir:'không cần đọc',target:'không cần tạo',now}),/PUBLIC_EOD_NOT_CLEARED/);
  for(const change of [c=>c.enabled=false,c=>c.rights.status='pending',c=>c.rights.reference='',c=>c.provider='VCI']){const c=structuredClone(fixtureConfig);change(c);assert.throws(()=>A.gate(c),/PUBLIC_EOD_NOT_CLEARED/);}
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'public/deployment-policy.json'),'utf8')).automaticEod,false);
});
test('Artifact EOD giả nối đúng UI, byte snapshot/rollback nguyên vẹn, không lộ Backtest/log',()=>{
  const dir=folder();try{
    const data=dataset(dir),before=fs.readFileSync(path.join(data,'market.json.gz'));fs.writeFileSync(path.join(data,'private-export.csv'),'KHÔNG CÔNG BỐ');
    const target=path.join(dir,'site'),result=A.prepare({config:fixtureConfig,dataDir:data,target,now});
    assert.equal(result.quality,'FRESH');assert.equal(result.asOf,'2026-11-13');
    assert.deepEqual(fs.readFileSync(path.join(target,'data/market.json.gz')),before);
    assert.deepEqual(fs.readFileSync(path.join(data,'market.json.gz')),before);
    assert.equal(fs.existsSync(path.join(target,'backtest')),false);assert.equal(fs.existsSync(path.join(target,'data/private-export.csv')),false);
    const html=fs.readFileSync(path.join(target,'index.html'),'utf8');
    assert.ok(html.includes('window.TRACKER_PERSONAL_WEB = false'));assert.ok(html.includes('shared/automatic-data.js'));assert.ok(!html.includes('src="./shared/personal-ui.js"'));
    assert.ok(html.includes('await window.refreshTrackerSharedMarketData();return;'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(target,'deployment-policy.json'),'utf8')).automaticEod,true);
    // Mọi inline/external script trong artifact phải parse được ở cùng scope cũ.
    const scripts=[];for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(/type=["'](?!text\/javascript|application\/javascript|module)[^"']+/i.test(m[1]))continue;
      const src=m[1].match(/src=["']([^"']+)/)?.[1];if(src&&/^https?:/.test(src))continue;
      scripts.push(src?fs.readFileSync(path.join(target,src.split(/[?#]/)[0]),'utf8'):m[2]);
    }new vm.Script(scripts.join('\n;\n'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Không đóng gói JSON/gzip lệch, archive sai hash hoặc snapshot trễ; không thay dữ liệu trước',()=>{
  const dir=folder();try{
    const data=dataset(dir),raw=fs.readFileSync(path.join(data,'market.json')),manifest=JSON.parse(fs.readFileSync(path.join(data,'active.json'),'utf8'));
    fs.writeFileSync(path.join(data,'market.json'),'{}');assert.throws(()=>A.prepare({config:fixtureConfig,dataDir:data,target:path.join(dir,'bad-pair'),now}),/audit/);
    assert.equal(fs.existsSync(path.join(dir,'bad-pair')),false);fs.writeFileSync(path.join(data,'market.json'),raw);
    const archive=path.join(data,manifest.active.file),bytes=fs.readFileSync(archive),p=JSON.parse(zlib.gunzipSync(bytes));p.meta.source+=' CHANGED';fs.writeFileSync(archive,zlib.gzipSync(JSON.stringify(p)));
    assert.throws(()=>A.prepare({config:fixtureConfig,dataDir:data,target:path.join(dir,'bad-hash'),now}),/Hash archive/);fs.writeFileSync(archive,bytes);
    assert.throws(()=>A.prepare({config:fixtureConfig,dataDir:data,target:path.join(dir,'delayed'),now:new Date('2026-11-16T10:00:00Z')}),/thiếu phiên/);
    assert.deepEqual(fs.readFileSync(path.join(data,'market.json')),raw);
    assert.equal(fs.existsSync(path.join(dir,'bad-hash')),false);assert.equal(fs.existsSync(path.join(dir,'delayed')),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function client(){
  const payload=fixture(),id=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),entry={id,file:'snapshots/'+id+'.json.gz',tradingDate:payload.meta.asOf,kind:'EOD'};
  const state={rawRows:[],dataMeta:null},calls=[],controls={manifest:{version:1,active:entry},failure:false};let applied=0;
  const fetch=async url=>{calls.push(url);if(controls.failure)throw Error('OFFLINE');return new Response(JSON.stringify(controls.manifest));};
  const window={Response,DecompressionStream,crypto:crypto.webcrypto,TrackerDataQuality:Q};
  const context=vm.createContext({window,document:{baseURI:'https://example.test/tracker/',currentScript:{src:'https://example.test/tracker/shared/market-data.js'}},URL,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,fetch:async url=>{calls.push(url);assert.match(url,/^https:\/\/example\.test\/tracker\/data\/snapshots\/[a-f0-9]{64}\.json\.gz$/);return new Response(zlib.gzipSync(JSON.stringify(payload)));}});
  vm.runInContext(fs.readFileSync(path.join(root,'public/shared/market-data.js'),'utf8'),context);
  const app=C.controller({fetch,load:window.SharedMarketData.load,bridge:{getState:()=>state,loadRows(rows,label,meta){applied++;state.rawRows=rows;state.dataMeta=meta;return true;}},quality:Q,base:'https://example.test/tracker/',now:()=>now});
  return {app,state,calls,controls,entry,applied:()=>applied};
}
test('Tải manifest → gzip fixture qua loader hiện hành, gộp request, không gọi API nguồn',async()=>{
  const c=client();const [a,b]=await Promise.all([c.app.refresh(),c.app.refresh()]);
  assert.equal(a,b);assert.equal(c.applied(),1);assert.equal(c.state.rawRows.length,440);assert.equal(a.quality.status,'FRESH');assert.equal(a.personalUseOnly,false);
  assert.equal(c.calls.length,2);assert.ok(c.calls.every(url=>url.startsWith('https://example.test/tracker/data/')));
});
test('Mạng lỗi, manifest độc hại/sai hash hoặc lùi phiên giữ dữ liệu trước và báo trễ',async()=>{
  const c=client();await c.app.refresh();const rows=c.state.rawRows;
  c.controls.failure=true;await assert.rejects(c.app.refresh(),/OFFLINE/);assert.equal(c.state.rawRows,rows);assert.equal(c.state.dataMeta.quality.status,'DELAYED');
  c.controls.failure=false;c.controls.manifest.active={...c.entry,file:'https://other.test/prices'};await assert.rejects(c.app.refresh(),/Manifest/);assert.equal(c.applied(),1);
  c.controls.manifest.active={...c.entry,id:'0'.repeat(64),file:'snapshots/'+'0'.repeat(64)+'.json.gz'};await assert.rejects(c.app.refresh(),/không khớp manifest/);assert.equal(c.state.rawRows,rows);
  c.controls.manifest.active=c.entry;c.state.dataMeta.asOf='2026-11-16';await assert.rejects(c.app.refresh(),/lùi phiên/);assert.equal(c.applied(),1);
});
test('Lịch EOD dùng cùng calendar; config tắt không gọi nguồn, ngày nghỉ/trước đóng cửa không chạy',()=>{
  assert.equal(E.plan({enabled:false},now).run,false);
  assert.equal(E.plan(fixtureConfig,now).run,false);
  assert.equal(E.plan(fixtureConfig,new Date('2026-11-16T06:00:00Z')).run,false);
  assert.equal(E.plan(fixtureConfig,new Date('2026-11-16T09:17:00Z')).run,true);
  assert.equal(E.plan(fixtureConfig,new Date('2026-09-02T09:17:00Z')).run,false);
  assert.throws(()=>E.plan({...fixtureConfig,rights:{status:'pending'}},now),/PUBLIC_EOD_NOT_CLEARED/);
  assert.throws(()=>E.plan(fixtureConfig,new Date('2027-01-08T09:17:00Z')),/Lịch giao dịch/);
});
test('Khôi phục snapshot trước theo manifest/hash, không bootstrap ngầm khi HTTP hoặc archive lỗi',async()=>{
  const dir=folder();try{
    const source=dataset(dir),out=path.join(dir,'restored'),manifest=fs.readFileSync(path.join(source,'active.json'));
    const fetcher=async url=>new Response(url.endsWith('active.json')?manifest:fs.readFileSync(path.join(source,JSON.parse(manifest).active.file)));
    await E.restore(out,{fetcher,now});
    assert.deepEqual(fs.readFileSync(path.join(out,'market.json.gz')),fs.readFileSync(path.join(source,'market.json.gz')));
    await assert.rejects(E.restore(path.join(dir,'missing'),{fetcher:async()=>new Response('',{status:404}),now}),/HTTP 404/);
    const m=JSON.parse(manifest);m.active.file='../outside.json.gz';
    await assert.rejects(E.restore(path.join(dir,'unsafe'),{fetcher:async()=>new Response(JSON.stringify(m)),now}),/Archive trước/);
    await assert.rejects(E.restore(path.join(dir,'corrupt'),{fetcher:async url=>new Response(url.endsWith('active.json')?manifest:zlib.gzipSync('{}')),now}),/không khớp/);
    assert.equal(fs.existsSync(path.join(dir,'missing')),false);assert.equal(fs.existsSync(path.join(dir,'unsafe')),false);assert.equal(fs.existsSync(path.join(dir,'corrupt')),false);
    await assert.rejects(E.run({config:fixtureConfig,now:new Date('2026-11-13T10:00:00Z'),bootstrap:path.join(dir,'candidate.json')}),/BOOTSTRAP_NOT_REVIEWED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Lịch và UI deploy dùng một khóa, source gate đứng trước pip/export/upload và HEAD được kiểm tra',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/automatic-eod.yml'),'utf8'),ui=fs.readFileSync(path.join(root,'.github/workflows/tracker-ui-pages.yml'),'utf8');
  assert.ok(!workflow.includes('schedule:'));assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
  for(const s of [workflow,ui]){assert.ok(s.includes('group: tracker-pages-publish'));assert.ok(s.includes('cancel-in-progress: false'));assert.ok(s.includes('git rev-parse origin/main'));}
  assert.ok(workflow.indexOf('--plan')<workflow.indexOf('pip install'));assert.ok(workflow.indexOf('--publish')<workflow.indexOf('upload-pages-artifact'));
  assert.ok(ui.includes('run-automatic-eod.cjs --ui-only'));assert.ok(!workflow.includes('upload-artifact@'));
});
