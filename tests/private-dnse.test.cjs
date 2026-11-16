'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),vm=require('node:vm');
const M=require('../server/ai/private-market.cjs'),P=require('../tools/publish-snapshot.cjs'),Q=require('../public/shared/data-quality.js'),E=require('../tools/run-private-dnse-eod.cjs'),Pages=require('../tools/prepare-pages.cjs');
const {createApp,passwordHash}=require('../server/ai/server.cjs');
const root=path.resolve(__dirname,'..'),now=new Date('2026-11-14T02:00:00Z');
function fixture(){const rows=[];let day='2026-11-13';while(rows.length<220){if(Q.trading(day))rows.unshift([day,10,11,9,10,1000]);day=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);}return {meta:{schema:'shared-market-v1',isDemo:false,source:'DNSE TEST FIXTURE',sourceProviders:['DNSE'],snapshotKind:'EOD',asOf:'2026-11-13',symbolCount:2,rowCount:440,coverage:{attempted:2,failedTickers:[]}},symbols:[{ticker:'VNINDEX',rows},{ticker:'AAA',exchange:'HOSE',rows:structuredClone(rows)}]};}
function directory(){fs.mkdirSync(path.join(root,'work'),{recursive:true});return fs.mkdtempSync(path.join(root,'work/private-dnse-test-'));}
function storeFixture(){const p=fixture(),id=M.hash(p),entry={id,file:'snapshots/'+id+'.json.gz',kind:'EOD',tradingDate:p.meta.asOf},m={version:1,active:entry,history:[]},objects=new Map([['active.json',Buffer.from(JSON.stringify(m))],[entry.file,zlib.gzipSync(JSON.stringify(p))]]),writes=[];let failure=false;return {p,m,objects,writes,get failure(){return failure;},set failure(v){failure=v;},async assertPrivate(){if(failure)throw Error('TEST DOWN');},async get(name){if(failure||!objects.has(name))throw Error('TEST MISSING');return objects.get(name);},async put(name,b){if(failure)throw Error('TEST WRITE DOWN');writes.push(name);objects.set(name,b);}};}
test('DNSE tường minh: mặc định publisher vẫn KBS; không trộn nguồn hoặc nới missing gate',()=>{const p=fixture();assert.throws(()=>P.validate(p,null,{now}),/Nguồn thực/);assert.doesNotThrow(()=>P.validate(p,null,{now,sourceProvider:'DNSE'}));const old=structuredClone(p);old.meta.sourceProviders=['KBS'];assert.throws(()=>P.validate(p,old,{now,sourceProvider:'DNSE'}),/baseline/);p.meta.coverage.failedTickers=['UTT'];assert.throws(()=>P.validate(p,null,{now,sourceProvider:'DNSE'}),/Thiếu mã/);});
test('Kho REST từ chối bucket public, đường dẫn lạ; chỉ gửi secret tới URL Supabase cố định',async()=>{
 const requests=[],env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-secret-12345'};let pub=true;
 const store=new M.PrivateStore(env,{fetcher:async(url,options)=>{requests.push({url,options});return Response.json(url.includes('/bucket/')?{id:'tracker-dnse-private',public:pub}:{ok:true});}});
 await assert.rejects(store.assertPrivate(),/private/);pub=false;await store.assertPrivate();await store.get('active.json');await store.put('active.json',Buffer.from('{}'));
 assert.ok(requests.every(r=>r.url.startsWith('https://fixture.supabase.co/storage/v1/')));assert.ok(requests.some(r=>r.url.includes('/object/authenticated/tracker-dnse-private/active.json')));
 assert.equal(requests.at(-1).options.headers['x-upsert'],'true');assert.throws(()=>store.get('../keys'),/object/);assert.throws(()=>new M.PrivateStore({...env,SUPABASE_URL:'https://evil.test'}));
});
test('Cache DNSE dùng hash, giữ known-good khi mất nguồn/lùi phiên, không lưu dưới public',async()=>{
 const dir=directory();try{const s=storeFixture(),cache=new M.PrivateMarket({store:s,dir,clock:()=>+now,interval:0}),first=await cache.refresh();assert.equal(first.payload.meta.sourceProviders[0],'DNSE');assert.ok(fs.existsSync(first.file));s.failure=true;await assert.rejects(cache.asset('active.json'));assert.equal(cache.current,first);s.failure=false;
 const p=structuredClone(s.p);p.meta.asOf='2026-11-12';const m=structuredClone(s.m);m.active.tradingDate=p.meta.asOf;m.active.id=M.hash(p);m.active.file='snapshots/'+m.active.id+'.json.gz';s.objects.set('active.json',Buffer.from(JSON.stringify(m)));s.objects.set(m.active.file,zlib.gzipSync(JSON.stringify(p)));await assert.rejects(cache.refresh());assert.equal(cache.current,first);
 assert.throws(()=>new M.PrivateMarket({store:s,dir:path.join(root,'public')}),/ngoài public/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Phát hành private kiểm tra archive trước thay manifest; lỗi không thay active',async()=>{
 const dir=directory();try{const s=storeFixture();await E.restore(s,dir,now);const original=s.objects.get('active.json');
 const p=fixture();p.meta.generatedAt='2026-11-14T02:00:00Z';const file=path.join(dir,'candidate.json');fs.writeFileSync(file,JSON.stringify(p));P.publish(file,dir,{sourceProvider:'DNSE',now});
 const put=s.put.bind(s);s.put=async(name,b)=>{if(name.endsWith('.gz'))throw Error('TEST ARCHIVE WRITE FAILED');return put(name,b);};await assert.rejects(E.upload(s,dir,{now,previous:s.p}));assert.equal(s.objects.get('active.json'),original);
 s.put=put;await E.upload(s,dir,{now,previous:s.p});assert.equal(s.writes.at(-1),'active.json');assert.equal(M.manifest(s.objects.get('active.json')).active.id,M.hash(p));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Pages DNSE vẫn không chứa giá/Backtest/secret; HTML và token chỉ dùng endpoint riêng',()=>{
 const dir=directory();try{const site=Pages.prepare(path.join(dir,'site'),{marketDataMode:'dnse-owner-private',sourceProvider:'DNSE',automaticEod:true,publicMarketSnapshots:false,apiBase:'https://tracker-ai-free.onrender.com'}),html=fs.readFileSync(path.join(site,'index.html'),'utf8');
 assert.ok(html.includes('TRACKER_PRIVATE_MARKET_WEB = true'));assert.ok(html.includes('https://tracker-ai-free.onrender.com/api/ai/market/'));assert.equal(fs.existsSync(path.join(site,'data')),false);assert.equal(fs.existsSync(path.join(site,'backtest')),false);assert.ok(!html.includes('SUPABASE_SERVICE_ROLE_KEY'));
 for(const name of ['private-market-ui.js','automatic-data.js'])new vm.Script(fs.readFileSync(path.join(site,'shared',name),'utf8'));
 assert.throws(()=>M.renderIndex(html,{apiBase:'https://evil.test'}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Job DNSE không có quyền Pages/artifact; cờ tắt và ngày nghỉ không gọi nguồn',()=>{
 assert.equal(E.plan({},now).run,false);assert.equal(E.plan({TRACKER_DNSE_EOD_ENABLED:'true'},now).run,false);assert.equal(E.plan({TRACKER_DNSE_EOD_ENABLED:'true'},new Date('2026-11-16T09:17:00Z')).run,true);
 const w=fs.readFileSync(path.join(root,'.github/workflows/dnse-private-eod.yml'),'utf8');assert.ok(w.includes("cron: '17 9 * * 1-5'"));for(const unsafe of ['pages: write','upload-artifact','upload-pages-artifact','deploy-pages','git push'])assert.ok(!w.includes(unsafe));
});
test('HTTP: anon 401, User/Admin 403 cả dữ liệu và AI; Owner dùng bearer+CSRF; logout thu hồi phiên',async()=>{
 const dir=directory(),password='FIXTURE only 123456',origin='https://kalm-d.github.io',market={asset:async()=>({type:'application/json',bytes:Buffer.from('{"privateFixture":true}')})};
 const instance=createApp({dir,env:{TRACKER_AI_ENABLED:'true',TRACKER_AI_ALLOWED_ORIGIN:origin,TRACKER_AI_PASSWORD_HASH:passwordHash(password),TRACKER_MARKET_PRIVATE_DNSE:'true',GEMINI_API_KEY:'fixture-key',GEMINI_MODEL:'fixture-model',GEMINI_FREE_TIER_CONFIRMED:'true'},privateMarket:market,tools:{snapshot:async()=>({date:'2026-11-13',tickers:['AAA'],metrics:[],meta:{source:'DNSE FIXTURE'},quality:{status:'FRESH'},lastBars:{}})}});
 await new Promise(r=>instance.app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+instance.app.address().port;
 const call=(route,options={})=>fetch(base+route,options),login=async username=>{const r=await call('/api/ai/login',{method:'POST',headers:{Origin:origin},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.json();};
 try{
 assert.equal((await call('/api/ai/market/active.json')).status,401);for(const route of ['/data/market.json.gz','/%64ata/market.json','/shared/%2e%2e/data/market.json.gz'])assert.equal((await call(route)).status,404);
 const owner=await login('owner');assert.match(owner.token,/^[a-f0-9]{64}$/);assert.equal(instance.gateway.status().providers.length,0);
 for(const role of ['admin','user'])instance.accounts.create(instance.accounts.owner(),{username:role+'-fixture',role,password,canResearch:true});
 for(const role of ['admin','user']){const s=await login(role+'-fixture'),h={Authorization:'Bearer '+s.token,Origin:origin};for(const route of ['market/active.json','market/snapshots/'+'a'.repeat(64)+'.json.gz','jobs','monitors'])assert.equal((await call('/api/ai/'+route,{headers:h})).status,403);}
 const headers={Authorization:'Bearer '+owner.token,Origin:origin,'X-Tracker-CSRF':owner.csrf};const good=await call('/api/ai/market/active.json',{headers});assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'private, no-store');assert.equal(good.headers.get('access-control-allow-origin'),origin);
 const preflight=await call('/api/ai/market/active.json',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Headers':'authorization'}});assert.equal(preflight.status,204);assert.ok(preflight.headers.get('access-control-allow-headers').includes('Authorization'));
 assert.equal((await call('/api/ai/market/active.json',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
 assert.equal((await call('/api/ai/jobs',{method:'POST',headers,body:'{}'})).status,409);
 assert.equal((await call('/api/ai/logout',{method:'POST',headers:{Authorization:headers.Authorization,Origin:origin}})).status,403);
 assert.equal((await call('/api/ai/logout',{method:'POST',headers})).status,200);assert.equal((await call('/api/ai/market/active.json',{headers})).status,401);
 }finally{instance.dispose();await new Promise(r=>instance.app.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('Web Pages dùng bearer ở RAM, bỏ cookie bên thứ ba, chặn gửi token sai host và xóa view khi hết phiên',async()=>{
 const listeners={},password={value:'FIXTURE'},submit={},status={},logout={addEventListener:(name,fn)=>listeners[name]=fn},form={querySelector:s=>s==='input'?password:submit,addEventListener:(name,fn)=>listeners[name]=fn};
 const panel={style:{},querySelector:s=>s==='[role=status]'?status:s==='form'?form:logout},document={createElement:()=>panel,getElementById:()=>({before(){}}),addEventListener(){}};
 const calls=[];let expired=false,reloads=0,mounts=0;const root={TRACKER_PRIVATE_MARKET_WEB:true,TRACKER_PRIVATE_API_BASE:'https://tracker-ai-free.onrender.com'},automatic={mount(){mounts++;}};
 const fetcher=async(url,options)=>{calls.push({url,options});return url.endsWith('/session')?Response.json({error:'login'},{status:401}):url.endsWith('/login')?Response.json({role:'owner',token:'a'.repeat(64),csrf:'fixture-csrf'}):Response.json({ok:true},{status:expired?401:200});};
 const c=vm.createContext({window:root,document,location:{href:'https://kalm-d.github.io/tracker/',reload(){reloads++;}},fetch:fetcher,URL,TrackerAutomaticData:automatic});
 await vm.runInContext(fs.readFileSync(path.join(rootPath(),'public/shared/private-market-ui.js'),'utf8'),c);assert.equal(form.hidden,false);
 await listeners.submit({preventDefault(){}});assert.equal(mounts,1);assert.equal(password.value,'');
 await root.TrackerPrivateFetch('https://tracker-ai-free.onrender.com/api/ai/market/active.json');assert.equal(calls.at(-1).options.credentials,'omit');assert.equal(calls.at(-1).options.headers.Authorization,'Bearer '+'a'.repeat(64));assert.equal(calls.at(-1).options.redirect,'error');
 assert.throws(()=>root.TrackerPrivateFetch('https://evil.test/'),/máy chủ khác/);expired=true;await root.TrackerPrivateFetch('https://tracker-ai-free.onrender.com/api/ai/market/active.json');assert.equal(reloads,1);
 function rootPath(){return path.resolve(__dirname,'..');}
});
