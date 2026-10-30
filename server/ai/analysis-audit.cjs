'use strict';
const C=require('./contracts.cjs');
const FILTER_NOTICE='Một phần phản hồi AI đã bị loại vì chưa khớp số liệu hoặc nguồn dẫn. Các luận điểm còn lại vẫn phải qua đầy đủ bộ kiểm tra; đây chưa phải xác minh sự kiện độc lập.';
// Lọc từng luận điểm bằng cùng hợp đồng nghiêm ngặt; không sửa số, bịa nguồn hoặc tạo thêm luận điểm.
function checkedAnalysis(value,evidence,{analyst=false}={}){
 const validate=analyst?C.validateAnalyst:C.validateAnalysis;
 try{validate(value,evidence);return {result:value,audit:{status:'passed',discardedClaims:0,discardedLimitations:0,summaryReplaced:false,reasons:[]}};}catch(original){
  if(!value||typeof value.summary!=='string'||value.summary.length>5000||!Array.isArray(value.claims)||value.claims.length>24||!Array.isArray(value.limitations)||value.limitations.length>48||value.limitations.some(s=>typeof s!=='string'||s.length>2000))throw original;
  const reasons=new Set(),claims=[];
  for(const claim of value.claims){
   try{C.validateAnalysis({summary:'',claims:[claim],limitations:[]},evidence);if(analyst)C.validateAnalystClaim(claim,evidence);claims.push(claim);}catch(e){reasons.add(e.message);}
  }
  if(!claims.length||(analyst&&!claims.some(c=>c.section==='risk')))throw original;
  let summary=value.summary,summaryReplaced=false;
  try{validate({summary,claims,limitations:[]},evidence);}catch(e){summary=claims[0].text;summaryReplaced=true;reasons.add(e.message);}
  const limitations=[];
  for(const limitation of value.limitations){try{validate({summary,claims,limitations:[limitation]},evidence);limitations.push(limitation);}catch(e){reasons.add(e.message);}}
  const discardedClaims=value.claims.length-claims.length,discardedLimitations=value.limitations.length-limitations.length;
  const result={summary,claims,limitations:[...limitations,FILTER_NOTICE]};
  validate(result,evidence);
  return {result,audit:{status:'filtered',discardedClaims,discardedLimitations,summaryReplaced,reasons:[...reasons]}};
 }
}
module.exports={checkedAnalysis,FILTER_NOTICE};
