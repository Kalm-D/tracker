'use strict';
// Dùng đúng validator hiện có; không giữ toàn bộ OHLCV trong luồng HTTP.
const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs');
const M=require('./private-market.cjs');
try{
 const now=new Date(workerData.now),before=workerData.previous;
 const previous=before?M.decode(fs.readFileSync(before.file),before.entry,null,now):null;
 const payload=M.decode(Buffer.from(workerData.bytes),workerData.entry,previous,now);
 parentPort.postMessage({meta:payload.meta});
}catch{parentPort.postMessage({error:'Snapshot DNSE không đạt kiểm định hash/phiên/nguồn hoặc bị lùi dữ liệu.'});}
