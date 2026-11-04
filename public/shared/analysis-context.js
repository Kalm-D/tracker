/* Chọn dữ liệu cùng kỳ trước khi gọi engine gốc; không thay công thức/ngưỡng. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./tracker-engine.js'):root.TrackerEngine);if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerAnalysisContext=api;})(globalThis,function(E){
  'use strict';
  const VERSION='same-date-window-63-126-v1';
  const MARKET_LIMITATION='Chưa đủ dữ liệu để kết luận toàn thị trường; các điểm và độ rộng chỉ mô tả tập đủ dữ liệu cùng kỳ.';
  const REASONS=Object.freeze({DIFFERENT_SESSION:'Khác phiên benchmark',INSUFFICIENT_HISTORY:'Thiếu lịch sử theo điều kiện gốc',WINDOW_MISMATCH:'Thiếu dữ liệu cùng kỳ RS 63/126 phiên',INVALID_SYMBOL:'Không phải mã cổ phiếu cơ sở',MISSING:'Chưa có dữ liệu tại phiên chọn'});
  function sameDates(a,b,n){if(a.length<=n||b.length<=n)return false;for(let i=1;i<=n+1;i++)if(a.at(-i).date!==b.at(-i).date)return false;return true;}
  function period(rows,benchmark,n){const stockStart=rows.at(-1-n)?.date||null,benchmarkStart=benchmark.at(-1-n)?.date||null,stockEnd=rows.at(-1)?.date||null,benchmarkEnd=benchmark.at(-1)?.date||null;return {observations:n,stockStart,benchmarkStart,stockEnd,benchmarkEnd,available:!!stockStart&&!!benchmarkStart&&stockEnd===benchmarkEnd&&sameDates(rows,benchmark,n)};}
  function build(fullSeries,options={}){
    const settings={...E.DEFAULTS,...options.settings},benchmarkTicker=String(settings.benchmarkTicker).toUpperCase(),allBenchmark=fullSeries.get(benchmarkTicker)||[],asOf=options.asOf||allBenchmark.at(-1)?.date;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf||''))throw Error('Thiếu ngày phân tích hợp lệ.');
    if(options.today&&asOf>options.today)throw Error('Không phân tích phiên tương lai.');
    const benchmark=allBenchmark.filter(r=>r.date<=asOf);
    if(benchmark.length<210||benchmark.at(-1)?.date!==asOf)throw Error('Thiếu benchmark cùng phiên hoặc đủ lịch sử.');
    const series=new Map([[benchmarkTicker,benchmark]]),byTicker=new Map(),periods={},excluded=[],eligibleTickers=[];let sameDate=0,recent=0,total=0;
    const previous=benchmark.at(-2)?.date;
    for(const [ticker,all] of fullSeries){if(E.isBenchmarkOrIndexTicker(ticker,benchmarkTicker))continue;const rows=all.filter(r=>r.date<=asOf),last=rows.at(-1),isStock=E.isPlainStockTicker(ticker);if(isStock)total++;
      const windows=Object.fromEntries([21,63,126,252].map(n=>[n,period(rows,benchmark,n)]));periods[ticker]=windows;
      if(isStock&&rows.length>=210&&(last?.date===asOf||last?.date===previous))recent++;
      if(isStock&&rows.length>=210&&last?.date===asOf)sameDate++;
      let reason=!isStock?'INVALID_SYMBOL':!last?'MISSING':rows.length<210?'INSUFFICIENT_HISTORY':last.date!==asOf?'DIFFERENT_SESSION':!windows[63].available||!windows[126].available?'WINDOW_MISMATCH':null;
      if(reason){excluded.push({ticker,reason,message:REASONS[reason],stockDate:last?.date||null,benchmarkDate:asOf,rows:rows.length});continue;}
      series.set(ticker,rows);eligibleTickers.push(ticker);byTicker.set(ticker,{status:'D0',label:'D0',tone:'good',staleSessions:0});
    }
    eligibleTickers.sort();excluded.sort((a,b)=>a.ticker.localeCompare(b.ticker));
    const coverage={eligible:eligibleTickers.length,recent,sameDate,snapshotStocks:total,denominatorType:'legacy-recent-D0-D1',denominator:recent,ratio:recent?eligibleTickers.length/recent:null};
    const context={schema:'tracker-analysis-context-v1',cohortPolicyVersion:VERSION,engineVersion:E.VERSION,snapshotId:options.snapshotId||null,asOf,benchmarkTicker,benchmarkDate:asOf,eligibleTickers,excluded,periods,coverage,marketScope:'eligible-subset',wholeMarketConclusionAvailable:false,marketLimitation:MARKET_LIMITATION,cohortId:null};
    context.contextKey=JSON.stringify({policy:VERSION,engine:E.VERSION,snapshotId:context.snapshotId,asOf,benchmarkTicker,settings:Object.fromEntries(Object.entries(settings).sort(([a],[b])=>a.localeCompare(b))),eligibleTickers});
    return {context,series,quality:{byTicker}};
  }
  function calculate(fullSeries,options={}){const out=build(fullSeries,options),metrics=E.computeMetrics(out.series,{...E.DEFAULTS,...options.settings},out.quality),regime=E.computeMarketRegime(out.series.get(out.context.benchmarkTicker),metrics);E.applyCompositeScores(metrics,regime,{...E.DEFAULTS,...options.settings});return {...out,metrics,regime};}
  function publicContext(context){const {contextKey,periods,...rest}=context;return rest;}
  function maskAdvanced(advanced,periods){return {...advanced,rs:Object.fromEntries(Object.entries({rs1m:21,rs3m:63,rs6m:126,rs12m:252}).map(([key,n])=>[key,periods?.[n]?.available?advanced.rs[key]:null])),periodAvailability:periods};}
  return {VERSION,MARKET_LIMITATION,REASONS,sameDates,period,build,calculate,publicContext,maskAdvanced};
});
