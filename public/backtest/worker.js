importScripts('../shared/tracker-engine.js','./engine.js');
let payload, dataHash;
async function load(raw) {
  let bytes;
  if(raw)bytes=new Uint8Array(raw);
  else {const r=await fetch('../data/market.json.gz',{cache:'no-store'});if(!r.ok)throw new Error('Không tải được snapshot thật. Không dùng file demo dự phòng.');bytes=new Uint8Array(await r.arrayBuffer());}
  if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  payload=JSON.parse(new TextDecoder().decode(bytes));
  dataHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const p=TrackerBacktest.prepare(payload),indexes=[...p.series].filter(([t,a])=>TrackerEngine.isBenchmarkOrIndexTicker(t)&&a.length>253).map(([ticker,a])=>({ticker,first:a[253].date,last:a.at(-1).date,sessions:a.length}));
  postMessage({type:'loaded',audit:p.audit,meta:p.meta,indexes,dataHash});
}
onmessage=async({data})=>{
  try {
    if(data.type==='load')await load(data.raw);
    else if(data.type==='cycle'){if(!payload)await load();postMessage({type:'cycle',cycle:TrackerBacktest.currentCycle(payload,data.settings)});}
    else if(data.type==='run') {
      if(!payload)await load();
      let last=0;
      const result=TrackerBacktest.run(payload,data.config,data.settings,{progress:p=>{if(Date.now()-last>200){postMessage({type:'progress',...p});last=Date.now();}}});
      result.dataHash=dataHash;postMessage({type:'result',result});
    } else if(data.type==='exportData')postMessage({type:'dataset',text:JSON.stringify(payload),dataHash});
  }catch(e){postMessage({type:'error',message:e.message});}
};
