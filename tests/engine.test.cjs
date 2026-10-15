const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),zlib=require('node:zlib');
const B=require('../public/backtest/engine.js'),E=require('../public/shared/tracker-engine.js');
const cfg=()=>B.config({...B.DEFAULTS,capital:100000,maxPositions:1,maxWeight:1,fee:0,tax:0,slippage:0,participation:1,cooldown:0,acknowledge:true,personal:{liquidity:false,leader:false,base:false,minRS:0,minScore:0,minRisk:0,maxRiskPct:1}});
function fixture({bars=[],close=99,pivot=100,stop=90}={}){
  const dates=Array.from({length:12},(_,i)=>`2026-01-${String(i+1).padStart(2,'0')}`);
  const arr=dates.map((date,i)=>({ticker:'AAA',date,open:100,high:105,low:95,close:100,volume:10000,exchange:'HOSE',...bars[i]}));
  const prepared={series:new Map([['VNINDEX',arr.map(r=>({...r,ticker:'VNINDEX'}))],['AAA',arr]])};
  const snapshots=new Map(dates.map(date=>[date,{date,regime:{key:'UPTREND'},metrics:[{ticker:'AAA',exchange:'HOSE',date,dataQuality:'D0',rows:Array(252).fill(null),pivot,stop,close,rsPercentile:80,trackerScore:80,riskScore:80,setupScore:80,marketFitScore:80,riskPct:.09,avgVol20:10000,liquidityPass:true,leaderPass:true,basePass:true}]}]));
  return {dates,prepared,snapshots,arr};
}
function sim(f,c={}){return B.simulate(f.prepared,f.snapshots,f.dates.slice(2,9),{...cfg(),...c},E.DEFAULTS,'personal');}
test('hand arithmetic: cash, partial exits, fees, realized and open equity reconcile',()=>{
  const f=fixture({bars:{5:{open:120,high:125,low:115,close:120},6:{open:120,high:125,low:115,close:120}}});
  const r=sim(f,{fee:.001,tax:.001,slippage:.001,cooldown:99});
  // 900 shares at 100: cost 90,180; target 120: proceeds 108,000 - 324.
  assert.equal(r.trades[0].quantity,900);assert.ok(Math.abs(r.trades[0].allocated-90180)<1e-8);assert.equal(r.trades[0].costs,504);
  assert.ok(Math.abs(r.summary.realized-17496)<1e-8);assert.ok(Math.abs(r.summary.finalEquity-117496)<1e-8);
  assert.ok(Math.abs(r.summary.finalEquity-100000-r.summary.realized-r.summary.unrealized)<1e-8);
  for(const p of r.curve){assert.ok(p.cash>=-1e-8);assert.ok(Math.abs(p.equity-p.cash-p.receivable-p.invested)<1e-8);}
});
test('pivot order gaps up to open, never retroactively fills pivot',()=>{const f=fixture({bars:{2:{open:110,high:115,low:105,close:112}}});const r=sim(f,{cooldown:99});assert.equal(r.trades[0].buyPrice,110);assert.equal(r.trades[0].pivot,100);assert.equal(r.trades[0].buyDate,f.dates[2]);});
test('close confirmation uses prior pivot and executes earliest next open',()=>{
  const f=fixture({bars:{1:{close:101},2:{open:110,high:115,low:105,close:112}}});const r=sim(f,{entry:'close',cooldown:99});assert.equal(r.trades[0].setupDate,f.dates[0]);assert.equal(r.trades[0].signalDate,f.dates[1]);assert.equal(r.trades[0].buyDate,f.dates[2]);assert.equal(r.trades[0].buyPrice,110);
});
test('gap down exits at open after settlement; no same-day sale of unsettled shares',()=>{
  const f=fixture({bars:{3:{open:85,high:88,low:80,close:84},5:{open:70,high:80,low:65,close:75}}});const r=sim(f,{cooldown:99});const t=r.trades[0];assert.equal(t.sellDate,f.dates[5]);assert.equal(t.sellPrice,70);assert.equal(t.exitReason,'stop_pending_settlement');
});
test('stop before target when both touched; drawdown includes initial capital',()=>{
  const f=fixture({bars:{5:{open:100,high:130,low:85,close:100}}});const r=sim(f,{cooldown:99});assert.equal(r.trades[0].sellPrice,90);assert.equal(r.trades[0].exitReason,'stop_before_target');assert.equal(r.summary.finalEquity,90000);assert.ok(Math.abs(r.summary.maxDrawdown-.1)<1e-10);assert.equal(r.summary.annualized,null);
});
test('volume caps partial exit and leaves remainder valued; no invented fill on flat bar',()=>{
  const f=fixture({bars:{5:{open:120,high:125,low:115,close:120,volume:200},6:{open:120,high:120,low:120,close:120}}});const r=sim(f,{cooldown:99});assert.equal(r.trades[0].exits[0].quantity,200);assert.equal(r.trades[0].remaining,800);assert.equal(r.trades[0].status,'open');assert.equal(r.trades[0].realized,4000);assert.ok(Math.abs(r.summary.netProfit-r.summary.realized-r.summary.unrealized)<1e-8);
});
test('cash settlement prevents reuse of same-day proceeds',()=>{
  const f=fixture({bars:{5:{open:120,high:125,low:115,close:120}}});const r=sim(f);assert.equal(r.curve.find(x=>x.date===f.dates[5]).cash,0);assert.equal(r.curve.find(x=>x.date===f.dates[5]).receivable,120000);assert.ok(r.trades.every(t=>t.buyDate!==f.dates[6]&&t.buyDate!==f.dates[7]));
});
test('missing and flat sessions do not fill, stale positions are reported',()=>{
  const f=fixture();f.arr[2]={...f.arr[2],open:100,high:100,low:100,close:100};f.prepared.series.set('AAA',f.arr.filter((r,i)=>i!==8));const r=sim(f,{cooldown:99});assert.equal(r.trades[0].buyDate,f.dates[3]);assert.equal(r.curve.at(-1).stalePositions,1);assert.equal(r.trades[0].markDate,f.dates[7]);
});
test('trailing uses previous close and cannot use current high to raise stop before exit',()=>{
  const f=fixture({bars:{5:{open:100,high:140,low:95,close:130},6:{open:120,high:125,low:110,close:115}}});const r=sim(f,{exit:'trailing',trailingPct:.1,cooldown:99});assert.equal(r.trades[0].sellDate,f.dates[6]);assert.equal(r.trades[0].sellPrice,117);
});
test('new filters reject nonfinite thresholds and demo data fails closed',()=>{
  assert.throws(()=>B.config({personal:{minRS:NaN}}));assert.throws(()=>B.config({capital:0}));assert.throws(()=>B.prepare({meta:{isDemo:true},symbols:[]}));assert.throws(()=>B.prepare({meta:{},symbols:[]}));
  assert.throws(()=>B.prepare({meta:{isDemo:false},symbols:[{ticker:'AAA',rows:[['2026-01-01',1,2,1,1,10],['2026-01-01',1,2,1,1,10]]}]}));
});
test('known max drawdown is peak to trough, not average of trade returns',()=>{assert.ok(Math.abs(B.drawdown([100,120,90,110].map(equity=>({equity})))-.25)<1e-12);});
const raw=zlib.gunzipSync(fs.readFileSync(require('node:path').join(__dirname,'../public/data/market.json.gz'))),payload=JSON.parse(raw),prepared=B.prepare(payload);
const actualCalendar=prepared.series.get('VNINDEX').map(r=>r.date);
test('shared formulas produce identical results to original source on real data',()=>{
  const html=cp.execFileSync('git',['show','007e5c36cacb56cf0afa9a0540c8271cd5d72986:public/index.html'],{cwd:require('node:path').join(__dirname,'..'),maxBuffer:2000000,encoding:'utf8'});
  const block=html.slice(html.indexOf('    function buildSeries(rows)'),html.indexOf('    function dateToTime('));
  for(const date of [actualCalendar[253],actualCalendar.at(-30),actualCalendar.at(-1)]){
    const now=B.snapshot(prepared,date,E.DEFAULTS),series=new Map(),quality={byTicker:new Map()};
    const dates=prepared.series.get('VNINDEX').filter(r=>r.date<=date).map(r=>r.date);
    for(const [t,all] of prepared.series){const arr=all.filter(r=>r.date<=date);if(!arr.length)continue;const ix=dates.indexOf(arr.at(-1).date),stale=ix<0?999:dates.length-1-ix;const status=stale===0?'D0':stale===1?'D1':'STALE';if(stale<=1||E.isBenchmarkOrIndexTicker(t))series.set(t,arr);quality.byTicker.set(t,{status,label:status,tone:'info',staleSessions:stale});}
    const context=vm.createContext({state:{series,quality},settings:()=>E.DEFAULTS,isPlainStockTicker:E.isPlainStockTicker,isBenchmarkOrIndexTicker:E.isBenchmarkOrIndexTicker});
    vm.runInContext(block+';var ms=computeMetrics();var regime=computeMarketRegime(state.series.get("VNINDEX"),ms);applyCompositeScores(ms,regime);',context);
    assert.equal(JSON.stringify(context.ms),JSON.stringify(now.metrics),date);assert.equal(JSON.stringify(context.regime),JSON.stringify(now.regime));
  }
});
test('future bars cannot change historical RS, eligibility, pivot, stops or regime',()=>{
  const date=actualCalendar.at(-40),a=B.snapshot(prepared,date);
  const changed=structuredClone(payload);for(const s of changed.symbols)for(const r of s.rows)if(r[0]>date){for(let k=1;k<=4;k++)r[k]*=10;r[5]*=20;}
  const b=B.snapshot(B.prepare(changed),date);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
});
test('two complete runs on real snapshot are deterministic and conserve capital',()=>{
  const c={...cfg(),start:actualCalendar.at(-10),end:actualCalendar.at(-1),method:'both'};
  const a=B.run(payload,c),b=B.run(payload,c);assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(a.benchmarks.find(x=>x.ticker==='VN30').available,false);
  for(const x of a.results)for(const p of x.curve){assert.ok(p.cash>=-1e-6);assert.ok(Math.abs(p.equity-c.capital-p.realized-p.unrealized)<1e-5);}
});
