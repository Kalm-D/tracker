'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const A=require('../server/ai/analyst.cjs'),C=require('../server/ai/contracts.cjs'),S=require('../server/ai/sources.cjs');
const {Research}=require('../server/ai/research.cjs'),{Gateway}=require('../server/ai/gateway.cjs'),{createApp,passwordHash}=require('../server/ai/server.cjs');
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'analyst-'));
async function finished(j){for(let i=0;i<500;i++){if(!['queued','running'].includes(j.status))return;await new Promise(r=>setTimeout(r,10));}throw Error('Hết thời gian kiểm thử');}
const snapshot=async()=>({tickers:['HPG'],metrics:[{ticker:'HPG',close:20900,trackerScore:42,trackerGrade:'Risky',sector:'Kim loại'}],lastBars:{HPG:{date:'2026-10-26',close:20900,volume:100}},priceSummaries:{HPG:{close:20900,volumeRatio20:.5}},date:'2026-10-26',sha256:'a'.repeat(64),engineVersion:'test',regime:{key:'SIDEWAY',desc:'Đi ngang'},meta:{source:'fixture'},audit:{}});
const result=id=>({summary:'Cần quan sát và đối chiếu nguồn.',claims:[{section:'risk',kind:'interpretation',text:'Kịch bản xấu: xu hướng yếu đi và mất thanh khoản; cần kiểm tra lại khi có dữ liệu mới.',evidenceIds:[id]}],limitations:['Chưa xác minh ngày công bố báo cáo.']});
test('Câu phân tích tổng quát lấy đủ nhóm; câu kỹ thuật và Backtest giữ tuyến cũ',()=>{
 for(const q of ['Phân tích HPG','đánh giá hpg','Nhận định HPG']){const p=C.plan(C.request({question:q}),new Set(['HPG']));assert.equal(p.fullAnalysis,true);assert.equal(p.fundamental,true);assert.equal(p.news,true);assert.deepEqual(p.tickers,['HPG']);}
 assert.equal(C.plan(C.request({question:'Phân tích kỹ thuật HPG'}),new Set(['HPG'])).fullAnalysis,false);
 assert.equal(C.plan(C.request({question:'Phân tích HPG',backtest:{start:'2026-09-01',end:'2026-10-01',capital:1e8,method:'both',acknowledge:true}}),new Set(['HPG'])).fullAnalysis,false);
});
test('Điểm tổng không bù dữ liệu thiếu; hạng tính bằng trọng số cấu hình',()=>{
 const m={ticker:'HPG',trackerScore:80,trackerGrade:'A'};
 const partial=A.composite(m);assert.equal(partial.total,null);assert.equal(partial.grade,null);assert.equal(partial.components.fundamental,null);
 const comps=Object.fromEntries(['fundamental','news','sector'].map(k=>[k,{score:70,basis:'deterministic_calculation',evidenceId:k}]));
 assert.equal(A.composite(m,comps).total,74);assert.equal(A.composite(m,comps).grade,'B');
 assert.equal(A.composite(m,{fundamental:{score:100,basis:'AI'}}).components.fundamental,null);
 assert.throws(()=>A.configuration({TRACKER_AI_ANALYST_CONFIG:'{"weights":{"technical":1}}'}));
 assert.throws(()=>A.configuration({TRACKER_AI_ANALYST_CONFIG:'{"grades":{"A":40,"B":60}}'}));
});
test('Hợp đồng Analyst bắt buộc risk và nguồn tài chính có cấu trúc, từ chối hạng bịa',()=>{
 const evidence=[{id:'t',type:'deterministic_calculation',close:20900},{id:'doc',type:'official_document',text:'EPS 1000'}];
 assert.doesNotThrow(()=>C.validateAnalyst(result('t'),evidence));
 assert.throws(()=>C.validateAnalyst({...result('t'),claims:[]},evidence));
 assert.throws(()=>C.validateAnalyst({...result('t'),summary:'Xếp hạng A'},evidence));
 assert.throws(()=>C.validateAnalyst({...result('t'),claims:[...result('t').claims,{section:'fundamental',text:'EPS 1000',kind:'source',evidenceIds:['doc']}]},evidence));
});
test('Mỗi câu tổng quát chỉ yêu cầu một lần tổng hợp sau khi thu thập đủ công cụ',async()=>{
 const dir=temporary(),calls=[];let count=0;
 try{
  const r=new Research({dir,dataFile:'fixture',tools:{snapshot,financial:async ticker=>{calls.push('fundamental');return {id:'f',type:'financial_statement',ticker,data:{tables:{profit:[{value:100}]}}};},news:async()=>{calls.push('news');return {id:'n',type:'news_discovery',tickers:['HPG'],items:[{title:'Tin'}]};},sectorNews:async sector=>{calls.push('sector');return {id:'s',type:'news_discovery',scope:'sector',sector,items:[{title:'Tin ngành'}]};}},gateway:{status:()=>({usage:{attempts:count}}),analyze:async(role,q,e)=>{count++;assert.equal(role,'analyst');assert.deepEqual(calls,['fundamental','news','sector']);return {result:result(e[0].id),provider:'fixture',model:'fixture'};}}});
  const j=r.create({question:'Phân tích HPG'});await finished(j);
  assert.equal(j.status,'blocked'); // RSS chưa xác minh bài gốc vẫn có cảnh báo.
  assert.equal(count,1);assert.equal(j.report.analyses.length,1);assert.equal(j.report.coverage.missing.length,0);
  assert.equal(j.report.composite[0].total,null);assert.equal(j.report.marketContext.setupPerformance,null);
  assert.equal(j.report.evidence[0].priceSummaries.HPG.close,20900);r.shutdown();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Công cụ treo/lỗi vẫn giữ phần có nguồn và ghi phần thiếu',async()=>{
 const dir=temporary();
 try{
  const r=new Research({dir,dataFile:'fixture',analystConfig:A.configuration({TRACKER_AI_ANALYST_CONFIG:'{"toolTimeoutMs":100}'}),tools:{snapshot,financial:async()=>new Promise(()=>{}),news:async()=>{throw Error('RSS tạm lỗi');},sectorNews:async()=>({id:'sector',type:'news_discovery',items:[]})},gateway:{status:()=>({usage:{}}),analyze:async(role,q,e)=>({result:result(e[0].id)})}});
  const j=r.create({question:'Phân tích HPG'});await finished(j);
  assert.equal(j.status,'blocked');assert.equal(j.report.evidence[0].metrics[0].close,20900);assert.ok(j.report.warnings.some(x=>x.includes('hết thời gian')));assert.ok(j.report.coverage.missing.includes('HPG: fundamental'));assert.equal(j.report.analyses.length,1);r.shutdown();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Câu hỏi riêng tư bị chặn trước mọi yêu cầu tới model',async()=>{
 const dir=temporary();let calls=0;
 try{
  const gateway=new Gateway(dir,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'fixture',GEMINI_FREE_TIER_CONFIRMED:'true'},async()=>{calls++;throw Error('Không được gọi');});
  for(const q of ['HPG giá vốn 20000','danh mục của tôi gồm HPG','I hold 200 HPG','api_key=secret','NAV 500 triệu','Liên hệ test@example.com'])await assert.rejects(gateway.analyze('analyst',q,[]),/riêng tư/);
  assert.equal(calls,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('RSS bỏ tin trùng, gắn cờ tin cũ và không truyền câu hỏi riêng tư',async()=>{
 let query;
 const xml='<rss>'+[1,2].map(()=>'<item><title>HPG cập nhật</title><link>https://news.google.com/rss/articles/test</link><pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate><description>Đoạn trích ngắn</description></item>').join('')+'</rss>';
 const e=await S.newsDiscovery('giá vốn 123456',['HPG'],{clock:()=>Date.parse('2026-10-27'),fetcher:async url=>{query=url.href;return new Response(xml);}});
 assert.equal(e.items.length,1);assert.equal(e.items[0].stale,true);assert.ok(e.items[0].publishedAtISO);assert.ok(!query.includes('123456'));assert.equal(e.items[0].excerpt,'Đoạn trích ngắn');
});
test('SSE yêu cầu đăng nhập, gửi tiến độ thật và dọn listener khi đóng',async()=>{
 const dir=temporary(),password='fixture-password-only';
 const {app,research}=createApp({env:{TRACKER_AI_ENABLED:'true',TRACKER_AI_PASSWORD_HASH:passwordHash(password)},dir,gateway:{status:()=>({usage:{}})},tools:{snapshot}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 let reader;
 try{
  const login=await fetch(base+'/api/ai/login',{method:'POST',headers:{Origin:base},body:JSON.stringify({password})}),s=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
  const j={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',status:'running',trace:[],request:{question:'fixture'}};research.jobs.set(j.id,j);
  const url=base+'/api/ai/jobs/'+j.id+'/events';
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{headers:{Cookie:cookie,Origin:base}});assert.match(response.headers.get('content-type'),/event-stream/);
  reader=response.body.getReader();let chunk=new TextDecoder().decode((await reader.read()).value);assert.match(chunk,/event: job/);assert.match(chunk,/"status":"running"/);
  j.status='completed';research.events.emit('job',j);
  chunk=new TextDecoder().decode((await reader.read()).value);assert.match(chunk,/"status":"completed"/);
  assert.equal(research.events.listenerCount('job'),0);assert.equal((await reader.read()).done,true);
  assert.ok(s.csrf);
 }finally{await reader?.cancel().catch(()=>{});research.jobs.clear();research.shutdown();await new Promise(r=>app.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});

test('Gateway Analyst dùng schema theo mục, xác minh phản hồi và dùng cache',async()=>{
 const dir=temporary();let generation=0;
 try{
  const g=new Gateway(dir,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'fixture-model',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,options)=>{
   if(!options.method)return Response.json({models:[{name:'models/fixture-model'}]});
   generation++;const body=JSON.parse(options.body);
   assert.ok(body.generationConfig.responseJsonSchema.properties.claims.items.required.includes('section'));
   assert.match(body.systemInstruction.parts[0].text,/không tự chấm/);
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result('t'))}]}}],usageMetadata:{totalTokenCount:100}});
  });
  const e=[{id:'t',type:'deterministic_calculation'}];
  assert.equal((await g.analyze('analyst','Phân tích HPG',e)).result.claims[0].section,'risk');
  assert.equal((await g.analyze('analyst','Phân tích HPG',e)).cached,true);assert.equal(generation,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Giao diện Analyst giữ nội dung nguồn thành văn bản và không tạo link nguy hiểm',()=>{
 const vm=require('node:vm'),nodes=[];
 const document={createElement:tag=>{const n={tag,children:[],append(...v){this.children.push(...v);},set textContent(v){this.text=v;},get textContent(){return this.text;},set innerHTML(v){throw Error('Không được tạo HTML từ nguồn');}};nodes.push(n);return n;}};
 const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/ai/analyst-ui.js'),'utf8'),{window,document,URL});
 const body=document.createElement('main'),report={composite:[A.composite({ticker:'HPG',trackerScore:42})],analyses:[{role:'analyst',provider:'fixture',model:'fixture',result:result('n')}],evidence:[{id:'n',type:'news_discovery',url:'javascript:alert(1)',items:[{title:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'}]}]};
 window.TrackerAIAnalystUI.render(body,report);
 assert.equal(body.children.length,8);assert.ok(nodes.some(n=>n.text==='<img src=x onerror=alert(1)>'));assert.ok(!nodes.some(n=>n.href?.startsWith('javascript:')));
});


test('Ngữ cảnh RSS bỏ URL dài/đoạn trích lặp, giữ ngày và không sửa nguồn gốc',()=>{
 const {projectEvidence}=require('../server/ai/gateway.cjs');
 const items=Array.from({length:8},(_,i)=>({title:'Tin '+i,publishedAtISO:'2026-10-'+String(i+1).padStart(2,'0')+'T00:00:00Z',url:'https://example.test/'+('x'.repeat(3000)),excerpt:'Không gửi đoạn trích lặp',publisher:'Nguồn',stale:false}));
 const source={id:'news',type:'news_discovery',items,limitation:'Chưa kiểm chứng'};
 const v=projectEvidence(source,{role:'analyst',newsLimit:4});
 assert.equal(v.items.length,4);assert.equal(v.items[0].title,'Tin 7');assert.equal(v.items[0].publishedAt,'2026-10-08T00:00:00Z');
 assert.ok(!JSON.stringify(v).includes('https://'));assert.equal(source.items.length,8);assert.ok(source.items[0].url);
 assert.equal(v.itemsAvailable,8);assert.equal(v.itemsShown,4);
});
test('Gemini 3 dùng mức suy luận LOW và không gửi temperature đã lỗi thời',async()=>{
 const dir=temporary();
 try{
  const g=new Gateway(dir,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'gemini-3.8-flash',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,o)=>{
   if(!o.method)return Response.json({models:[{name:'models/gemini-3.8-flash'}]});
   const body=JSON.parse(o.body);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'LOW');assert.equal(body.generationConfig.temperature,undefined);assert.ok(body.generationConfig.maxOutputTokens>=3200);
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result('t'))}]}}],usageMetadata:{totalTokenCount:100}});
  });
  assert.equal(g.providerTimeoutMs,90000);assert.equal(g.newsLimit,4);await g.analyze('analyst','Phân tích HPG',[{id:'t'}]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Phản hồi bị cắt không thành báo cáo hợp lệ và chỉ ghi mã chẩn đoán an toàn',async()=>{
 const dir=temporary(),events=[];
 try{
  const g=new Gateway(dir,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,o)=>!o.method?Response.json({models:[{name:'models/test-model'}]}):Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'SENSITIVE_PARTIAL_OUTPUT'}]}}],usageMetadata:{totalTokenCount:123}}),{onEvent:(event,data)=>events.push({event,...data})});
  await assert.rejects(g.analyze('analyst','Phân tích HPG',[{id:'t'}]),/bị cắt/);
  assert.ok(events.some(e=>e.reasonCode==='output_limit'));assert.ok(!JSON.stringify(events).includes('SENSITIVE_PARTIAL_OUTPUT'));assert.equal(g.status().usage.actualTokens,123);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Timeout và cấu hình sai không lộ thông báo nguồn hoặc vượt trần cấu hình',async()=>{
 const dir=temporary(),events=[];
 try{
  const g=new Gateway(dir,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,o)=>{if(!o.method)return Response.json({models:[{name:'models/test-model'}]});throw new DOMException('SECRET_UPSTREAM_DETAIL','TimeoutError');},{onEvent:(event,data)=>events.push({event,...data})});
  await assert.rejects(g.analyze('analyst','Phân tích HPG',[{id:'t'}]),/thời gian chờ/);
  assert.ok(events.some(e=>e.reasonCode==='provider_timeout'));assert.ok(!JSON.stringify(events).includes('SECRET_UPSTREAM_DETAIL'));
  for(const env of [{AI_PROVIDER_TIMEOUT_MS:'0'},{GEMINI_THINKING_LEVEL:'INVALID'},{AI_MAX_NEWS_ITEMS:'99'}])assert.ok(new Gateway(dir,env).status().policyProblems.length);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

