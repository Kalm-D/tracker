'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {TokenManager}=require('../server/ai/token-manager.cjs'),{Gateway}=require('../server/ai/gateway.cjs'),{sharedSnapshot}=require('../server/ai/shared-snapshot.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ai-recovery-'));
const clean=p=>fs.rmSync(p,{recursive:true,force:true});
test('Usage đã xác nhận thay giữ chỗ; usage chưa biết vẫn giữ nguyên và không sửa lượt cũ',()=>{
 const dir=temp();try{const t=new TokenManager(dir),a=t.reserve('gemini','fixture',1000);t.settle(a,'gemini',{totalTokenCount:300,promptTokenCount:200,candidatesTokenCount:100});const b=t.reserve('gemini','fixture',100);t.settle(b,'gemini',null);assert.equal(t.status().chargedTokens,400);assert.equal(t.status().reservedTokens,1100);assert.equal(t.status().unknownUsageResponses,1);assert.equal(new TokenManager(dir).status().chargedTokens,400);}finally{clean(dir);}
});
test('Quota trượt qua ngày UTC trả đúng thời điểm phục hồi và chưa tạo giữ chỗ mới',()=>{
 const dir=temp();let now=Date.parse('2026-10-29T23:59:59Z');try{const t=new TokenManager(dir,{GEMINI_MAX_TPD:'100'},()=>now);t.reserve('gemini','fixture',70);now+=2000;assert.throws(()=>t.reserve('gemini','fixture',40),e=>e.code==='AI_QUOTA_WINDOW'&&e.details.available===30&&e.details.retryAt===Date.parse('2026-10-29T23:59:59Z')+86400001);assert.equal(t.status().attempts,0);}finally{clean(dir);}
});
test('Đếm đúng input Gemini giúp yêu cầu tiếng Việt vào hạn mức; POST generation chỉ chạy một lần',async()=>{
 const dir=temp();let counted=0,generated=0;const answer={summary:'Cần theo dõi rủi ro.',claims:[{section:'risk',kind:'interpretation',text:'Nếu xu hướng suy yếu cần kiểm tra lại nguồn.',evidenceIds:['t']}],limitations:[]};
 try{const g=new Gateway(dir,{GEMINI_API_KEY:'fixture-secret',GEMINI_MODEL:'gemini-3.5-flash-lite',GEMINI_FREE_TIER_CONFIRMED:'true',AI_MAX_DAILY_TOKENS:'10000',GEMINI_MAX_TPD:'10000'},async(url,o)=>{
  if(!o.method)return Response.json({models:[{name:'models/gemini-3.5-flash-lite'}]});
  if(url.endsWith(':countTokens')){counted++;const b=JSON.parse(o.body);assert.equal(b.generateContentRequest.model,'models/gemini-3.5-flash-lite');assert.ok(b.generateContentRequest.systemInstruction);return Response.json({totalTokens:1000});}
  generated++;const request=JSON.parse(o.body);assert.deepEqual(request.generationConfig.responseJsonSchema.properties.claims.items.properties.evidenceIds.items.enum,['t']);const saved=JSON.parse(fs.readFileSync(path.join(dir,'usage.json')));assert.equal(saved.days[new Date().toISOString().slice(0,10)].attempts,1);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}],usageMetadata:{totalTokenCount:900,promptTokenCount:500,candidatesTokenCount:400}});
 });const result=await g.analyze('analyst','Phân tích MSR',[{id:'t',text:'Nguồn công khai '.repeat(1500)}],{mode:'Standard'});assert.equal(counted,1);assert.equal(generated,1);assert.ok(result.estimatedTokens<10000);assert.equal(g.status().usage.chargedTokens,900);assert.ok(!fs.readFileSync(path.join(dir,'usage.json'),'utf8').includes('fixture-secret'));}finally{clean(dir);}
});
test('CountTokens lỗi thì giữ ước tính bảo thủ; ngân sách chặn trước mọi generation',async()=>{
 const dir=temp();let generated=0;try{const g=new Gateway(dir,{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'gemini-3.5-flash-lite',GEMINI_FREE_TIER_CONFIRMED:'true',AI_MAX_DAILY_TOKENS:'1000'},async(url,o)=>{if(!o.method)return Response.json({models:[{name:'models/gemini-3.5-flash-lite'}]});if(url.endsWith(':countTokens'))return new Response('PRIVATE_ERROR',{status:503});generated++;throw Error('Không được sinh');});await assert.rejects(g.analyze('analyst','Phân tích MSR',[{id:'t'}]),e=>e.code==='AI_BUDGET_DAY'&&!e.message.includes('PRIVATE_ERROR'));assert.equal(generated,0);assert.equal(g.status().usage.attempts,0);}finally{clean(dir);}
});
test('Snapshot mới được kiểm tra trước thay; ETag tránh tải lại và nguồn lỗi giữ bản tốt',async()=>{
 const dir=temp(),file=path.join(dir,'market.json.gz');let now=1000,calls=0;fs.writeFileSync(file,JSON.stringify({date:'2026-10-28',sha256:'old'}));
 try{const source=sharedSnapshot(file,{clock:()=>now,intervalMs:100,parse:async f=>JSON.parse(fs.readFileSync(f)),fetcher:async(_u,o)=>{calls++;if(calls===1)return new Response(JSON.stringify({date:'2026-10-29',sha256:'new'}),{headers:{etag:'version-new'}});assert.equal(o.headers['If-None-Match'],'version-new');if(calls===2)return new Response(null,{status:304});return new Response('Unavailable',{status:503});}});
 assert.equal((await source.read()).date,'2026-10-29');await source.read();assert.equal(calls,1);now+=101;assert.equal((await source.read()).date,'2026-10-29');now+=101;const result=await source.read();assert.match(result.refresh.warning,/Chưa đồng bộ/);assert.equal(JSON.parse(fs.readFileSync(file)).sha256,'new');assert.deepEqual(fs.readdirSync(dir),['market.json.gz']);}finally{clean(dir);}
});
test('Snapshot lỗi định dạng hoặc lùi ngày không thay tệp đang chạy',async()=>{
 for(const value of ['not-json',JSON.stringify({date:'2026-10-27',sha256:'older'})]){const dir=temp(),file=path.join(dir,'market.json.gz'),old=JSON.stringify({date:'2026-10-28',sha256:'old'});fs.writeFileSync(file,old);try{const source=sharedSnapshot(file,{parse:async f=>JSON.parse(fs.readFileSync(f)),fetcher:async()=>new Response(value)});assert.equal((await source.read()).date,'2026-10-28');assert.equal(fs.readFileSync(file,'utf8'),old);}finally{clean(dir);}}
});
test('Giao diện nói rõ đã có tin và AI bị quota, không thay bằng thiếu dữ liệu chung',()=>{
 class Node{constructor(){this.children=[];this.textContent='';}append(...n){this.children.push(...n);}}
 const window={},document={createElement:()=>new Node()};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/ai/analyst-ui.js'),'utf8'),{window,document,URL});const body=new Node();window.TrackerAIAnalystUI.render(body,{composite:[],analyses:[],evidence:[{id:'n',type:'news_discovery',items:[{title:'Tin công khai',url:'https://news.google.com/rss/test'}]}],issues:[{stage:'analyst',code:'AI_QUOTA_WINDOW',message:'Chưa gọi AI: quota 24 giờ chưa đủ.'}]});
 const text=n=>[n.textContent,...n.children.map(text)].join(' '),visible=text(body);assert.match(visible,/Đã lấy 1 tiêu đề tin/);assert.match(visible,/quota 24 giờ/);assert.ok(!visible.includes('Chưa đủ dữ liệu hoặc chưa có nhận định'));
});

