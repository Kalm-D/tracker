'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('./contracts.cjs'),D=require('./data.cjs'),S=require('./sources.cjs');
const Strategy=require('./strategy.cjs'),Risk=require('./risk.cjs'),SC=require('./strategy-config.cjs');
class Research {
 constructor({dir,dataFile,gateway,tools={}}){
  this.dir=dir;this.dataFile=dataFile;this.gateway=gateway;this.tools={snapshot:D.snapshot,financial:S.financialSource,document:S.documentSource,news:S.newsDiscovery,...tools};this.jobs=new Map();this.active=null;this.sourceCache=new Map();
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  for(const name of fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){try{const j=JSON.parse(fs.readFileSync(path.join(dir,name)));if(['queued','running'].includes(j.status)){j.status='blocked';j.error='Máy chủ đã khởi động lại. Kết quả trước lỗi được giữ; dùng Thử lại để chạy lại, không tự báo hoàn thành.';this.persist(j);}this.jobs.set(j.id,j);}catch{}}
 }
 persist(j){const f=path.join(this.dir,j.id+'.json'),temp=f+'.tmp';fs.writeFileSync(temp,JSON.stringify(j),{mode:0o600});fs.renameSync(temp,f);}
 create(input){
  const request=C.request(input);request.sourceUrls.forEach(S.urlAllowed);
  if([...this.jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=3)throw new Error('Hàng đợi tối đa 3 tác vụ.');
  if(this.jobs.size>=100)throw new Error('Đã lưu 100 tác vụ. Cần sao lưu/dọn lịch sử trước khi tạo thêm.');
  const j={schemaVersion:request.schemaVersion,id:crypto.randomUUID(),version:C.VERSION,createdAt:new Date().toISOString(),status:'queued',request,trace:[],report:{evidence:[],analyses:[],warnings:[],financialVerified:false}};
  this.jobs.set(j.id,j);this.persist(j);setImmediate(()=>this.next());return j;
 }
 cancel(id){const j=this.jobs.get(id);if(!j)return null;if(['running','queued'].includes(j.status)){j.status='cancelled';j.finishedAt=new Date().toISOString();this.persist(j);if(this.active?.id===id)this.active.controller.abort();}return j;}
 async cached(key,load){const c=this.sourceCache.get(key);if(c&&Date.now()-c.at<3600000)return c.value;const value=await load();if(this.sourceCache.size>100)this.sourceCache.clear();this.sourceCache.set(key,{at:Date.now(),value});return value;}
 async next(){
  if(this.active)return;const j=[...this.jobs.values()].find(j=>j.status==='queued');if(!j)return;
  const controller=new AbortController();this.active={id:j.id,controller};j.status='running';this.persist(j);
  const timer=setTimeout(()=>controller.abort(new Error('Tác vụ vượt 5 phút.')),300000);
  try{await this.run(j,controller.signal);if(j.status==='running')j.status=j.report.warnings.length?'blocked':'completed';}
  catch(e){if(j.status!=='cancelled'){j.status='failed';j.error=controller.signal.aborted?'Tác vụ hết thời gian.':e.message;}}
  finally{clearTimeout(timer);j.finishedAt=new Date().toISOString();this.persist(j);this.active=null;setImmediate(()=>this.next());}
 }
 async run(j,signal){
  const step=async(agent,tool,fn)=>{signal.throwIfAborted();const t={agent,tool,status:'running',startedAt:new Date().toISOString()};j.trace.push(t);this.persist(j);try{const value=await fn();signal.throwIfAborted();t.status='completed';return value;}catch(e){t.status=signal.aborted?'cancelled':'blocked';t.error=e.message;throw e;}finally{t.finishedAt=new Date().toISOString();this.persist(j);}};
  const snap=await step('data','snapshot / shared Tracker Engine',()=>this.tools.snapshot(this.dataFile));
  j.plan=await step('manager','deterministic Task Router v1',async()=>C.plan(j.request,new Set(snap.tickers)));
  if(j.plan.unsupported)j.report.warnings.push('Yêu cầu có chức năng thuộc phiên bản sau. v0.2 chưa triển khai Backtest Agent/theo dõi/đặt lệnh tự động.');
  const fresh=D.freshness(snap.date);
  j.report.provenance={...fresh,snapshotHash:snap.sha256,engineVersion:snap.engineVersion,strategyVersion:null,source:snap.meta.source,audit:snap.audit};
  const metrics=snap.metrics.filter(m=>j.plan.tickers.includes(m.ticker));
  const technical=await step('technical','exact existing engine snapshot; no rewritten formulas',async()=>({id:'technical-'+snap.sha256.slice(0,12),type:'deterministic_calculation',dataDate:snap.date,publishedAt:snap.meta.generatedAt||null,retrievedAt:fresh.checkedAt,url:'https://github.com/Kalm-D/tracker/blob/main/public/data/market.json.gz',sha256:snap.sha256,engineVersion:snap.engineVersion,metrics,regime:snap.regime,lastBars:Object.fromEntries(j.plan.tickers.map(t=>[t,snap.lastBars[t]||null])),verification:'computed_by_existing_engine'}));
  j.report.evidence.push(technical);
  if(!j.plan.tickers.length)j.report.warnings.push('Chưa xác định mã cổ phiếu. Báo cáo chỉ có bối cảnh thị trường; nhập mã viết hoa hoặc chọn mã trong ô ngữ cảnh.');
  for(const t of j.plan.tickers)if(!metrics.some(m=>m.ticker===t))j.report.warnings.push(t+': chưa có chỉ báo đủ điều kiện; không tự điền số liệu.');
  const attempt=async(agent,tool,fn)=>{try{return await step(agent,tool,fn);}catch(e){signal.throwIfAborted();j.report.warnings.push(e.message);return null;}};
  if(j.plan.fundamental){
   for(const t of j.plan.tickers){
    const e=await attempt('fundamental','Vnstock Finance: income / balance / cashflow / ratios',()=>this.cached('finance:'+t,()=>this.tools.financial(t,{signal})));
    if(e)j.report.evidence.push(e);
   }
  }
  for(const url of j.request.sourceUrls){
   const e=await attempt(j.plan.news?'news':'fundamental','read official HTML/PDF with host/redirect/size limits',()=>this.cached('url:'+url,()=>this.tools.document(url,{signal})));
   if(e)j.report.evidence.push(e);
  }
  if(j.plan.news){
   const e=await attempt('news','RSS discovery (headlines, not event verification)',()=>this.tools.news(j.request.question,j.plan.tickers,{signal}));if(e)j.report.evidence.push(e);
   if(!j.report.evidence.some(e=>e.type==='official_document'))j.report.warnings.push('Tin chưa được xác minh bằng bài/công bố gốc. Thêm đường dẫn chính thức để kiểm tra sự kiện.');
  }

  if(j.plan.strategy){
   const c=j.plan.strategy;
   const multipleManual=j.plan.tickers.length>1&&(['entry','stop','target','existingPositionValue','existingSectorValue'].some(k=>c[k]!==undefined)||c.valuation?.metricValue!==undefined);
   if(multipleManual){
    await attempt('strategy','validate per-symbol assumptions',async()=>{throw new Error('Giá, EPS/BVPS hoặc phần danh mục tự nhập chỉ áp dụng cho một mã. Chọn một mã để tránh gán cùng giá/định giá cho nhiều cổ phiếu.');});
   }else if(!j.plan.tickers.length){
    j.report.warnings.push('Cần chọn mã trước khi tính chiến lược và rủi ro.');
   }else{
    const riskByTicker=await step('risk','deterministic sizing / tick / costs / liquidity',async()=>Object.fromEntries(j.plan.tickers.map(t=>{
     const m=metrics.find(x=>x.ticker===t)||{},last=snap.lastBars[t]||{},useTechnical=c.kind!=='value';
     const entry=c.entry??(useTechnical?m.pivot:undefined),stop=c.stop??(useTechnical?m.stop:undefined);
     const cfg={...c,...(Number.isFinite(entry)?{entry}:{}),...(Number.isFinite(stop)?{stop}:{})};
     return [t,Risk.position(cfg,{exchange:m.exchange||last.exchange,avgVol20:m.avgVol20,lastVolume:last.volume})];
    })));
    j.report.strategies=await step('strategy','separate Swing / Value-Dividend / Hybrid conditions',async()=>j.plan.tickers.map(t=>{
     const m=metrics.find(x=>x.ticker===t)||{ticker:t},last=snap.lastBars[t]||{};
     return {...Strategy.evaluate(c,{metric:m,lastBar:last,date:snap.date,snapshotHash:snap.sha256,engineVersion:snap.engineVersion,evidence:j.report.evidence,regime:snap.regime,riskResult:riskByTicker[t]}),sector:m.sector};
    }));
    j.report.portfolioRisk=Risk.aggregate(j.report.strategies,c);
    j.report.provenance.strategyVersion=SC.STRATEGY_VERSION;
    for(const result of j.report.strategies)j.report.evidence.push({id:'strategy-'+result.ticker+'-'+result.configurationHash.slice(0,12),type:'strategy_calculation',dataDate:snap.date,retrievedAt:new Date().toISOString(),sha256:S.hash(JSON.stringify(result)),data:result,verification:'deterministic_scenario_not_buy_recommendation'});
    j.report.evidence.push({id:'risk-'+j.id,type:'risk_calculation',dataDate:snap.date,data:j.report.portfolioRisk,sha256:S.hash(JSON.stringify(j.report.portfolioRisk)),verification:'deterministic_user_assumptions'});
   }
  }

  const evidence=j.report.evidence;
  // Quick technical requests can finish entirely with deterministic code.
  const roles=[...(j.request.mode!=='Quick'?['technical']:[]),...(j.plan.fundamental?['fundamental']:[]),...(j.plan.news?['news']:[]),...(j.plan.strategy&&j.request.mode!=='Quick'?['strategy','risk']:[])];
  for(const role of roles){
   const e=role==='fundamental'?evidence.filter(e=>e.type!=='news_discovery'):evidence;
   if(role==='fundamental'&&!e.some(x=>['financial_statement','official_document'].includes(x.type))){j.report.warnings.push('Thiếu báo cáo tài chính thực; chưa thể phân tích cơ bản.');continue;}
   const a=await attempt(role,'AI Gateway / cited structured analysis',()=>this.gateway.analyze(role,j.request.question,e,{signal,mode:j.request.mode}));
   if(a)j.report.analyses.push({role,...a});
  }
  await step('critic','deterministic evidence/citation/number contract audit',async()=>{
   for(const a of j.report.analyses)C.validateAnalysis(a.result,evidence);
   const premiseChecks=[]; for(const m of metrics){const re=new RegExp(m.ticker+'\\s+(?:hiện\\s+)?(?:đang\\s+)?(?:có\\s+)?giá\\s+(\\d+(?:[.,]\\d+)*)\\s*(đồng|vnd|nghìn|ngàn)','i');const match=j.request.question.match(re);if(match){const value=Number(match[1].replace(/[.,]/g,''))*(/nghìn|ngàn/i.test(match[2])?1000:1);premiseChecks.push({ticker:m.ticker,claimed:value,snapshotClose:m.close,dataDate:snap.date,status:value===m.close?'matches_snapshot':'contradicted_by_snapshot',message:value===m.close?'Nhận định khớp giá snapshot, chưa xác nhận giá hiện tại.':'Giá được nêu không khớp snapshot; không được coi đây là dữ kiện đã xác minh.'});}}j.report.premiseChecks=premiseChecks;j.report.audit={contractChecks:'passed',independentFactVerification:'not_established',checks:['demo rejected','snapshot hash','existing engine version','citation IDs','numeric tokens present in cited evidence'],limitations:['Kiểm tra số liệu xuất hiện trong nguồn chưa chứng minh đúng ngữ nghĩa, đơn vị hoặc kỳ.','Ngày công bố BCTC chưa xác minh; không được dùng cho nghiên cứu hồi tố.','Chưa xác nhận lịch điều chỉnh giá/cổ tức của nguồn.']};
  });
  if(j.report.analyses.length){
   const a=await attempt('critic','AI counterevidence review (not independent source verification)',()=>this.gateway.analyze('critic','Hãy phản biện luận điểm người dùng và các phân tích: '+j.request.question,evidence,{signal,mode:j.request.mode,previous:j.report.analyses.map(a=>({role:a.role,result:a.result}))}));
   if(a)j.report.analyses.push({role:'critic',...a});
  }
  j.report.usage=this.gateway.status();
  j.report.summary=j.report.strategies?.length?'Chiến lược và rủi ro tính bằng code theo snapshot và giả định, chưa phải khuyến nghị giao dịch hiện tại.':j.report.analyses.length?'Đã thu thập nguồn và tạo nhận định có dẫn nguồn. Xem giới hạn kiểm chứng trước khi sử dụng.':'Kết quả tính toán từ Tracker Engine. Chưa có nhận định LLM đã kiểm chứng.';
  this.persist(j);
 }
 shutdown(){this.active?.controller.abort();}
}
module.exports={Research};
