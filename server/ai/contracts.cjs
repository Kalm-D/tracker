'use strict';
const VERSION='tracker-ai-1.0.0-rc.1';
const SC=require('./strategy-config.cjs'),BT=require('./backtest.cjs');
const AGENTS=['manager','data','technical','fundamental','news','strategy','risk','backtest','monitoring','critic'];
const OUTPUT_SCHEMA={type:'object',additionalProperties:false,required:['summary','claims','limitations'],properties:{summary:{type:'string'},claims:{type:'array',items:{type:'object',additionalProperties:false,required:['text','kind','evidenceIds'],properties:{text:{type:'string'},kind:{type:'string',enum:['source','interpretation']},evidenceIds:{type:'array',items:{type:'string'}}}}},limitations:{type:'array',items:{type:'string'}}}};
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
 const found=r.question.match(/\b[A-Z][A-Z0-9]{2}\b/g)||[];
 const explicit=found.filter(t=>known.has(t));const requested=explicit.length&&!/so sánh|compare/i.test(r.question)?explicit:[...r.tickers,...explicit];const tickers=[...new Set(requested)].slice(0,5);
 const strategy=r.strategy||null,backtest=r.backtest||null;
 const fundamental=!backtest&&((strategy&&strategy.kind!=='swing')||/cơ bản|định giá|bctc|tài chính|cổ tức|tích sản|doanh nghiệp|ngân hàng|so sánh|p\/e|p\/b|roe|eps/i.test(r.question));
 const news=!backtest&&/tin tức|sự kiện|chính sách|vĩ mô|công bố|lãi suất|tỷ giá/i.test(r.question);
 return {schemaVersion:backtest?3:strategy?2:1,tickers,fundamental,news,strategy,backtest,roles:['manager','data','technical',...(fundamental?['fundamental']:[]),...(news?['news']:[]),...(strategy?['strategy','risk']:[]),...(backtest?['backtest']:[]),'critic'],unsupported:(!backtest&&/backtest/i.test(r.question))||/đặt lệnh|theo dõi hàng ngày|cảnh báo tự động/i.test(r.question)};
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
module.exports={VERSION,AGENTS,OUTPUT_SCHEMA,request,plan,validateAnalysis};
