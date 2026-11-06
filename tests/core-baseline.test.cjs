'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const E=require('../public/shared/tracker-engine.js'),H=require('./helpers/quant.cjs'),dir=path.join(__dirname,'fixtures');
const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,'core-baseline.json.gz')))),golden=JSON.parse(fs.readFileSync(path.join(dir,'core-golden.json'))),html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),Q=H.quant(html);
test('Fixture công thức có hash cố định, độc lập snapshot tự cập nhật',()=>assert.equal(H.hash(payload),golden.inputHash));
for(const expected of golden.cases)test('Shared/Advanced/Market Health giữ đúng baseline '+expected.date,()=>{
 const date=expected.date,series=E.buildSeries(payload.symbols.flatMap(s=>s.rows.filter(r=>r[0]<=date).map(([date,open,high,low,close,volume])=>({ticker:s.ticker,exchange:s.exchange,sector:s.sector,date,open,high,low,close,volume}))));
 const quality={byTicker:new Map([...series].map(([t,a])=>[t,{status:a.at(-1).date===date?'D0':'D1',label:'baseline',tone:'info'}]))},metrics=E.computeMetrics(series,E.DEFAULTS,quality),benchmark=series.get('VNINDEX'),regime=E.computeMarketRegime(benchmark,metrics);E.applyCompositeScores(metrics,regime,E.DEFAULTS);
 const health=H.health(html,Q,metrics,benchmark,regime),advanced=metrics.map(m=>({ticker:m.ticker,adv:Q.advanced(m.rows,benchmark,{rsPercentile:m.rsPercentile,marketScore:health.score})}));
 assert.equal(H.hash({metrics,regime}),expected.sharedHash);assert.equal(H.hash(health),expected.healthHash);assert.equal(H.hash(advanced),expected.advancedHash);
});
test('Quant Core giữ đầy đủ nhóm bằng chứng khi lịch sử ngắn',()=>{
 const s=payload.symbols.find(s=>s.ticker==='FPT'),b=payload.symbols.find(s=>s.ticker==='VNINDEX'),rows=x=>x.rows.map(([date,open,high,low,close,volume])=>({date,open,high,low,close,volume}));
 const prior=rows(s).filter(r=>r.date<='2026-09-30'),benchmark=rows(b).filter(r=>r.date<='2026-09-30');const result=Q.advanced(prior,benchmark,{});assert.equal(result.evidence.length+result.violations.length,9);assert.equal(new Set([...result.evidence,...result.violations]).size,9);assert.doesNotThrow(()=>Q.advanced(prior.slice(-30),benchmark.slice(-30),{}));
});