test('BCTC gửi đủ tổng tài sản, nợ, vốn và dòng tiền; loại ratio quá cũ khỏi diễn giải hiện tại',()=>{
 const {projectEvidence}=require('../server/ai/gateway.cjs');
 const rows=[...Array.from({length:25},(_,i)=>({item:'Tài sản khác',item_id:'other_assets_'+i,'2026-Q3':i})),...['total_assets','liabilities','short_term_borrowings','long_term_borrowings','owners_equity'].map(item_id=>({item:item_id,item_id,'2026-Q3':100,'2026-Q2':90}))];
 const p=projectEvidence({type:'financial_statement',data:{staleTables:['ratio'],tables:{balance_sheet:rows,ratio:[{item:'P/E',item_id:'pe_ratio','2018-Q4':4}]}}},{role:'analyst'});
 for(const id of ['total_assets','liabilities','short_term_borrowings','long_term_borrowings','owners_equity'])assert.ok(p.data.tables.balance_sheet.some(x=>x.item_id===id));assert.deepEqual(p.data.tables.ratio,[]);
});

test('Gateway chỉ lưu phần đã khớp nguồn, cache không chứa số bị loại và không gọi model lần hai',async()=>{
 const dir=temp();let posts=0;const value={summary:'Cần theo dõi bằng chứng.',claims:[{section:'technical',kind:'source',text:'Giá snapshot 66000.',evidenceIds:['t']},{section:'fundamental',kind:'source',text:'Lợi nhuận 987654321.',evidenceIds:['t']},{section:'risk',kind:'interpretation',text:'Nếu xu hướng suy yếu cần kiểm tra lại.',evidenceIds:['t']}],limitations:[]};
 try{const g=new Gateway(dir,{GEMINI_API_KEY:'fixture-secret',GEMINI_MODEL:'test-model',GEMINI_FREE_TIER_CONFIRMED:'true'},async(url,o)=>{if(!o.method)return Response.json({models:[{name:'models/test-model'}]});posts++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{totalTokenCount:400,promptTokenCount:300,candidatesTokenCount:100}});});const e=[{id:'t',type:'deterministic_calculation',metrics:[{ticker:'MSR',close:66000}]}];const a=await g.analyze('analyst','Phân tích MSR',e);assert.equal(a.audit.discardedClaims,1);assert.equal(a.result.claims.length,2);require('../server/ai/contracts.cjs').validateAnalyst(a.result,e);assert.equal((await g.analyze('analyst','Phân tích MSR',e)).cached,true);assert.equal(posts,1);assert.equal(g.status().usage.chargedTokens,400);for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.cache.json')))assert.ok(!fs.readFileSync(path.join(dir,name),'utf8').includes('987654321'));}finally{clean(dir);}
});

