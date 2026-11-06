'use strict';
// Chỉ tạo golden từ commit audit bất biến; không đọc code đang sửa để cập nhật kỳ vọng.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),zlib=require('node:zlib'),vm=require('node:vm');
const H=require('../tests/helpers/quant.cjs'),base='e3a7e079a5c27a9762db0414d66a6bcee0ada4a1',root=path.resolve(__dirname,'..');
const show=file=>cp.execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:24000000});
const html=show('public/index.html').toString(),context={module:{exports:{}}};vm.runInNewContext(show('public/shared/tracker-engine.js').toString(),context);const E=context.module.exports,Q=H.quant(html);
const all=JSON.parse(zlib.gunzipSync(show('public/data/market.json.gz'))),tickers=['VNINDEX','FPT','MBB','VCB','HPG','HUB','QNP','AMC','BAF','ABB'];
const payload={...all,meta:{...all.meta,symbolCount:tickers.length},symbols:all.symbols.filter(s=>tickers.includes(s.ticker))};payload.meta.rowCount=payload.symbols.reduce((n,s)=>n+s.rows.length,0);
const cases=['2026-08-28','2026-09-30','2026-10-30'].map(date=>{
 const series=E.buildSeries(payload.symbols.flatMap(s=>s.rows.filter(r=>r[0]<=date).map(([date,open,high,low,close,volume])=>({ticker:s.ticker,exchange:s.exchange,sector:s.sector,date,open,high,low,close,volume}))));
 const quality={byTicker:new Map([...series].map(([t,a])=>[t,{status:a.at(-1).date===date?'D0':'D1',label:'baseline',tone:'info'}]))},metrics=E.computeMetrics(series,E.DEFAULTS,quality),benchmark=series.get('VNINDEX'),regime=E.computeMarketRegime(benchmark,metrics);E.applyCompositeScores(metrics,regime,E.DEFAULTS);
 const health=H.health(html,Q,metrics,benchmark,regime),advanced=metrics.map(m=>({ticker:m.ticker,adv:Q.advanced(m.rows,benchmark,{rsPercentile:m.rsPercentile,marketScore:health.score})}));
 return {date,sharedHash:H.hash({metrics,regime}),healthHash:H.hash(health),advancedHash:H.hash(advanced),healthScore:health.score};
});
const dir=path.join(root,'tests/fixtures');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'core-baseline.json.gz'),zlib.gzipSync(JSON.stringify(payload),{mtime:0}));fs.writeFileSync(path.join(dir,'core-golden.json'),JSON.stringify({baseline:base,inputHash:H.hash(payload),cases},null,2));console.log('Đã khóa baseline ba phiên từ '+base);
