'use strict';
const {config,STRATEGY_VERSION,RULE_VERSION}=require('./strategy-config.cjs'),R=require('./risk.cjs'),{hash}=require('./sources.cjs');
const Engine=require('../../public/shared/tracker-engine.js');
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)&&!Number.isNaN(Date.parse(value))?value.slice(0,10):null;
function reportedFact(evidence,metric,asOf,ticker){
 if(!day(asOf))return null;
 for(const e of evidence){
  if(e.type!=='financial_statement'||e.ticker!==ticker||!/^[a-f0-9]{64}$/.test(e.sha256||'')||!day(e.publishedAt)||day(e.publishedAt)>asOf)continue;
  for(const f of e.data?.facts||[]){
   if(f.metric!==metric||f.unit!=='VND/share'||f.basis!=='reported'||!Number.isFinite(f.value)||f.value<=0||!day(f.periodEnd)||day(f.periodEnd)>asOf||!['annual','ttm','quarter_end'].includes(f.periodType))continue;
   if(day(f.periodEnd)>day(e.publishedAt)||Date.parse(asOf)-Date.parse(f.periodEnd)>460*86400000)continue;
   if(metric==='eps_ttm'&&!['ttm','annual'].includes(f.periodType))continue;
   // Facts must point back to a numeric original provider field; summaries cannot certify themselves.
   if(typeof f.path!=='string'||!f.path.startsWith('/tables/'))continue;
   let original=e.data;for(const part of f.path.slice(1).split('/'))original=original?.[part.replace(/~1/g,'/').replace(/~0/g,'~')];
   if(original!==f.value)continue;
   return {value:f.value,evidenceId:e.id,publishedAt:e.publishedAt,periodEnd:f.periodEnd,metric,unit:f.unit,periodType:f.periodType};
  }
 }
 return null;
}
function valuation(c,evidence,{date,ticker}){
 const v=c.valuation;
 if(!v)return {status:'blocked',verified:false,reasons:['Chưa chọn phương pháp và giả định định giá.'],scenarios:[]};
 const metric=v.method==='pe'?'eps_ttm':'bvps',fact=reportedFact(evidence,metric,date,ticker);
 const value=v.metricValue??fact?.value;
 if(!Number.isFinite(value)||![v.bearMultiple,v.baseMultiple,v.bullMultiple].every(Number.isFinite))return {status:'blocked',verified:false,method:v.method,reasons:['Thiếu EPS 12 tháng/BVPS và bội số cho đủ ba kịch bản.'],scenarios:[]};
 const usingReported=v.metricValue===undefined&&!!fact;
 const scenarios=[['bear',v.bearMultiple],['base',v.baseMultiple],['bull',v.bullMultiple]].map(([name,multiple])=>({name,metricValue:value,multiple,fairValue:value*multiple,watchBelow:value*multiple*(1-v.marginOfSafety),probability:null}));
 return {status:usingReported?'sourced_calculation':'assumption_only',verified:usingReported,method:v.method,metric,unit:'VND/share',metricValue:value,metricBasis:usingReported?'reported_source':'user_assumption',fact:usingReported?fact:null,marginOfSafety:v.marginOfSafety,scenarios,
  source:usingReported?{kind:'financial_statement',id:fact.evidenceId}:{kind:'user_assumption',note:v.sourceNote},
  assumptions:['Bội số và biên an toàn là giả định của người dùng, không phải kết quả dự báo đã kiểm định.','Không gán xác suất cho các kịch bản.'],
  reasons:usingReported?[]:['Chỉ là phép tính theo giả định; thiếu dữ liệu tài chính có ngày công bố, kỳ và đơn vị đã đối chiếu. Không dùng làm căn cứ xác nhận cổ phiếu rẻ.']};
}
function evaluate(input,{metric,lastBar,date,snapshotHash,engineVersion,evidence=[],regime={},now=new Date(),riskResult}){
 const c=config(input);if(!c)throw new Error('Thiếu cấu hình chiến lược.');
 const ticker=metric?.ticker||lastBar?.ticker||null,needsValue=c.kind!=='swing',needsTechnical=c.kind!=='value',reasons=[];
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const axes={technical:{status:'unknown',checks:{}},fundamental:{status:needsValue?'unknown':'not_required'},market:{regime:regime.key||'UNKNOWN',status:'context_only'}};
 const m=metric||{},last=lastBar||{},sourceDate=day(date);
 if(!sourceDate||date>today)reasons.push('Ngày snapshot thiếu hoặc nằm trong tương lai.');
 else if(date<today)reasons.push('Snapshot chưa phải dữ liệu hôm nay; chưa xác nhận điều kiện mua hiện tại.');
 if(!ticker)reasons.push('Chưa xác định mã cổ phiếu.');
 const technicalChecks={enoughData:m.dataQuality==='D0',trend:m.trendPass===true,liquidity:m.liquidityPass===true,pivot:Number.isFinite(m.pivot)&&m.pivot>0,
  confirmedBreakout:Number.isFinite(m.close)&&m.close>m.pivot&&last.volume>=m.avgVol50*Engine.DEFAULTS.breakVolMultiple};
 axes.technical={status:technicalChecks.enoughData?(Object.values(technicalChecks).every(Boolean)?'confirmed':'unconfirmed'):'insufficient',checks:technicalChecks};
 if(needsTechnical){
  if(axes.technical.status!=='confirmed')reasons.push('Kỹ thuật chưa đủ đồng thời: dữ liệu D0, xu hướng, thanh khoản, pivot và breakout có volume theo quy tắc hiện hữu.');
  if(['UNKNOWN','DOWNTREND','CAPITULATION','DISTRIBUTION'].includes(regime.key||'UNKNOWN'))reasons.push('Môi trường thị trường chưa xác nhận cho chiến lược breakout.');
 }
 const val=needsValue?valuation(c,evidence,{date:sourceDate,ticker}):{status:'not_required',verified:false,scenarios:[]};
 if(needsValue){
  // Valuation is one axis, never a certificate of business quality or dividend sustainability.
  axes.fundamental={status:val.verified?'valuation_only_quality_unverified':'insufficient',valuationStatus:val.status,businessQuality:'not_verified',dividendSustainability:'not_verified'};
  reasons.push(...val.reasons);
  reasons.push('Chưa xác minh chất lượng doanh nghiệp, chất lượng lợi nhuận và khả năng duy trì cổ tức; không kết luận cơ bản tốt chỉ từ P/E hoặc P/B.');
 }
 // Value investing requires an explicit user-defined invalidation price; never borrow a tight trading stop.
 const entry=c.entry??(needsTechnical?m.pivot:undefined),stop=c.stop??(needsTechnical?m.stop:undefined);
 const target=c.target; // Do not turn a model multiple or historical high into an executable target automatically.
 const riskInput={...c,...(Number.isFinite(entry)?{entry}:{}),...(Number.isFinite(stop)?{stop}:{})};
 const risk=riskResult??R.position(riskInput,{exchange:m.exchange||last.exchange,avgVol20:m.avgVol20,lastVolume:last.volume});
 if(risk.status==='blocked')reasons.push(...risk.reasons);
 if(risk.rr===null)reasons.push('Chưa có mục tiêu được người dùng xác nhận; chưa tính được R:R sau chi phí.');
 else if(risk.rr<c.minRR)reasons.push('R:R sau chi phí thấp hơn ngưỡng giả định đã chọn.');
 const avoid=needsTechnical&&(m.avoidPass===true||m.distributionPass===true);
 const decision=avoid?'avoid':reasons.length?'wait':'conditional_watch';
 if(avoid)reasons.push('Engine hiện hữu đánh dấu Avoid/phân phối; không ưu tiên setup này theo bộ tiêu chí breakout.');
 const scenarios=needsValue&&val.scenarios.length?val.scenarios:[
  {name:'bear',condition:'Mất hiệu lực khi vi phạm stop/luận điểm đã xác định hoặc thanh khoản suy giảm.',probability:null},
  {name:'base',condition:'Tiếp tục quan sát; kiểm tra dữ liệu mới, volume, nguồn tài chính và các điều kiện còn thiếu.',probability:null},
  {name:'bull',condition:'Chỉ xem xét khi các điều kiện chiến lược, rủi ro và nguồn dữ liệu được xác nhận đồng thời.',probability:null}
 ];
 const invalidation=needsValue?['BCTC/công bố mới phủ định giả định lợi nhuận, vốn chủ hoặc dòng tiền.','Khả năng trả cổ tức hoặc chất lượng tài sản suy giảm.','Giá trị theo giả định giảm; đánh giá lại thay vì tự động trung bình giá.']:
 ['Giá vi phạm stop theo quy tắc đã chọn; thực thi có thể chịu ràng buộc T+ và thanh khoản.','Breakout không duy trì, xu hướng/thanh khoản thay đổi hoặc engine đánh dấu Avoid.'];
 const result={version:STRATEGY_VERSION,ruleVersion:RULE_VERSION,ticker,kind:c.kind,decision,reasons:[...new Set(reasons)],axes,valuation:val,scenarios,invalidation,
  entryReference:entry?{price:entry,source:c.entry!==undefined?'user_assumption':'existing_engine_pivot',meaning:'Mốc tham chiếu có điều kiện, không phải giá mua hiện tại được khuyến nghị.'}:null,
  stopReference:stop?{price:stop,source:c.stop!==undefined?'user_assumption':'existing_engine_stop'}:null,
  targetReference:target?{price:target,source:'user_assumption'}:null,risk,
  provenance:{dataDate:date,snapshotHash,engineVersion,strategyVersion:STRATEGY_VERSION},configuration:c,autoTrading:false,executionReady:false};
 result.configurationHash=hash(JSON.stringify({version:STRATEGY_VERSION,snapshotHash,engineVersion,configuration:c}));
 return result;
}
module.exports={evaluate,valuation,reportedFact};
