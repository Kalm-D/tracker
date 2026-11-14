(function(root){
  'use strict';
  const quality=root.TrackerDataQuality,fallbackUrl=new URL('./fflate.min.js',document.currentScript?.src||new URL('./shared/market-data.js',document.baseURI)).href;
  let decoder,pending;const knownGood=new Map();
  function gzipFallback(){if(root.fflate?.gunzipSync)return Promise.resolve(root.fflate);if(!decoder)decoder=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=fallbackUrl;script.onload=()=>root.fflate?.gunzipSync?resolve(root.fflate):reject(Error('Không tải được bộ giải nén.'));script.onerror=()=>reject(Error('Không tải được bộ giải nén.'));document.head.appendChild(script);}).catch(e=>{decoder=null;throw e;});return decoder;}
  const number=v=>v===null||v===''||typeof v==='boolean'?NaN:Number(v);
  function normalizeRow(row,ticker,exchange,sector){if(Array.isArray(row)){const [date,open,high,low,close,volume]=row;return {ticker,exchange,sector,date:String(date),open:number(open),high:number(high),low:number(low),close:number(close),volume:number(volume)};}if(!row?.ticker||!row?.date)return null;return {...row,ticker:String(row.ticker).trim().toUpperCase(),date:String(row.date).slice(0,10),open:number(row.open),high:number(row.high),low:number(row.low),close:number(row.close),volume:number(row.volume)};}
  function inflate(payload){if(Array.isArray(payload))return {meta:{},rows:payload.map(r=>normalizeRow(r)).filter(Boolean)};if(Array.isArray(payload?.rows))return {meta:payload.meta||{},rows:payload.rows.map(r=>normalizeRow(r)).filter(Boolean)};return {meta:payload?.meta||{},rows:(payload?.symbols||[]).flatMap(s=>(s.rows||[]).map(r=>normalizeRow(r,String(s.ticker||'').toUpperCase(),s.exchange,s.sector)).filter(Boolean))};}
  async function parsePayload(response,url){if(!url.endsWith('.gz'))return response.json();const bytes=new Uint8Array(await response.arrayBuffer());if(typeof root.DecompressionStream==='function')try{return await new root.Response(new root.Response(bytes).body.pipeThrough(new root.DecompressionStream('gzip'))).json();}catch(_){}const gzip=await gzipFallback();return JSON.parse(gzip.strFromU8(gzip.gunzipSync(bytes)));}
  async function digest(payload){if(!root.crypto?.subtle)throw Error('Trình duyệt thiếu SHA-256; cần HTTPS hoặc localhost.');const bytes=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));return 'sha256:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
  async function refreshLatest(result){
    // Không trộn giá VNDIRECT/cache live vào snapshot KBS chưa đối chiếu nguồn.
    result.meta={...result.meta,quality:quality.assess(result.meta),refreshedOnOpen:false};return result;
  }
  async function read(url){const key=new URL(url,document.baseURI).href;let absolute=key;try{
    if(!quality)throw Error('Thiếu Data Quality Layer.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let payload;
    try{let response=await fetch(absolute,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json, application/gzip'}});if(!response.ok&&absolute.endsWith('.gz')){absolute=absolute.slice(0,-3);response=await fetch(absolute,{signal:controller.signal,cache:'no-store'});}if(!response.ok)throw Error('Shared market data HTTP '+response.status);payload=await parsePayload(response,absolute);}finally{clearTimeout(timer);}
    if(payload?.meta?.isDemo!==false)throw Error('Từ chối dữ liệu demo hoặc chưa xác nhận nguồn thật.');
    const result=inflate(payload);if(payload.meta.rowCount!==result.rows.length)throw Error("Số dòng snapshot không khớp metadata.");const validation=quality.sanitize(result.rows);if(!validation.rows.length)throw Error('Không có thanh giá hợp lệ.');
    const latest=validation.rows.reduce((d,r)=>r.date>d?r.date:d,''),asOf=result.meta.asOf;
    if(!quality.dateValid(asOf)||latest!==asOf||asOf>quality.clock().today)throw Error('Phiên snapshot không khớp dữ liệu hoặc ở tương lai.');
    const benchmark=validation.rows.filter(r=>r.ticker==='VNINDEX');if(benchmark.length<210||benchmark.at(-1).date!==asOf)throw Error('Thiếu VNINDEX đủ lịch sử và cùng phiên snapshot.');
    const prior=knownGood.get(key);if(prior&&asOf<prior.meta.asOf)throw Error('Snapshot mới cũ hơn bản đang dùng.');
    result.rows=validation.rows;result.meta={...result.meta,validation:validation.validation,snapshotId:await digest(payload),hashBasis:'json-stringify-utf8-v1',url:absolute,loadedAt:new Date().toISOString()};
    await refreshLatest(result);if(knownGood.size>=2&&!knownGood.has(key))knownGood.delete(knownGood.keys().next().value);knownGood.set(key,result);return result;
  }catch(error){const prior=knownGood.get(key);if(!prior)throw error;const result={rows:prior.rows,meta:{...prior.meta,refreshError:true,loadedAt:new Date().toISOString()}};return refreshLatest(result);}}
  async function load(url='./data/market.json.gz'){const key=new URL(url,document.baseURI).href;if(pending?.key===key)return pending.promise;const promise=read(url);pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}}
  root.SharedMarketData={load,inflate,normalizeRow,refreshLatest};
})(window);
