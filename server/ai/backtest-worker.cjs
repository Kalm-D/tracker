'use strict';
const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const B=require('../../public/backtest/engine.js'),A=require('./backtest.cjs');
try{
 const bytes=fs.readFileSync(workerData.file),raw=bytes[0]===31?zlib.gunzipSync(bytes):bytes,p=JSON.parse(raw),sha=crypto.createHash('sha256').update(raw).digest('hex');
 if(workerData.expectedHash&&sha!==workerData.expectedHash)throw new Error('Snapshot đã đổi giữa lúc nghiên cứu; chạy lại để đồng nhất nguồn.');
 const prepared=B.prepare(p),c=workerData.config,cal=(prepared.series.get(B.DEFAULTS.benchmark)||[]).map(r=>r.date);
 if(!prepared.audit.last||prepared.audit.last>new Date().toISOString().slice(0,10))throw new Error('Dữ liệu có ngày tương lai.');
 for(const t of c.tickers)if(!prepared.series.has(t))throw new Error('Mã không có trong snapshot: '+t);
 const dates=cal.filter(d=>d>=c.start&&d<=c.end);if(dates.length>A.MAX_SESSIONS)throw new Error('Bản thử nghiệm giới hạn '+A.MAX_SESSIONS+' phiên mỗi tác vụ.');
 let last=0;const result=B.run(p,c,undefined,{progress:value=>{if(Date.now()-last>500){last=Date.now();parentPort.postMessage({progress:value});}}});
 parentPort.postMessage({result:A.compact(result,sha)});
}catch(e){parentPort.postMessage({error:e.message});}
