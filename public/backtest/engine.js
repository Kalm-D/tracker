/* Deterministic, long-only daily-bar research simulator. No network, DOM or clock. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../shared/tracker-engine.js') : root.TrackerEngine);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TrackerBacktest = api;
})(globalThis, function(E) {
  'use strict';
  const VERSION = 'backtest-1.0.0';
  const RULE_VERSION = 'candidates-1.0.0';
  const DEFAULTS = Object.freeze({capital:100000000,maxPositions:5,maxWeight:0.2,allocation:'equal',riskBudget:0.01,
    entry:'pivot',exit:'rr',rewardR:2,targetPct:0.15,trailingPct:0.08,fee:0.0015,tax:0.001,slippage:0.001,
    participation:0.01,lotSize:100,settlementSessions:3,cooldown:5,priority:'score',liquidate:false,
    method:'both',exchange:'ALL',tickers:[],benchmark:'VNINDEX',warmup:252,acknowledge:false,
    personal:{liquidity:true,leader:true,base:true,minRS:70,minScore:70,minRisk:70,maxRiskPct:0.10}});
  const LIMITATIONS = [
    'Kết quả nghiên cứu mô phỏng, không phải giao dịch thực tế; không suy ra lệnh từ Watchlist.',
    'Chưa có lịch sử thành phần thị trường/mã hủy niêm yết đầy đủ: có survivorship bias.',
    'Nguồn chưa chứng nhận chuỗi điều chỉnh và cổ tức. Không cộng cổ tức; không gọi đây là tổng lợi nhuận.',
    'OHLCV không cho biết sổ lệnh, thứ tự giá, giá trần/sàn hoặc hạn chế giao dịch. Phiên một giá/không volume: không khớp.',
    'Stop được xét trước target khi cả hai chạm. Gap xuống qua stop khớp ở giá mở cửa; gap qua target chỉ ghi giá target.',
    'T+2 nhận trong ngày: với dữ liệu ngày, giả định chỉ sử dụng từ đầu T+3. Không bán trước khi cổ phiếu khả dụng, không ứng tiền.',
    'Lệnh chờ chỉ có hiệu lực một phiên; khối lượng khớp bị giới hạn bởi min(TB20 phiên trước, volume phiên khớp) × mức tham gia.',
    'Thiếu bar: không khớp, định giá bằng close gần nhất và ghi số vị thế định giá cũ. Không tự thanh lý mã biến mất.',
    'Không đòn bẩy. Phí/thuế/trượt giá là giả định cấu hình, không phải báo giá của công ty chứng khoán.'
  ];
  function assert(ok,msg) { if (!ok) throw new Error(msg); }
  function config(input) {
    const c={...DEFAULTS,...input,personal:{...DEFAULTS.personal,...input?.personal}};
    for(const k of ['capital','maxPositions','maxWeight','riskBudget','rewardR','targetPct','trailingPct','participation','lotSize']) assert(Number.isFinite(c[k])&&c[k]>0,`Cấu hình ${k} phải > 0.`);
    for(const k of ['fee','tax','slippage','cooldown']) assert(Number.isFinite(c[k])&&c[k]>=0,`Cấu hình ${k} không hợp lệ.`);
    for(const k of ['maxWeight','riskBudget','participation','targetPct','trailingPct']) assert(c[k]<=1,`${k} phải ≤ 1.`);
    for(const k of ['fee','tax','slippage']) assert(c[k]<0.1,`${k} phải < 10%.`);
    for(const k of ['maxPositions','lotSize','cooldown','warmup']) assert(Number.isInteger(c[k]),`${k} phải nguyên.`);
    assert(c.maxPositions<=100 && c.lotSize===100 && c.warmup>=252,'Bản này hỗ trợ ≤100 vị thế, lô 100, làm nóng ≥252 phiên.');
    assert(c.settlementSessions===3,'Bản OHLC ngày chỉ hỗ trợ quy ước T+3 bảo thủ.');
    for(const [k,values] of Object.entries({entry:['pivot','close'],exit:['rr','target','trailing'],allocation:['equal','risk'],method:['market','personal','both'],priority:['score','rs'],exchange:['ALL','HOSE','HNX','UPCOM']})) assert(values.includes(c[k]),`Không hỗ trợ ${k}.`);
    assert(Array.isArray(c.tickers)&&c.tickers.every(t=>/^[A-Z0-9]{3}$/.test(t)),'Tập mã không hợp lệ.');
    for(const k of ['minRS','minScore','minRisk']) assert(Number.isFinite(c.personal[k])&&c.personal[k]>=0&&c.personal[k]<=100,`Tiêu chí ${k} phải 0–100.`);
    assert(c.personal.maxRiskPct>0&&c.personal.maxRiskPct<=1,'Risk tối đa không hợp lệ.');
    return c;
  }
  function prepare(payload) {
    assert(payload?.meta?.isDemo===false,'Chặn dữ liệu demo hoặc chưa xác định nguồn thật.');
    assert(Array.isArray(payload.symbols),'Cần snapshot shared-market-v1.');
    const series=new Map(), dates=new Set(), issues=[]; let count=0,invalid=0;
    for(const s of payload.symbols) {
      assert(typeof s.ticker==='string'&&!series.has(s.ticker),'Trùng/thiếu mã trong snapshot.');
      const seen=new Set(),arr=[];
      for(const r of s.rows||[]) {
        const [date,open,high,low,close,volume]=r;
        assert(!seen.has(date),`Trùng ${s.ticker} ${date}; cần sửa nguồn trước khi chạy.`);seen.add(date);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date||![open,high,low,close,volume].every(Number.isFinite)||low<=0||volume<0||low>Math.min(open,close)||high<Math.max(open,close)||high<low) {invalid++; continue;}
        arr.push({ticker:s.ticker,exchange:s.exchange,sector:s.sector,date,open,high,low,close,volume});dates.add(date);count++;
      }
      arr.sort((a,b)=>a.date.localeCompare(b.date));series.set(s.ticker,arr);
    }
    if(invalid) issues.push(`${invalid} bar OHLCV không hợp lệ đã bị loại; phiên đó không thể khớp.`);
    const calendar=[...dates].sort();
    return {series,meta:payload.meta,audit:{symbols:series.size,rows:count,invalid,first:calendar[0],last:calendar.at(-1),issues}};
  }
  function snapshot(prepared,date,settings=E.DEFAULTS) {
    const cfg={...E.DEFAULTS,...settings},series=new Map(),quality={byTicker:new Map()};
    const bench=(prepared.series.get(cfg.benchmarkTicker)||[]).filter(r=>r.date<=date);
    const dates=bench.map(r=>r.date),last=dates.length-1;
    for(const [t,all] of prepared.series) {
      // Slice before any indicator, cross-sectional RS rank, breadth or regime computation.
      let lo=0,hi=all.length;while(lo<hi){const mid=(lo+hi)>>1;if(all[mid].date<=date)lo=mid+1;else hi=mid;}
      const arr=all.slice(0,lo);if(!arr.length)continue;
      const idx=dates.indexOf(arr.at(-1).date),stale=idx<0?999:last-idx;
      const status=stale===0?'D0':stale===1?'D1':'STALE';
      if(E.isBenchmarkOrIndexTicker(t,cfg.benchmarkTicker)||stale<=1)series.set(t,arr);
      quality.byTicker.set(t,{status,label:status,tone:'info',staleSessions:stale});
    }
    const metrics=E.computeMetrics(series,cfg,quality);
    const regime=E.computeMarketRegime(series.get(cfg.benchmarkTicker),metrics);
    E.applyCompositeScores(metrics,regime,cfg);
    return {date,regime,metrics};
  }
  function candidate(m,regime,method,c,settings) {
    const checks=[['Dữ liệu cùng ngày',m.dataQuality==='D0'],['Đủ lịch sử làm nóng',(m.rows?.length||0)>=c.warmup],['Pivot hợp lệ',m.pivot>0],['Stop dưới pivot',m.stop>0&&m.stop<m.pivot],['Không Avoid/phân phối',!m.avoidPass&&!m.distributionPass]];
    if(method==='market') checks.push(['Thanh khoản',m.liquidityPass],['Market Fit ≥70',m.marketFitScore>=70],['Tracker ≥55',m.trackerScore>=55],['Risk ≥70',m.riskScore>=70],['Setup ≥40',m.setupScore>=40],['Regime cho phép',!['UNKNOWN','DOWNTREND','CAPITULATION','DISTRIBUTION'].includes(regime.key)],['Gần pivot',m.close>=m.pivot*(1-settings.nearPivotPct)]);
    else {
      const p=c.personal;
      if(p.liquidity)checks.push(['Thanh khoản',m.liquidityPass]);
      if(p.leader)checks.push(['Leader Track',m.leaderPass]);
      if(p.base)checks.push(['Base/VCP',m.basePass]);
      checks.push([`RS ≥${p.minRS}`,m.rsPercentile>=p.minRS],[`Tracker ≥${p.minScore}`,m.trackerScore>=p.minScore],[`Risk ≥${p.minRisk}`,m.riskScore>=p.minRisk],['Risk trong giới hạn',m.riskPct<=p.maxRiskPct]);
    }
    return {ticker:m.ticker,date:m.date,pivot:m.pivot,stop:m.stop,score:m.trackerScore,rs:m.rsPercentile,regime:regime.key,
      avgVolume:m.avgVol20,close:m.close,exchange:m.exchange,passed:checks.filter(x=>x[1]).map(x=>x[0]),missing:checks.filter(x=>!x[1]).map(x=>x[0]),
      eligible:checks.every(x=>x[1]),trigger:m.close>m.pivot?'Đã đóng cửa trên pivot — không mua hồi tố':'Theo dõi — chờ vượt pivot'};
  }
  function candidates(s,method,c,settings) {
    return s.metrics.filter(m=>(c.exchange==='ALL'||m.exchange===c.exchange)&&(!c.tickers.length||c.tickers.includes(m.ticker)))
      .map(m=>candidate(m,s.regime,method,c,settings));
  }
  function drawdown(points) {let peak=points[0]?.equity||0,worst=0;for(const p of points){peak=Math.max(peak,p.equity);if(peak>0)worst=Math.max(worst,1-p.equity/peak);}return worst;}
  function splitPeriods(curve,date) {
    const first=curve.findIndex(p=>p.date>=date);assert(first>0&&first<curve.length,'Mốc ngoài mẫu phải nằm sau ngày bắt đầu và trong kỳ.');
    const period=(name,points)=>({name,from:points[0].date,to:points.at(-1).date,sessions:points.length-1,initialEquity:points[0].equity,finalEquity:points.at(-1).equity,return:points.at(-1).equity/points[0].equity-1,maxDrawdown:drawdown(points)});
    return [period('in_sample',curve.slice(0,first)),period('out_of_sample',curve.slice(first-1))];
  }
  function summarize(trades,curve,capital) {
    const closed=trades.filter(t=>t.status==='closed'),wins=closed.filter(t=>t.pnl>0),losses=closed.filter(t=>t.pnl<=0),last=curve.at(-1);
    const days=(Date.parse(last.date)-Date.parse(curve[0].date))/86400000;
    const avg=a=>a.length?a.reduce((n,t)=>n+t.pnl,0)/a.length:null;
    return {capital,finalEquity:last.equity,netProfit:last.equity-capital,return:last.equity/capital-1,realized:last.realized,unrealized:last.unrealized,
      annualized:days>=365?(last.equity/capital)**(365.25/days)-1:null,maxDrawdown:drawdown(curve),trades:trades.length,closed:closed.length,winRate:closed.length?wins.length/closed.length:null,
      averageWin:avg(wins),averageLoss:avg(losses),cashWeight:(last.cash+last.receivable)/last.equity,availableCash:last.cash,receivable:last.receivable,
      costs:trades.reduce((n,t)=>n+t.costs,0)};
  }
  function simulate(prepared,snapshots,dates,c,settings,method,progress=()=>{},cancelled=()=>false) {
    let cash=c.capital,realized=0;const positions=new Map(),receivables=[],trades=[],signals=[],lastExit=new Map(),lastClose=new Map();
    const byDate=new Map([...prepared.series].map(([t,a])=>[t,new Map(a.map(r=>[r.date,r]))]));
    const calendar=(prepared.series.get(c.benchmark)||[]).map(r=>r.date),index=new Map(calendar.map((d,i)=>[d,i]));
    const firstIdx=index.get(dates[0]),baselineDate=calendar[firstIdx-1];
    for(const [t,a] of prepared.series){const r=a.filter(r=>r.date<=baselineDate).at(-1);if(r)lastClose.set(t,r);}
    const curve=[{date:baselineDate,equity:cash,cash,receivable:0,invested:0,realized:0,unrealized:0,regime:snapshots.get(baselineDate)?.regime.key||'UNKNOWN',stalePositions:0}];
    const tradeable=r=>r&&r.volume>0&&r.high>r.low&&r.tradable!==false;
    const capacity=(r,avg)=>Math.floor(Math.min(r.volume,avg)*c.participation/c.lotSize)*c.lotSize;
    function sell(p,r,price,reason,i) {
      const qty=Math.min(p.remaining,capacity(r,p.avgVolume));if(qty<=0)return;
      const gross=price*qty,cost=gross*(c.fee+c.tax+c.slippage),net=gross-cost,book=p.unitCost*qty,pnl=net-book;
      p.exits.push({date:r.date,price,quantity:qty,reason,costs:cost,pnl});p.remaining-=qty;p.costs+=cost;p.realized+=pnl;realized+=pnl;
      receivables.push({amount:net,due:i+c.settlementSessions});
      if(!p.remaining){p.status='closed';p.sellDate=r.date;p.sellPrice=p.exits.reduce((n,x)=>n+x.price*x.quantity,0)/p.quantity;p.exitReason=reason;positions.delete(p.ticker);lastExit.set(p.ticker,i);}
    }
    for(let step=0;step<dates.length;step++) {
      assert(!cancelled(),'Đã hủy tác vụ.');const date=dates[step],i=index.get(date),prior=calendar[i-1],prev2=calendar[i-2];
      for(let j=receivables.length-1;j>=0;j--)if(receivables[j].due<=i)cash+=receivables.splice(j,1)[0].amount;
      const startEquity=cash+receivables.reduce((n,x)=>n+x.amount,0)+[...positions.values()].reduce((n,p)=>n+p.remaining*(lastClose.get(p.ticker)?.close||p.buyPrice),0);
      for(const p of [...positions.values()]) {
        p.avgVolume=snapshots.get(prior)?.metrics.find(m=>m.ticker===p.ticker)?.avgVol20||p.avgVolume;
        const r=byDate.get(p.ticker)?.get(date);if(!r)continue;
        const hitStop=r.low<=p.stop,hitTarget=c.exit!=='trailing'&&r.high>=p.target;
        if(i<p.available){if(hitStop)p.pendingStop=true;continue;}
        if(!tradeable(r)){if(hitStop)p.pendingStop=true;continue;}
        if(p.pendingStop||r.open<=p.stop)sell(p,r,r.open,p.pendingStop?'stop_pending_settlement':'gap_stop',i);
        else if(hitStop)sell(p,r,p.stop,hitTarget?'stop_before_target':'stop',i);
        else if(hitTarget)sell(p,r,p.target,'target',i);
        if(p.remaining&&(hitStop||p.pendingStop))p.pendingStop=true;
        if(c.exit==='trailing'&&p.remaining)p.stop=Math.max(p.stop,r.close*(1-c.trailingPct)); // next session only
      }
      const setupDate=c.entry==='close'?prev2:prior,s=snapshots.get(setupDate);
      if(s) {
        const list=candidates(s,method,c,settings).filter(x=>x.eligible&&x.close<=x.pivot);
        list.sort((a,b)=>(c.priority==='score'?b.score-a.score:b.rs-a.rs)||a.ticker.localeCompare(b.ticker));
        for(const a of list) {
          const r=byDate.get(a.ticker)?.get(date),confirmation=byDate.get(a.ticker)?.get(prior);
          if(c.entry==='close'&&!(confirmation&&confirmation.close>a.pivot))continue;
          const signal={...a,setupDate,signalDate:c.entry==='close'?prior:setupDate,orderDate:date,method,status:'unfilled'};signals.push(signal);
          if(positions.has(a.ticker)){signal.status='already_held';continue;}
          if(i-(lastExit.get(a.ticker)??-Infinity)<=c.cooldown){signal.status='cooldown';continue;}
          if(positions.size>=c.maxPositions){signal.status='position_limit';continue;}
          if(!tradeable(r)){signal.status='missing_or_untradeable';continue;}
          if(c.entry==='pivot'&&r.high<a.pivot){signal.status='pivot_not_touched';continue;}
          const price=c.entry==='pivot'?Math.max(r.open,a.pivot):r.open;
          if(!(price>a.stop)){signal.status='invalid_entry_risk';continue;}
          const unitCost=price*(1+c.fee+c.slippage),budget=Math.min(cash,startEquity*c.maxWeight,startEquity/c.maxPositions);
          let qty=Math.floor(budget/unitCost/c.lotSize)*c.lotSize;
          if(c.allocation==='risk')qty=Math.min(Math.floor(Math.min(cash,startEquity*c.maxWeight)/unitCost/c.lotSize)*c.lotSize,Math.floor(startEquity*c.riskBudget/(price-a.stop)/c.lotSize)*c.lotSize);
          const wanted=qty;qty=Math.min(qty,capacity(r,a.avgVolume));
          if(qty<=0){signal.status='cash_or_liquidity_limit';continue;}
          const costs=qty*price*(c.fee+c.slippage);
          cash-=qty*unitCost;
          const p={id:trades.length+1,ticker:a.ticker,method,setupDate,signalDate:signal.signalDate,reasons:a.passed,regime:a.regime,pivot:a.pivot,initialStop:a.stop,stop:a.stop,
            buyDate:date,buyPrice:price,quantity:qty,remaining:qty,allocated:qty*unitCost,unitCost,costs,realized:0,avgVolume:a.avgVolume,
            target:c.exit==='rr'?price+c.rewardR*(price-a.stop):price*(1+c.targetPct),exitRule:c.exit,available:i+c.settlementSessions,status:'open',exits:[]};
          trades.push(p);positions.set(a.ticker,p);signal.status=qty<wanted?'partial_entry':'filled';signal.quantity=qty;
          // An unsettled purchase cannot be stopped out on the same day; remember a possible stop touch.
          if(r.low<=p.stop)p.pendingStop=true;
          if(c.exit==='trailing')p.stop=Math.max(p.stop,r.close*(1-c.trailingPct));
        }
      }
      if(c.liquidate&&step===dates.length-1)for(const p of [...positions.values()]) {const r=byDate.get(p.ticker)?.get(date);if(i>=p.available&&tradeable(r)&&!p.exits.some(x=>x.date===date))sell(p,r,r.close,'end_of_period',i);}
      for(const [t,map] of byDate)if(map.has(date))lastClose.set(t,map.get(date));
      let invested=0,unrealized=0,stalePositions=0;
      for(const p of positions.values()){const mark=lastClose.get(p.ticker);p.markDate=mark?.date;p.markPrice=mark?.close||p.buyPrice;invested+=p.remaining*p.markPrice;unrealized+=p.remaining*(p.markPrice-p.unitCost);if(mark?.date!==date)stalePositions++;}
      const receivable=receivables.reduce((n,x)=>n+x.amount,0);
      curve.push({date,equity:cash+receivable+invested,cash,receivable,invested,realized,unrealized,stalePositions,regime:snapshots.get(prior)?.regime.key||'UNKNOWN'});
      progress({phase:'simulate',method,done:step+1,total:dates.length});
    }
    for(const p of trades){p.unrealized=p.remaining*((p.markPrice||p.buyPrice)-p.unitCost);p.pnl=p.realized+p.unrealized;p.return=p.pnl/p.allocated;}
    const byTicker=Object.values(trades.reduce((o,t)=>{const x=o[t.ticker]||(o[t.ticker]={ticker:t.ticker,trades:0,realized:0,unrealized:0,costs:0});x.trades++;x.realized+=t.realized;x.unrealized+=t.unrealized;x.costs+=t.costs;return o;},{}));
    const regimes=Object.values(curve.slice(1).reduce((o,p,j)=>{const x=o[p.regime]||(o[p.regime]={regime:p.regime,sessions:0,return:1});x.sessions++;x.return*=p.equity/curve[j].equity;return o;},{})).map(x=>({...x,return:x.return-1}));
    const signalRegimes=Object.values(trades.reduce((o,t)=>{const x=o[t.regime]||(o[t.regime]={regime:t.regime,trades:0,closed:0,wins:0,realized:0,unrealized:0});x.trades++;x.closed+=t.status==='closed'?1:0;x.wins+=t.status==='closed'&&t.pnl>0?1:0;x.realized+=t.realized;x.unrealized+=t.unrealized;return o;},{}));
    return {method,trades,signals,curve,byTicker,regimes,signalRegimes,summary:summarize(trades,curve,c.capital)};
  }
  function run(payload,input,settings=E.DEFAULTS,hooks={}) {
    const c=config(input);assert(c.acknowledge===true,'Cần đọc và xác nhận giả định trước khi chạy.');
    const prepared=prepare(payload),cfg={...E.DEFAULTS,...settings,benchmarkTicker:c.benchmark};
    const bench=prepared.series.get(c.benchmark);assert(bench?.length>c.warmup,`Thiếu lịch sử ${c.benchmark}: cần >${c.warmup} phiên.`);
    const cal=bench.map(r=>r.date),first=cal[c.warmup+1];
    assert(c.start>=first&&c.end<=cal.at(-1)&&c.end>=c.start,`Khoảng hỗ trợ: ${first} → ${cal.at(-1)} (đã trừ làm nóng).`);
    assert(c.start>='2022-08-29','Chưa có bộ quy định giao dịch trước 29/08/2022.');
    const dates=cal.filter(d=>d>=c.start&&d<=c.end);assert(dates.length>=2,'Cần ít nhất 2 phiên.');
    const startIndex=cal.indexOf(dates[0]),endIndex=cal.indexOf(dates.at(-1)),snapshots=new Map();
    for(let i=Math.max(c.warmup-1,startIndex-2);i<=endIndex;i++) {
      assert(!hooks.cancelled?.(),'Đã hủy tác vụ.');
      snapshots.set(cal[i],snapshot(prepared,cal[i],cfg));
      hooks.progress?.({phase:'indicators',done:i-startIndex+3,total:endIndex-startIndex+3});
    }
    const methods=c.method==='both'?['market','personal']:[c.method];
    const results=methods.map(m=>simulate(prepared,snapshots,dates,c,cfg,m,hooks.progress,hooks.cancelled));
    if(c.outOfSampleStart){assert(c.outOfSampleStart>dates[0]&&c.outOfSampleStart<=dates.at(-1),'Mốc ngoài mẫu phải sau phiên đầu và không vượt ngày kết thúc.');for(const r of results)r.periods=splitPeriods(r.curve,c.outOfSampleStart);}
    const baselineDate=cal[startIndex-1];
    const benchmarks=[];
    for(const ticker of [...new Set(['VNINDEX','VN30',c.benchmark])]) {
      const map=new Map((prepared.series.get(ticker)||[]).map(r=>[r.date,r.close])),base=map.get(baselineDate);
      if(!base||dates.some(d=>!map.has(d))){benchmarks.push({ticker,available:false,reason:'Thiếu dữ liệu cùng kỳ; không nội suy.'});continue;}
      const curve=[{date:baselineDate,equity:c.capital},...dates.map(date=>({date,equity:c.capital*map.get(date)/base}))];
      benchmarks.push({ticker,available:true,return:curve.at(-1).equity/c.capital-1,maxDrawdown:drawdown(curve),curve,type:'price_index'});
    }
    const latest=snapshots.get(dates.at(-1));
    return {version:VERSION,ruleVersion:RULE_VERSION,calculationVersion:E.VERSION,config:c,settings:cfg,audit:prepared.audit,source:prepared.meta,
      baselineDate,start:dates[0],end:dates.at(-1),limitations:LIMITATIONS,results,benchmarks,
      candidates:Object.fromEntries(['market','personal'].map(m=>[m,candidates(latest,m,c,cfg)]))};
  }
  function currentCycle(payload,settings=E.DEFAULTS) {
    const p=prepare(payload),c=p.series.get(settings.benchmarkTicker)||[];
    assert(c.length>252,'Thiếu dữ liệu để xác định chu kỳ.');
    const latest=snapshot(p,c.at(-1).date,settings).regime;let start=c.at(-1).date,censored=true;
    for(let i=c.length-2;i>=251;i--){if(snapshot(p,c[i].date,settings).regime.key!==latest.key){censored=false;break;}start=c[i].date;}
    return {key:latest.key,label:latest.label,start,end:c.at(-1).date,censored,definition:'Đoạn liên tiếp có cùng Market Regime, tính lại cuối mỗi phiên; không phải toàn bộ chu kỳ kinh tế.'};
  }
  return {VERSION,RULE_VERSION,DEFAULTS,LIMITATIONS,config,prepare,snapshot,candidate,candidates,simulate,run,currentCycle,drawdown,splitPeriods,summarize};
});
