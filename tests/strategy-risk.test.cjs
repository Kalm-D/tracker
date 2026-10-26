'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const SC=require('../server/ai/strategy-config.cjs'),R=require('../server/ai/risk.cjs'),ST=require('../server/ai/strategy.cjs'),C=require('../server/ai/contracts.cjs'),{Research}=require('../server/ai/research.cjs');
const cfg=over=>({kind:'swing',capital:100000000,riskPct:0.01,maxWeight:0.2,fee:0.001,sellTax:0.001,slippage:0,maxParticipation:0.01,minRR:2,entry:10000,stop:9000,target:12000,acknowledge:true,...over});
const market={exchange:'HOSE',avgVol20:1000000,lastVolume:1000000};
const context=over=>({metric:{ticker:'MBB',sector:'Ngân hàng',exchange:'HOSE',close:11000,pivot:10000,stop:9500,dataQuality:'D0',trendPass:true,liquidityPass:true,avgVol20:1000000,avgVol50:500000},lastBar:{ticker:'MBB',exchange:'HOSE',volume:1000000},date:'2026-10-26',snapshotHash:'a'.repeat(64),engineVersion:'explicit-test-fixture',evidence:[],regime:{key:'UPTREND'},now:new Date('2026-10-26T06:00:00Z'),...over});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tracker-ai-v02-test-'));
const wait=async f=>{for(let i=0;i<400;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw new Error('Test timed out');};
test('v0.2 validates rates, budgets, strategy types and forbids client certification fields',()=>{
 assert.equal(SC.config({kind:'value'}).kind,'value');assert.equal(SC.config(undefined),null);
 for(const bad of [{kind:'invalid'},cfg({riskPct:NaN}),cfg({capital:-1}),cfg({fee:0.2}),cfg({availableCash:200000000}),cfg({verified:true}),cfg({acknowledge:'true'}),cfg({valuation:{method:'pe',metricValue:3000,basis:'reported'}}),cfg({valuation:{method:'pe',bearMultiple:12,baseMultiple:8,bullMultiple:15}})])assert.throws(()=>SC.config(bad));
});
test('request versioning preserves v0.1 jobs and routes three strategies without future agents',()=>{
 assert.equal(C.request({question:'Kỹ thuật MBB'}).schemaVersion,1);
 for(const kind of ['swing','value','hybrid']){const r=C.request({question:'MBB nghiên cứu',strategy:{kind}}),p=C.plan(r,new Set(['MBB']));assert.equal(r.schemaVersion,2);assert.ok(p.roles.includes('risk'));assert.ok(p.roles.includes('strategy'));assert.equal(Boolean(p.fundamental),kind!=='swing');assert.ok(!p.roles.includes('backtest'));}
 assert.equal(C.request({question:'Chiến lược tích sản MBB'}).strategy.kind,'value');
 assert.equal(C.request({question:'Chiến lược Hybrid MBB'}).strategy.kind,'hybrid');
});
test('tick sizes and conservative rounding work across HOSE price boundaries',()=>{
 assert.equal(R.tickSize('HOSE',9990),10);assert.equal(R.tickSize('HOSE',10000),50);assert.equal(R.tickSize('HOSE',49950),50);assert.equal(R.tickSize('HOSE',50000),100);
 assert.equal(R.tickSize('HNX',12050),100);assert.equal(R.tickSize('UPCOM',8000),100);
 for(const [p,up,down] of [[9999,10000,9990],[10001,10050,10000],[49999,50000,49950],[50001,50100,50000]]){assert.equal(R.roundPrice(p,'HOSE','up'),up);assert.equal(R.roundPrice(p,'HOSE','down'),down);}
 assert.throws(()=>R.tickSize('UNKNOWN',10000));
});
test('hand arithmetic reconciles both-side fees, sale tax, lot rounding and risk budget',()=>{
 const r=R.position(cfg(),market);
 assert.equal(r.quantity,900);assert.equal(r.perShare.buyCost,10010);assert.equal(r.perShare.stopLoss,1028);assert.equal(r.perShare.targetProfit,1966);
 assert.equal(r.allocated,9009000);assert.equal(r.plannedLoss,925200);assert.equal(r.targetProfit,1769400);assert.equal(r.rr,1966/1028);assert.deepEqual(r.bindingLimits,['risk']);
 assert.equal(r.executionReady,false);assert.equal(r.simulationOnly,true);
});
test('buy slippage rounds up, sale slippage rounds down and reduces net R:R',()=>{
 const a=R.position(cfg({fee:0,sellTax:0}),market),b=R.position(cfg({fee:0,sellTax:0,slippage:0.001}),market);
 assert.equal(b.prices.fillBuy,10050);assert.equal(b.prices.fillStop,8990);assert.equal(b.prices.fillTarget,11950);assert.ok(b.rr<a.rr);
});
test('cash, existing holding, sector exposure and liquidity independently constrain positions',()=>{
 const cash=R.position(cfg({availableCash:2000000}),market);assert.equal(cash.quantity,100);assert.ok(cash.bindingLimits.includes('cash'));
 const held=R.position(cfg({existingPositionValue:20000000}),market);assert.equal(held.quantity,0);assert.equal(held.status,'blocked');
 const sector=R.position(cfg({existingSectorValue:34000000,availableCash:66000000}),market);assert.equal(sector.quantity,0);assert.ok(sector.bindingLimits.includes('sector'));
 const illiquid=R.position(cfg(),{...market,lastVolume:15000});assert.equal(illiquid.quantity,100);assert.ok(illiquid.bindingLimits.includes('liquidity'));
});
test('missing capital, acknowledgment, liquidity and invalid price relationships fail closed',()=>{
 for(const [c,m] of [[cfg({capital:undefined}),market],[cfg({acknowledge:false}),market],[cfg(),{...market,lastVolume:0}],[cfg({stop:10000}),market],[cfg({target:9990}),market],[cfg({capital:1000}),market],[cfg(),{...market,exchange:'UNKNOWN'}],[cfg({entry:10,stop:1}),market]]){
  const r=R.position(c,m);assert.equal(r.status,'blocked');assert.equal(r.quantity,0);assert.ok(r.reasons.length);
 }
});
test('no target yields no invented R:R; a gross target can still lose after costs',()=>{
 const a=R.position(cfg({target:undefined}),market);assert.equal(a.rr,null);assert.equal(a.prices.target,null);
 const b=R.position(cfg({target:10050,fee:0.01,sellTax:0.01}),market);assert.ok(b.rr<0);
});
test('stress gap discloses loss beyond the stop budget rather than promising maximum loss',()=>{
 const r=R.position(cfg({stressGapPct:0.2}),market);assert.ok(r.stress.loss>r.plannedLoss);assert.ok(r.stress.loss>r.riskBudget);assert.ok(r.limitations.some(s=>s.includes('không phải mức lỗ tối đa')));
});
test('position constraints hold across a deterministic range of prices, capital and fees',()=>{
 let seed=1234567;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let i=0;i<250;i++){
  const entry=1000+Math.floor(random()*100000),c=cfg({capital:100000+Math.floor(random()*1000000000),entry,stop:entry*(0.7+random()*0.25),target:entry*(1.1+random()*0.5),riskPct:0.001+random()*0.04,maxWeight:0.01+random()*0.5,fee:random()*0.003,sellTax:random()*0.002,slippage:random()*0.003});
  const m={exchange:['HOSE','HNX','UPCOM'][i%3],avgVol20:10000+Math.floor(random()*1000000),lastVolume:10000+Math.floor(random()*1000000)},r=R.position(c,m);
  assert.equal(r.quantity%100,0);
  if(r.status==='calculated'){assert.ok(r.allocated<=c.capital+0.01);assert.ok(r.weight<=c.maxWeight+1e-12);assert.ok(r.plannedLoss<=r.riskBudget+0.01);assert.ok(r.quantity<=Math.min(m.avgVol20,m.lastVolume)*0.01+1e-9);assert.ok(Number.isFinite(r.rr));assert.equal(r.prices.entry%R.tickSize(m.exchange,r.prices.entry),0);}
 }
});
test('portfolio totals reveal aggregate budget and sector conflicts instead of assuming independent orders fit',()=>{
 const risk=R.position(cfg(),market),p=R.aggregate(Array.from({length:4},(_,i)=>({ticker:'T'+i,sector:'Ngân hàng',risk})),cfg());
 assert.equal(p.plannedLoss,risk.plannedLoss*4);assert.ok(p.warnings.some(w=>w.includes('ngân sách rủi ro chung')));assert.equal(p.executionReady,false);
 const large=R.aggregate([{sector:'Ngân hàng',risk:{status:'calculated',allocated:20000000,plannedLoss:10000}},{sector:'Ngân hàng',risk:{status:'calculated',allocated:20000000,plannedLoss:10000}}],cfg());assert.ok(large.warnings.some(w=>w.includes('giới hạn ngành')));
});
const factEvidence=(over={})=>({id:'financial-test-only',type:'financial_statement',ticker:'MBB',sha256:'b'.repeat(64),publishedAt:'2026-08-01T00:00:00Z',data:{tables:{ratio:[{bvps:20000,eps:3000}]},facts:[{metric:'bvps',value:20000,unit:'VND/share',basis:'reported',periodEnd:'2026-06-30',periodType:'quarter_end',path:'/tables/ratio/0/bvps'},{metric:'eps_ttm',value:3000,unit:'VND/share',basis:'reported',periodEnd:'2026-06-30',periodType:'ttm',path:'/tables/ratio/0/eps'}]},...over});
test('reported valuation inputs require matching ticker, units, period, source date, hash and original number',()=>{
 const e=factEvidence();assert.equal(ST.reportedFact([e],'bvps','2026-10-26','MBB').value,20000);
 for(const broken of [factEvidence({publishedAt:null}),factEvidence({publishedAt:'2026-11-01'}),factEvidence({ticker:'ACB'}),factEvidence({sha256:null})])assert.equal(ST.reportedFact([broken],'bvps','2026-10-26','MBB'),null);
 for(const patch of [{unit:'thousand VND/share'},{value:99999},{path:'/facts/0/value'},{periodEnd:'2027-01-01'},{periodEnd:'2020-01-01'}]){const b=structuredClone(e);Object.assign(b.data.facts[0],patch);assert.equal(ST.reportedFact([b],'bvps','2026-10-26','MBB'),null);}
 const q=structuredClone(e);q.data.facts[1].periodType='quarter_end';assert.equal(ST.reportedFact([q],'eps_ttm','2026-10-26','MBB'),null);assert.equal(ST.reportedFact([e],'bvps',null,'MBB'),null);
});
test('three P/E or P/B scenarios are deterministic and user input never becomes a verified fact',()=>{
 const c=SC.config({kind:'value',valuation:{method:'pb',metricValue:20000,bearMultiple:1,baseMultiple:1.5,bullMultiple:2,marginOfSafety:0.2,sourceNote:'Dự phóng tự nhập'}}),v=ST.valuation(c,[factEvidence()],{date:'2026-10-26',ticker:'MBB'});
 assert.equal(v.verified,false);assert.equal(v.status,'assumption_only');assert.deepEqual(v.scenarios.map(s=>s.fairValue),[20000,30000,40000]);assert.deepEqual(v.scenarios.map(s=>s.watchBelow),[16000,24000,32000]);assert.ok(v.scenarios.every(s=>s.probability===null));
 const sourced=ST.valuation(SC.config({kind:'value',valuation:{method:'pe',bearMultiple:7,baseMultiple:9,bullMultiple:11}}),[factEvidence()],{date:'2026-10-26',ticker:'MBB'});assert.equal(sourced.verified,true);assert.equal(sourced.metricValue,3000);
});
test('missing valuation inputs stay missing and never turn EPS losses into a valid positive P/E',()=>{
 const c=SC.config({kind:'value',valuation:{method:'pe',baseMultiple:10}});assert.equal(ST.valuation(c,[],{date:'2026-10-26',ticker:'MBB'}).status,'blocked');
 assert.throws(()=>SC.config({kind:'value',valuation:{method:'pe',metricValue:-3000}}));
});
test('Swing can be conditional only when all data, trend, volume, regime and net risk checks pass',()=>{
 const good=cfg({fee:0,sellTax:0,stop:9500,target:13000}),a=ST.evaluate(good,context());assert.equal(a.decision,'conditional_watch');assert.equal(a.autoTrading,false);assert.equal(a.executionReady,false);
 const down=ST.evaluate(good,context({regime:{key:'DOWNTREND'}}));assert.equal(down.decision,'wait');
 const weak=context();weak.metric.trendPass=false;assert.equal(ST.evaluate(good,weak).decision,'wait');
 const volume=context();volume.lastBar.volume=500000;assert.equal(ST.evaluate(good,volume).decision,'wait');
 const avoid=context();avoid.metric.avoidPass=true;assert.equal(ST.evaluate(good,avoid).decision,'avoid');
});
test('dated snapshots and missing target prevent a present-day buy conclusion',()=>{
 assert.equal(ST.evaluate(cfg({fee:0,sellTax:0,target:13000}),context({date:'2026-10-23'})).decision,'wait');
 const a=ST.evaluate(cfg({target:undefined}),context());assert.equal(a.decision,'wait');assert.equal(a.risk.rr,null);
});
test('Value and Hybrid preserve separate axes and never equate a cheap multiple with business quality',()=>{
 for(const kind of ['value','hybrid']){
  const c=cfg({kind,valuation:{method:'pb',bearMultiple:1,baseMultiple:1.5,bullMultiple:2}}),s=ST.evaluate(c,context({evidence:[factEvidence()]}));
  assert.equal(s.valuation.verified,true);assert.equal(s.axes.fundamental.businessQuality,'not_verified');assert.equal(s.decision,'wait');assert.equal(s.compositeScore,undefined);
 }
 const value=ST.evaluate({kind:'value',capital:100000000,acknowledge:true},context());assert.equal(value.entryReference,null);assert.equal(value.stopReference,null);assert.equal(value.risk.status,'blocked');
});
test('strategy configuration and provenance are reproducible, versioned, and change with assumptions',()=>{
 const a=ST.evaluate(cfg(),context()),b=ST.evaluate(cfg(),context()),c=ST.evaluate(cfg({fee:0.002}),context());
 assert.equal(a.configurationHash,b.configurationHash);assert.notEqual(a.configurationHash,c.configurationHash);assert.equal(a.provenance.snapshotHash,'a'.repeat(64));assert.equal(a.version,SC.STRATEGY_VERSION);
});
test('research persists real Strategy/Risk stages; insufficient conditions return Wait without model fabrication',async()=>{
 const dir=temp(),snap={...context(),tickers:['MBB'],metrics:[context().metric],meta:{source:'explicit test fixture'},audit:{invalid:0},sha256:'a'.repeat(64),lastBars:{MBB:context().lastBar}},gateway={status:()=>({usage:{attempts:0}}),analyze:async()=>{throw new Error('No test provider');}};
 try{
  const r=new Research({dir,dataFile:'fixture',gateway,tools:{snapshot:async()=>snap}}),j=r.create({question:'MBB phương án',strategy:cfg()});await wait(()=>!['queued','running'].includes(j.status));assert.equal(j.status,'completed');assert.equal(j.schemaVersion,2);assert.ok(j.trace.some(t=>t.agent==='risk'&&t.status==='completed'));assert.ok(j.trace.some(t=>t.agent==='strategy'&&t.status==='completed'));assert.equal(j.report.strategies[0].risk.quantity,900);assert.ok(j.report.provenance.strategyVersion);
  const restored=new Research({dir,dataFile:'fixture',gateway});assert.equal(restored.jobs.get(j.id).report.strategies[0].configurationHash,j.report.strategies[0].configurationHash);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('one user price or EPS is never silently assigned to multiple tickers',async()=>{
 const dir=temp(),snap={tickers:['MBB','ACB'],metrics:[context().metric,{...context().metric,ticker:'ACB'}],date:'2026-10-26',sha256:'a'.repeat(64),engineVersion:'test',meta:{source:'explicit test fixture'},audit:{},regime:{key:'UPTREND'},lastBars:{MBB:context().lastBar,ACB:context().lastBar}};
 try{const r=new Research({dir,dataFile:'fixture',gateway:{status:()=>({usage:{attempts:0}})},tools:{snapshot:async()=>snap}}),j=r.create({question:'MBB ACB phương án',strategy:cfg()});await wait(()=>!['queued','running'].includes(j.status));assert.equal(j.status,'blocked');assert.equal(j.report.strategies,undefined);assert.ok(j.report.warnings.some(w=>w.includes('một mã')));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('LLM context omits capital, position size and holdings entered in the strategy form',()=>{
 const {projectEvidence}=require('../server/ai/gateway.cjs');
 const full={type:'strategy_calculation',data:ST.evaluate(cfg({capital:123456789,availableCash:100000000,existingPositionValue:1234567,existingSectorValue:2222222}),context())};
 const slim=projectEvidence(full),json=JSON.stringify(slim);
 for(const value of ['123456789','1234567','2222222'])assert.ok(!json.includes(value));
 assert.equal(slim.data.risk.rr,full.data.risk.rr);assert.equal(full.data.configuration.capital,123456789);
 const portfolio=projectEvidence({type:'risk_calculation',data:{allocated:99999999,plannedLoss:12345,warnings:['Review'],limitation:'simulation'}});
 assert.equal(portfolio.data.allocated,undefined);assert.equal(portfolio.data.plannedLoss,undefined);
});

test('aggregate sector exposure includes the existing sector value only once',()=>{
 const plans=[{sector:'Ngân hàng',risk:{status:'calculated',allocated:1000000,plannedLoss:10000}},{sector:'Ngân hàng',risk:{status:'calculated',allocated:1000000,plannedLoss:10000}}];
 const total=R.aggregate(plans,cfg({existingSectorValue:34000000}));assert.equal(total.sectorProjectedValues['Ngân hàng'],36000000);assert.ok(total.warnings.some(w=>w.includes('giới hạn ngành')));
});

test('existing holdings require explicit available cash and cannot imply leverage',()=>{
 assert.equal(R.position(cfg({existingPositionValue:1000000}),market).status,'blocked');
 assert.throws(()=>SC.config(cfg({existingSectorValue:80000000,availableCash:30000000})));
 assert.throws(()=>SC.config(cfg({existingPositionValue:20000000,existingSectorValue:10000000})));
});