test('Thứ tự khóa JSONB không làm model đọc nhầm quý cũ thành quý mới',()=>{
 const {projectEvidence}=require('../server/ai/gateway.cjs');const p=projectEvidence({type:'financial_statement',data:{tables:{income_statement:[{item:'Doanh thu',item_id:'sales','2025-Q4':1,'2026-Q1':2,'2026-Q2':3,'2026-Q3':4}]}}});const row=p.data.tables.income_statement[0];assert.ok(Object.hasOwn(row,'2026-Q3'));assert.ok(Object.hasOwn(row,'2026-Q2'));assert.ok(!Object.hasOwn(row,'2025-Q4'));assert.ok(!Object.hasOwn(row,'2026-Q1'));
});

test('Câu hỏi tự nhiên về mã hoặc thị trường được tổng hợp, không bắt nhập đúng mẫu câu',()=>{
 const C=require('../server/ai/contracts.cjs');for(const question of ['MSR có gì đáng chú ý?','MSR hiện thế nào?','Thị trường hôm nay thế nào?'])assert.equal(C.plan(C.request({question}),new Set(['MSR'])).fullAnalysis,true);assert.equal(C.plan(C.request({question:'Phân tích kỹ thuật MSR'}),new Set(['MSR'])).fullAnalysis,false);assert.equal(C.plan(C.request({question:'Phân tích cơ bản MSR'}),new Set(['MSR'])).fullAnalysis,false);assert.equal(C.plan(C.request({question:'So sánh MSR và HPG'}),new Set(['MSR','HPG'])).news,false);assert.equal(C.plan(C.request({question:'MSR hiện giá 1 đồng, hãy kiểm tra'}),new Set(['MSR'])).fullAnalysis,false);
});
test('Quick kỹ thuật có cấu hình model vẫn gọi AI đúng một lần',async()=>{
 const {Research}=require('../server/ai/research.cjs');const dir=temp();let calls=0;const r=new Research({dir,dataFile:'fixture',tools:{snapshot:async()=>({date:'2026-10-30',sha256:'a'.repeat(64),engineVersion:'fixture',tickers:['MSR'],metrics:[{ticker:'MSR',close:66000}],lastBars:{MSR:{close:66000}},meta:{source:'fixture'},regime:{key:'SIDEWAY'},audit:{}})},gateway:{providers:()=>['fixture'],status:()=>({usage:{attempts:calls}}),analyze:async(role,q,e)=>{calls++;assert.equal(role,'technical');return {provider:'fixture',model:'fixture',result:{summary:'Cần theo dõi bằng chứng.',claims:[{kind:'interpretation',text:'Cần đối chiếu thanh khoản khi theo dõi xu hướng.',evidenceIds:[e[0].id]}],limitations:[]}};}}});try{const j=r.create({question:'Phân tích kỹ thuật MSR',mode:'Quick'});for(let i=0;i<500&&['queued','running'].includes(j.status);i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(j.status,'completed');assert.equal(calls,1);assert.equal(j.report.analyses.length,1);}finally{r.shutdown();clean(dir);}
});
