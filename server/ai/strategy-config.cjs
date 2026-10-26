'use strict';
const STRATEGY_VERSION='strategy-risk-0.2.0';
const RULE_VERSION='vn-stock-simulation-2026-10-26';
const DEFAULTS=Object.freeze({riskPct:0.01,maxWeight:0.20,maxSectorWeight:0.35,fee:0.0015,sellTax:0.001,slippage:0.001,maxParticipation:0.01,minRR:2,stressGapPct:0.10});
const allowed=new Set(['kind','capital','availableCash','riskPct','maxWeight','maxSectorWeight','existingPositionValue','existingSectorValue','fee','sellTax','slippage','maxParticipation','minRR','stressGapPct','entry','stop','target','acknowledge','valuation']);
const validNumber=(value,min,max,name)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('Giá trị '+name+' không hợp lệ.');return value;};
function config(input){
 if(input===undefined||input===null)return null;
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.has(k)))throw new Error('Cấu hình chiến lược không hợp lệ.');
 if(!['swing','value','hybrid'].includes(input.kind))throw new Error('Chọn Swing, Giá trị/Cổ tức hoặc Hybrid.');
 const out={kind:input.kind,...DEFAULTS};
 for(const key of ['capital','availableCash','existingPositionValue','existingSectorValue'])if(input[key]!==undefined&&input[key]!==null)out[key]=validNumber(input[key],key==='capital'?1:0,1e12,key);
 for(const key of ['riskPct','maxWeight','maxSectorWeight','maxParticipation'])if(input[key]!==undefined)out[key]=validNumber(input[key],0.00001,key==='riskPct'?0.1:1,key);
 for(const key of ['fee','sellTax','slippage'])if(input[key]!==undefined)out[key]=validNumber(input[key],0,0.049,key);
 if(input.minRR!==undefined)out.minRR=validNumber(input.minRR,0.1,20,'R:R');
 if(input.stressGapPct!==undefined)out.stressGapPct=validNumber(input.stressGapPct,0,0.5,'gap');
 for(const key of ['entry','stop','target'])if(input[key]!==undefined&&input[key]!==null)out[key]=validNumber(input[key],1,1e9,key);
 if(out.capital!==undefined&&out.availableCash!==undefined&&out.availableCash>out.capital)throw new Error('Tiền khả dụng vượt vốn danh mục; v0.2 không dùng đòn bẩy.');
 for(const key of ['existingPositionValue','existingSectorValue'])if(out.capital!==undefined&&out[key]!==undefined&&out[key]>out.capital)throw new Error('Giá trị đang nắm vượt vốn danh mục.');
 if(out.existingPositionValue!==undefined&&out.existingSectorValue!==undefined&&out.existingPositionValue>out.existingSectorValue)throw new Error('Giá trị mã đang nắm vượt giá trị ngành đã khai báo.');
 if(out.capital!==undefined&&out.availableCash!==undefined&&out.availableCash+Math.max(out.existingSectorValue??0,out.existingPositionValue??0)>out.capital)throw new Error('Tiền khả dụng cộng giá trị đang nắm vượt vốn danh mục.');
 if(input.acknowledge!==undefined&&typeof input.acknowledge!=='boolean')throw new Error('Xác nhận giả định không hợp lệ.');
 out.acknowledge=input.acknowledge===true;
 if(input.valuation!==undefined&&input.valuation!==null){
  const v=input.valuation;if(typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['method','metricValue','bearMultiple','baseMultiple','bullMultiple','marginOfSafety','sourceNote'].includes(k))||!['pe','pb'].includes(v.method))throw new Error('Cấu hình định giá không hợp lệ.');
  out.valuation={method:v.method,marginOfSafety:0.2,sourceNote:String(v.sourceNote||'Giả định do người dùng nhập').slice(0,500)};
  for(const key of ['metricValue','bearMultiple','baseMultiple','bullMultiple'])if(v[key]!==undefined&&v[key]!==null)out.valuation[key]=validNumber(v[key],0.00001,key==='metricValue'?1e8:1000,key);
  if(v.marginOfSafety!==undefined)out.valuation.marginOfSafety=validNumber(v.marginOfSafety,0,0.8,'biên an toàn');
  const a=out.valuation;if([a.bearMultiple,a.baseMultiple,a.bullMultiple].every(Number.isFinite)&&!(a.bearMultiple<=a.baseMultiple&&a.baseMultiple<=a.bullMultiple))throw new Error('Bội số kịch bản phải theo thứ tự bất lợi ≤ cơ sở ≤ thuận lợi.');
 }
 return out;
}
function infer(question){
 if(!/chiến lược|vùng mua|điểm vào|cắt lỗ|stop|tỷ trọng|r:r|rủi ro vị thế|risk.reward/i.test(question))return null;
 return config({kind:/hybrid|kết hợp/i.test(question)?'hybrid':/giá trị|cổ tức|tích sản|dài hạn/i.test(question)?'value':'swing'});
}
module.exports={STRATEGY_VERSION,RULE_VERSION,DEFAULTS,config,infer};
