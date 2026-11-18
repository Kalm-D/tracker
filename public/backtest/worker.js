importScripts('../shared/tracker-engine.js','./engine.js');
let payload, dataHash, privateMode=false;
async function load(raw,privateDnse=privateMode) {
  payload=undefined;dataHash=undefined;
  let bytes,entry;
  if(raw)bytes=new Uint8Array(raw);
  else if(privateDnse){const manifest=await fetch('/api/ai/market/active.json',{credentials:'same-origin',cache:'no-store'});if(!manifest.ok)throw Error('Cần phiên Owner để tải snapshot DNSE cho Backtest.');const m=await manifest.json();entry=m.active;if(m.version!==1||!entry||!/^[a-f0-9]{64}$/.test(entry.id)||entry.file!=='snapshots/'+entry.id+'.json.gz'||entry.kind!=='EOD')throw Error('Manifest DNSE không hợp lệ.');const r=await fetch('/api/ai/market/'+entry.file,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Không tải được snapshot DNSE riêng.');bytes=new Uint8Array(await r.arrayBuffer());}
  else {const r=await fetch('../data/market.json.gz',{cache:'no-store'});if(!r.ok)throw new Error('Không tải được snapshot thật. Không dùng file demo dự phòng.');bytes=new Uint8Array(await r.arrayBuffer());}
  if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const candidate=JSON.parse(new TextDecoder().decode(bytes));
  const candidateHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(candidate))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(entry&&(candidateHash!==entry.id||candidate.meta?.asOf!==entry.tradingDate))throw Error('Snapshot Backtest không khớp hash/phiên DNSE.');
  const p=TrackerBacktest.prepare(candidate),indexes=[...p.series].filter(([t,a])=>TrackerEngine.isBenchmarkOrIndexTicker(t)&&a.length>253).map(([ticker,a])=>({ticker,first:a[253].date,last:a.at(-1).date,sessions:a.length}));
  payload=candidate;dataHash=candidateHash;
  postMessage({type:'loaded',audit:p.audit,meta:p.meta,indexes,dataHash});
}
onmessage=async({data})=>{
  try {
    if(data.type==='load'){privateMode=data.privateDnse===true;await load(data.raw,privateMode);}
    else if(data.type==='cycle'){if(!payload)await load();postMessage({type:'cycle',cycle:TrackerBacktest.currentCycle(payload,data.settings)});}
    else if(data.type==='run') {
      if(!payload)await load();
      let last=0;
      const result=TrackerBacktest.run(payload,data.config,data.settings,{progress:p=>{if(Date.now()-last>200){postMessage({type:'progress',...p});last=Date.now();}}});
      result.dataHash=dataHash;postMessage({type:'result',result});
    } else if(data.type==='exportData')postMessage({type:'dataset',text:JSON.stringify(payload),dataHash});
  }catch(e){postMessage({type:'error',message:e.message});}
};
