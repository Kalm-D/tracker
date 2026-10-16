const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const B=require('../public/backtest/engine.js');
for(const name of ['market.json','market.json.gz']){
  let b=fs.readFileSync(require('node:path').join(__dirname,'../public/data',name));if(name.endsWith('.gz'))b=zlib.gunzipSync(b);
  const p=JSON.parse(b);console.log(JSON.stringify({file:name,meta:p.meta,sha256:crypto.createHash('sha256').update(b).digest('hex')}));
  try{const d=B.prepare(p);console.log(JSON.stringify(d.audit));for(const [t,a] of d.series)if(t==='VNINDEX'||t==='VN30')console.log(JSON.stringify({ticker:t,sessions:a.length,from:a[0]?.date,to:a.at(-1)?.date,firstBacktest:a[253]?.date}));}catch(e){console.log(e.message);}
}
