'use strict';
// Audit chỉ đọc: kiểm tra hai dạng của cùng snapshot, không sửa dữ liệu hoặc công thức.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const B=require('../public/backtest/engine.js');
const VERSION='snapshot-audit-1.0.0';

function auditDirectory(directory=path.join(__dirname,'../public/data')){
  const errors=[],files=[],payloads=new Map();
  const issue=(code,file,message)=>errors.push({code,file,message});
  for(const file of ['market.json','market.json.gz']){
    let raw,payload;
    try{
      const bytes=fs.readFileSync(path.join(directory,file));
      raw=file.endsWith('.gz')?zlib.gunzipSync(bytes):bytes;
      payload=JSON.parse(raw.toString('utf8'));
    }catch(error){
      issue('SNAPSHOT_READ_ERROR',file,'Không đọc/giải nén/parse được snapshot: '+error.message);
      files.push({file,readable:false});
      continue;
    }
    payloads.set(file,payload);
    const m=payload?.meta||{},record={file,readable:true,bytes:raw.length,rawSha256:crypto.createHash('sha256').update(raw).digest('hex'),meta:Object.fromEntries(['schema','asOf','generatedAt','source','isDemo','symbolCount','rowCount'].map(k=>[k,m[k]??null]))};
    files.push(record);
    if(m.isDemo!==false)issue('DEMO_OR_UNVERIFIED_SOURCE',file,'Từ chối demo hoặc nguồn thật chưa được xác nhận.');
    if(m.schema!=='shared-market-v1')issue('SCHEMA_INVALID',file,'Cần schema shared-market-v1.');
    if(typeof m.source!=='string'||!m.source.trim())issue('SOURCE_MISSING',file,'Thiếu tên nguồn dữ liệu.');
    let prepared;
    try{prepared=B.prepare(payload);}catch(error){
      issue('PREPARE_ERROR',file,error.message);
      continue;
    }
    const a=prepared.audit;
    record.audit=a;
    if(a.invalid)issue('INVALID_OHLCV',file,'Validator hiện hành từ chối '+a.invalid+' bar OHLCV; không được coi quarantine là artifact đạt.');
    if(!a.rows)issue('EMPTY_SNAPSHOT',file,'Snapshot không có bar hợp lệ.');
    if(!Number.isSafeInteger(m.rowCount)||m.rowCount!==a.rows+a.invalid)issue('ROW_COUNT_MISMATCH',file,'rowCount không khớp số bar đầu vào.');
    if(!Number.isSafeInteger(m.symbolCount)||m.symbolCount!==a.symbols)issue('SYMBOL_COUNT_MISMATCH',file,'symbolCount không khớp số mã.');
    if(typeof m.asOf!=='string'||m.asOf!==a.last)issue('SESSION_MISMATCH',file,'Phiên metadata không khớp phiên cuối hợp lệ.');
    record.benchmarks=['VNINDEX','VN30'].filter(t=>prepared.series.has(t)).map(t=>{const rows=prepared.series.get(t);return {ticker:t,sessions:rows.length,from:rows[0]?.date||null,to:rows.at(-1)?.date||null,firstBacktest:rows[253]?.date||null};});
  }
  // So payload đã parse: cho phép khoảng trắng/thứ tự key object khác, giữ nguyên thứ tự các bar.
  const pairEquivalent=payloads.size===2?isDeepStrictEqual(payloads.get('market.json'),payloads.get('market.json.gz')):null;
  if(pairEquivalent===false)issue('SNAPSHOT_PAIR_MISMATCH','market.json + market.json.gz','JSON và gzip không biểu diễn cùng một snapshot.');
  return {version:VERSION,ok:errors.length===0,pairEquivalent,files,errors,limitations:['Audit cấu trúc/artifact không thay publication gate, kiểm tra độ phủ, provenance, freshness hoặc quyền sử dụng nguồn.']};
}

function main(args=process.argv.slice(2)){
  if(args.length&&!(args.length===2&&args[0]==='--dir'&&args[1]&&!args[1].startsWith('--'))){
    console.log(JSON.stringify({version:VERSION,ok:false,errors:[{code:'ARGUMENT_ERROR',message:'Dùng node tools/audit-data.cjs [--dir <thư-mục-dữ-liệu>]'}]}));
    return 2;
  }
  const result=auditDirectory(args.length?path.resolve(args[1]):undefined);
  console.log(JSON.stringify(result));
  return result.ok?0:1;
}
if(require.main===module)process.exitCode=main();
module.exports={VERSION,auditDirectory,main};
