const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),zlib=require('node:zlib');
const B=require('../public/backtest/engine.js');
try {
  const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(workerData.snapshot)));
  let last=0;
  const result=B.run(payload,workerData.config,workerData.settings,{progress:p=>{if(Date.now()-last>500){parentPort.postMessage({type:'progress',progress:p});last=Date.now();}}});
  result.dataHash=workerData.dataHash;result.createdAt=new Date().toISOString();
  parentPort.postMessage({type:'result',result});
}catch(e){parentPort.postMessage({type:'error',error:e.message});}
