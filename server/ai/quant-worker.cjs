'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const B=require('../../public/backtest/engine.js'),E=require('../../public/shared/tracker-engine.js'),Q=require('../../public/shared/data-quality.js'),C=require('../../public/shared/analysis-context.js');
try{
 const bytes=fs.readFileSync(workerData.file),raw=bytes[0]===31?zlib.gunzipSync(bytes):bytes,p=JSON.parse(raw);
 const prepared=B.prepare(p),date=prepared.audit.last;
 if(!date||date>new Date().toISOString().slice(0,10))throw new Error('Snapshot không có ngày hợp lệ hoặc có dữ liệu tương lai.');
 const benchmark=prepared.series.get('VNINDEX');if(p.meta.asOf!==date||!benchmark||benchmark.length<210||benchmark.at(-1).date!==date)throw Error('Snapshot thiếu VNINDEX cùng phiên/đủ lịch sử.');
 const canonicalSnapshotId='sha256:'+crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),quality=Q.assess({...p.meta,validation:{invalidRows:prepared.audit.invalid}});
 const snap=C.calculate(prepared.series,{asOf:date,snapshotId:canonicalSnapshotId,today:Q.clock().today});snap.context.cohortId='sha256:'+crypto.createHash('sha256').update(snap.context.contextKey).digest('hex');
 const analysisContext=C.publicContext(snap.context),metrics=snap.metrics.map(m=>{
  const out={};for(const [k,v] of Object.entries(m))if(k!=='rows'&&(v===null||['string','number','boolean'].includes(typeof v)))out[k]=typeof v==='number'&&!Number.isFinite(v)?null:v;return out;
 });
 const priceSummaries=Object.fromEntries([...prepared.series].filter(([,rows])=>rows.length).map(([ticker,rows])=>{
  const last=rows.at(-1),recent=rows.slice(-20),avgVol20=recent.length===20?recent.reduce((n,r)=>n+r.volume,0)/20:null;
  const change=n=>rows.length>n&&rows.at(-1-n).close>0?(last.close/rows.at(-1-n).close-1)*100:null;
  return [ticker,{ticker,dataDate:last.date,close:last.close,volume:last.volume,avgVol20,volumeRatio20:avgVol20>0?last.volume/avgVol20:null,change1dPct:change(1),change20dPct:change(20),sessions:rows.length}];
 }));
 parentPort.postMessage({canonicalSnapshotId,analysisContext,quality,cohorts:{policy:C.VERSION,mismatchedSymbols:analysisContext.excluded.filter(x=>x.reason==='DIFFERENT_SESSION').map(x=>({ticker:x.ticker,symbolDate:x.stockDate,benchmarkDate:date,reason:x.message}))},priceSummaries,meta:p.meta,audit:prepared.audit,date,sha256:crypto.createHash('sha256').update(raw).digest('hex'),engineVersion:E.VERSION,strategyVersion:null,regime:snap.regime,metrics,tickers:[...prepared.series.keys()],lastBars:Object.fromEntries([...prepared.series].map(([t,a])=>[t,a.at(-1)]))});
}catch(e){parentPort.postMessage({error:e.message});}
