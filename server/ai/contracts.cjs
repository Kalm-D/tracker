'use strict';
const VERSION='tracker-ai-1.2.1-audit';
const SC=require('./strategy-config.cjs'),BT=require('./backtest.cjs');
const AGENTS=['manager','data','technical','fundamental','news','strategy','risk','backtest','monitoring','critic'];
const OUTPUT_SCHEMA={type:'object',additionalProperties:false,required:['summary','claims','limitations'],properties:{summary:{type:'string'},claims:{type:'array',items:{type:'object',additionalProperties:false,required:['text','kind','evidenceIds'],properties:{text:{type:'string'},kind:{type:'string',enum:['source','interpretation']},evidenceIds:{type:'array',items:{type:'string'}}}}},limitations:{type:'array',items:{type:'string'}}}};
const ANALYST_SECTIONS=['technical','market','fundamental','news','risk'];
const ANALYST_SCHEMA=structuredClone(OUTPUT_SCHEMA);
ANALYST_SCHEMA.properties.claims.items.required.push('section');
ANALYST_SCHEMA.properties.claims.items.properties.section={type:'string',enum:ANALYST_SECTIONS};
function validateGradeText(text,evidence){
 const grades=new Set(evidence.filter(e=>e.type==='analyst_context').flatMap(e=>e.data.scores.map(s=>s.grade)).filter(Boolean));
 for(const m of text.matchAll(/hạng\s*[:=]?\s*([ABC])(?:\b|\+)/gi))if(!grades.has(m[1].toUpperCase()))throw Error('AI tự gán hạng chưa có trong kết quả công cụ.');
}
function validateAnalystClaim(claim,evidence){
 if(!ANALYST_SECTIONS.includes(claim.section))throw Error('Luận điểm Analyst sai phần nội dung.');
 if(claim.section==='fundamental'&&numbers(claim.text).length&&!claim.evidenceIds.some(id=>evidence.some(e=>e.id===id&&e.type==='financial_statement')))throw Error('Số liệu tài chính phải dẫn nguồn có cấu trúc, không lấy từ trang web.');
 validateGradeText(claim.text,evidence);
}
function validateAnalyst(value,evidence){
 validateAnalysis(value,evidence);
 if(!value.claims.length||!value.claims.some(c=>c.section==='risk'))throw Error('Báo cáo Analyst thiếu mục rủi ro/kịch bản xấu hoặc sai phần nội dung.');
 for(const claim of value.claims)validateAnalystClaim(claim,evidence);
 validateGradeText(value.summary,evidence);
 const allowed=new Set(evidence.flatMap(e=>numbers(JSON.stringify(e))));
 if(value.limitations.some(s=>numbers(s).some(n=>!allowed.has(n))))throw Error('Giới hạn dữ liệu chứa số liệu không có nguồn.');
 return value;
}
function request(input){
 if(!input||typeof input.question!=='string'||input.question.trim().length<3||input.question.length>4000)throw new Error('Câu hỏi cần từ 3 đến 4.000 ký tự.');
 const mode=input.mode||'Quick';if(!['Quick','Standard','Deep'].includes(mode))throw new Error('Chế độ không hợp lệ.');
 if(input.tickers!==undefined&&!Array.isArray(input.tickers))throw new Error('Danh sách mã không hợp lệ.');
 const tickers=[...new Set((input.tickers||[]).map(t=>String(t).toUpperCase()))];
 if(tickers.length>5||tickers.some(t=>!/^[A-Z0-9]{3}$/.test(t)))throw new Error('Tối đa 5 mã cổ phiếu hợp lệ.');
 const sourceUrls=input.sourceUrls||[];
 if(!Array.isArray(sourceUrls)||sourceUrls.length>4||sourceUrls.some(u=>typeof u!=='string'||u.length>2048))throw new Error('Tối đa 4 đường dẫn nguồn.');
 const backtest=BT.config(input.backtest);
 const strategy=SC.config(input.strategy)??(backtest?null:SC.infer(input.question));
 if(backtest&&strategy)throw new Error('Chạy Backtest kỹ thuật riêng với Strategy v0.2 để tránh nhầm phương pháp.');
 return {schemaVersion:backtest?3:strategy?2:1,question:input.question.trim(),mode,tickers,sourceUrls,...(strategy?{strategy}:{}),...(backtest?{backtest}:{})};
}
function plan(r,known){
 const named=[...r.question.matchAll(/(?:phân tích|đánh giá|nhận định|analyse|analyze)\s+([a-z][a-z0-9]{2})\b/gi)].map(m=>m[1].toUpperCase());
 const found=[...(r.question.match(/\b[A-Z][A-Z0-9]{2}\b/g)||[]),...named];
 const explicit=found.filter(t=>known.has(t));const requested=explicit.length&&!/so sánh|compare/i.test(r.question)?explicit:[...r.tickers,...explicit];const tickers=[...new Set(requested)].slice(0,5);
 const strategy=r.strategy||null,backtest=r.backtest||null;
 const fullAnalysis=!backtest&&!strategy&&(/(?:phân tích|đánh giá|nhận định|analyse|analyze|analysis)/i.test(r.question))&&!/kỹ thuật|technical|cơ bản|fundamental|tin tức/i.test(r.question);
 const fundamental=!backtest&&(fullAnalysis||((strategy&&strategy.kind!=='swing')||/cơ bản|định giá|bctc|tài chính|cổ tức|tích sản|doanh nghiệp|ngân hàng|so sánh|p\/e|p\/b|roe|eps/i.test(r.question)));
 const news=!backtest&&(fullAnalysis||/tin tức|sự kiện|chính sách|vĩ mô|công bố|lãi suất|tỷ giá/i.test(r.question));
 return {schemaVersion:backtest?3:strategy?2:1,tickers,fundamental,news,fullAnalysis,strategy,backtest,roles:['manager','data','technical',...(fundamental?['fundamental']:[]),...(news?['news']:[]),...(strategy?['strategy','risk']:[]),...(backtest?['backtest']:[]),'critic'],unsupported:(!backtest&&/backtest/i.test(r.question))||/đặt lệnh|theo dõi hàng ngày|cảnh báo tự động/i.test(r.question)};
}
const numbers=s=>(String(s).match(/-?\d+(?:[.,]\d+)*/g)||[]).map(x=>x.replace(/[.,]/g,''));
function validateAnalysis(value,evidence){
 if(!value||typeof value.summary!=='string'||value.summary.length>5000||!Array.isArray(value.claims)||value.claims.length>24||!Array.isArray(value.limitations)||value.limitations.some(s=>typeof s!=='string'||s.length>2000))throw new Error('Đầu ra AI sai hợp đồng.');
 const byId=new Map(evidence.map(e=>[e.id,e]));
 for(const c of value.claims){
  if(!c||typeof c.text!=='string'||c.text.length>3000||!['source','interpretation'].includes(c.kind)||!Array.isArray(c.evidenceIds)||!c.evidenceIds.length||c.evidenceIds.some(id=>!byId.has(id)))throw new Error('AI dẫn nguồn không tồn tại hoặc thiếu nguồn.');
  const allowed=new Set(c.evidenceIds.flatMap(id=>numbers(JSON.stringify(byId.get(id)))));
  if(numbers(c.text).some(n=>!allowed.has(n)))throw new Error('AI đưa số liệu chưa có trong nguồn được dẫn.');
 }
 const allowed=new Set(evidence.flatMap(e=>numbers(JSON.stringify(e))));
 if(numbers(value.summary).some(n=>!allowed.has(n)))throw new Error('Tóm tắt AI có số liệu chưa có trong nguồn.');
 return value;
}
module.exports={VERSION,AGENTS,OUTPUT_SCHEMA,ANALYST_SCHEMA,ANALYST_SECTIONS,request,plan,validateAnalysis,validateAnalyst,validateAnalystClaim};
