'use strict';
// Hợp đồng độ phủ: phân biệt nguồn trả rỗng với lỗi tải; không thay công thức D2/điểm.
const Q=require('../public/shared/data-quality.js');
const POLICY='dnse-explicit-coverage-1',ticker=t=>typeof t==='string'&&(t==='VNINDEX'||/^[A-Z0-9]{3}$/.test(t));
const last=s=>s?.rows?.at(-1)?.[0]||null;
function make(payload,quality,expected,previous=null){
 if(!Number.isInteger(expected)||expected<1||quality.length!==expected)throw Error('DNSE_COVERAGE_INCOMPLETE');
 const map=new Map(payload.symbols.map(s=>[s.ticker,s])),seen=new Set(),records=[],retained=[];
 for(const row of quality){
  const count=Number(row.rows),name=row.ticker;
  if(!ticker(name)||seen.has(name)||row.source_provider!=='DNSE'||!['ok','too_few_rows','empty'].includes(row.status)||!Number.isInteger(count)||count<0)throw Error('DNSE_COVERAGE_SOURCE_ERROR');
  seen.add(name);const symbol=map.get(name);
  if(row.status==='empty'?(count!==0||!!symbol):(count<1||!symbol||symbol.rows.length!==count||last(symbol)!==row.last_date))throw Error('DNSE_COVERAGE_ROW_MISMATCH');
  records.push({ticker:name,sourceStatus:row.status,rows:count,lastDate:count?row.last_date:null});
 }
 // Mã bị bỏ khỏi danh mục hoặc nguồn trả rỗng vẫn giữ lịch sử DNSE tốt để tra cứu.
 // Ngày của các bar giữ nguyên; không biến chúng thành giá của phiên mới.
 for(const symbol of previous?.symbols||[])if(!map.has(symbol.ticker)){
  if(last(symbol)>=payload.meta.asOf)throw Error('DNSE_COVERAGE_RETAINED_NOT_OLD');
  const held=structuredClone(symbol);payload.symbols.push(held);map.set(symbol.ticker,held);retained.push(symbol.ticker);
 }
 const empty=records.filter(r=>r.sourceStatus==='empty').map(r=>r.ticker);
 payload.meta.coverage={...payload.meta.coverage,policy:POLICY,attempted:expected,completed:expected,failedTickers:empty,records,retainedTickers:retained};
 payload.meta.symbolCount=payload.symbols.length;payload.meta.rowCount=payload.symbols.reduce((n,s)=>n+s.rows.length,0);
 validate(payload,previous);return payload;
}
function validate(payload,previous=null){
 const c=payload.meta.coverage;
 if(c.policy!==POLICY||!Array.isArray(c.records)||!Number.isInteger(c.attempted)||c.attempted!==c.records.length||c.completed!==c.attempted||!Array.isArray(c.retainedTickers)||!Array.isArray(c.failedTickers))throw Error('DNSE_COVERAGE_CONTRACT_INVALID');
 const symbols=new Map(payload.symbols.map(s=>[s.ticker,s])),records=new Map(),empty=new Set(),retained=new Set(c.retainedTickers),old=new Map((previous?.symbols||[]).map(s=>[s.ticker,s]));
 if(retained.size!==c.retainedTickers.length)throw Error('DNSE_COVERAGE_DUPLICATE');
 for(const r of c.records){
  if(!ticker(r.ticker)||records.has(r.ticker)||!['ok','too_few_rows','empty'].includes(r.sourceStatus)||!Number.isInteger(r.rows)||r.rows<0)throw Error('DNSE_COVERAGE_RECORD_INVALID');
  records.set(r.ticker,r);const symbol=symbols.get(r.ticker);
  if(r.sourceStatus==='empty'){
   if(r.rows!==0||r.lastDate!==null||symbol&&!retained.has(r.ticker))throw Error('DNSE_COVERAGE_EMPTY_INVALID');empty.add(r.ticker);
  }else if(!Q.dateValid(r.lastDate)||!symbol||symbol.rows.length!==r.rows||last(symbol)!==r.lastDate)throw Error('DNSE_COVERAGE_RECORD_MISMATCH');
 }
 if(!records.has('VNINDEX')||records.get('VNINDEX').sourceStatus!=='ok')throw Error('DNSE_COVERAGE_BENCHMARK_MISSING');
 for(const name of retained){const symbol=symbols.get(name);if(!ticker(name)||!symbol||last(symbol)>=payload.meta.asOf||records.has(name)&&!empty.has(name))throw Error('DNSE_COVERAGE_RETAINED_INVALID');if(previous&&(!old.has(name)||JSON.stringify(symbol)!==JSON.stringify(old.get(name))))throw Error('DNSE_COVERAGE_HISTORY_CHANGED');}
 if(c.failedTickers.length!==empty.size||new Set(c.failedTickers).size!==empty.size||c.failedTickers.some(t=>!empty.has(t)))throw Error('DNSE_COVERAGE_MISSING_LIST_INVALID');
 for(const name of symbols.keys())if(!records.has(name)&&!retained.has(name))throw Error('DNSE_COVERAGE_UNDECLARED_SYMBOL');
 return [...empty];
}
module.exports={POLICY,make,validate};
