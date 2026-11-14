(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerPersonalData=api;})(globalThis,function(){
  'use strict';
  const MAX_BYTES=64*1024*1024,MAX_ROWS=750000;
  // Giải nén theo lô có giới hạn; không gửi tệp đến mạng.
  function decode(input,name,codec){
    let bytes=new Uint8Array(input);
    if(bytes.length>MAX_BYTES)throw Error('Tệp vượt giới hạn 64 MB.');
    if(bytes[0]===31&&bytes[1]===139){
      if(!codec?.Gunzip)throw Error('Thiếu bộ giải nén.');
      const chunks=[];let size=0;
      const stream=new codec.Gunzip(chunk=>{size+=chunk.length;if(size>MAX_BYTES)throw Error('Dữ liệu sau giải nén vượt 64 MB.');chunks.push(chunk);});
      for(let i=0;i<bytes.length;i+=4096)stream.push(bytes.subarray(i,i+4096),i+4096>=bytes.length);
      bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    }
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
    return /\.csv$/i.test(name)?{kind:'csv',text}:{kind:'snapshot',payload:JSON.parse(text)};
  }
  async function prepare(payload,{inflate,quality,crypto,now=new Date()}={}){
    if(payload?.meta?.schema!=='shared-market-v1'||payload.meta.isDemo!==false)throw Error('Cần snapshot thật có schema shared-market-v1.');
    const flat=inflate(payload),m=flat.meta;
    if(!flat.rows.length||flat.rows.length>MAX_ROWS||m.rowCount!==flat.rows.length)throw Error('Số dòng không hợp lệ hoặc không khớp metadata.');
    const checked=quality.sanitize(flat.rows);
    if(checked.validation.invalidRows)throw Error('Tệp có bar OHLCV sai; giữ nguyên dữ liệu trước.');
    const today=quality.clock(now).today;let last='',benchmarkLast='',benchmarkCount=0;
    for(const row of checked.rows){if(row.date>last)last=row.date;if(row.date>today)throw Error('Tệp có dữ liệu ở tương lai.');if(row.ticker==='VNINDEX'){benchmarkCount++;if(row.date>benchmarkLast)benchmarkLast=row.date;}}
    if(!quality.dateValid(m.asOf)||last!==m.asOf)throw Error('Phiên metadata không khớp dữ liệu.');
    if(benchmarkCount<210||benchmarkLast!==m.asOf)throw Error('Cần VNINDEX đủ lịch sử và cùng phiên dữ liệu.');
    if(!crypto?.subtle)throw Error('Cần HTTPS để kiểm tra SHA-256.');
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    return {rows:checked.rows,meta:{...m,validation:checked.validation,snapshotId:'sha256:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),hashBasis:'json-stringify-utf8-v1',personalUseOnly:true,quality:quality.assess(m,now)}};
  }
  function store(indexedDB){
    let opening;
    async function db(){if(!indexedDB)throw Error('Trình duyệt không cho lưu dữ liệu.');if(!opening)opening=new Promise((resolve,reject)=>{const r=indexedDB.open('tracker_personal_files_v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Đóng tab Tracker cũ rồi thử lại.'));}).catch(e=>{opening=null;throw e;});return opening;}
    return {async get(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('files').objectStore('files').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},async put(value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').put(value,'latest');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không đủ dung lượng lưu trên thiết bị.'));});}};
  }
  return {MAX_BYTES,MAX_ROWS,decode,prepare,store};
});
