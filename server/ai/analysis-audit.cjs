'use strict';
const C=require('./contracts.cjs');
const FILTER_NOTICE='Báo cáo chỉ giữ các luận điểm khớp số liệu và nguồn dẫn. Phần thiếu hoặc chưa đạt kiểm tra được nêu rõ; đây chưa phải xác minh sự kiện độc lập.';
// Giữ phần khớp nguồn; rủi ro dự phòng chỉ sao nguyên văn ngữ cảnh đã tính bằng engine và được gắn nhãn riêng.
function checkedAnalysis(value,evidence,{analyst=false}={}){
 const validate=analyst?C.validateAnalyst:C.validateAnalysis;
 try{validate(value,evidence);return {result:value,audit:{status:'passed',discardedClaims:0,discardedLimitations:0,summaryReplaced:false,reasons:[]}};}catch(original){
  if(!value||typeof value.summary!=='string'||value.summary.length>5000||!Array.isArray(value.claims)||value.claims.length>24||!Array.isArray(value.limitations)||value.limitations.length>48||value.limitations.some(s=>typeof s!=='string'||s.length>2000))throw original;
  const reasons=new Set(),claims=[];
  for(const claim of value.claims){
   try{C.validateAnalysis({summary:'',claims:[claim],limitations:[]},evidence);if(analyst)C.validateAnalystClaim(claim,evidence);claims.push(claim);}catch(e){reasons.add(e.message);}
  }
  if(!claims.length)throw original;
  let retainedOriginal=claims.length,riskFromCode=false;
  if(analyst&&!claims.some(c=>c.section==='risk')){
   const context=evidence.find(e=>e.type==='analyst_context'&&e.verification==='deterministic_existing_engine_context'&&typeof e.data?.market?.desc==='string'&&e.data.market.desc.trim()&&typeof e.data.market.limitation==='string');
   if(!context)throw original;
   const text=context.data.market.desc+' '+context.data.market.limitation;
   if(text.length>3000)throw original;
   const risk={section:'risk',kind:'source',text,evidenceIds:[context.id]};
   C.validateAnalysis({summary:'',claims:[risk],limitations:[]},evidence);C.validateAnalystClaim(risk,evidence);
   if(claims.length===24){claims.pop();retainedOriginal--;}
   claims.push(risk);riskFromCode=true;reasons.add('Rủi ro AI chưa có hoặc chưa khớp nguồn; dùng nguyên văn ngữ cảnh thị trường do Tracker Engine cung cấp.');
  }
  let summary=value.summary,summaryReplaced=false;
  try{validate({summary,claims,limitations:[]},evidence);}catch(e){summary=claims[0].text;summaryReplaced=true;reasons.add(e.message);}
  const limitations=[];
  for(const limitation of value.limitations){try{validate({summary,claims,limitations:[limitation]},evidence);limitations.push(limitation);}catch(e){reasons.add(e.message);}}
  const discardedClaims=value.claims.length-retainedOriginal,discardedLimitations=value.limitations.length-limitations.length;
  const result={summary,claims,limitations:[...limitations,FILTER_NOTICE]};
  validate(result,evidence);
  return {result,audit:{status:'filtered',discardedClaims,discardedLimitations,summaryReplaced,riskFromCode,reasons:[...reasons]}};
 }
}
module.exports={checkedAnalysis,FILTER_NOTICE};
