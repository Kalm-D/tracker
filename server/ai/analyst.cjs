'use strict';
const {hash}=require('./sources.cjs');
const KEYS=['technical','fundamental','news','sector'];
const SECTORS={
 'Kim loại':['giá thép','quặng sắt','than cốc','đầu tư công'],
 'Ngân hàng':['lãi suất','tín dụng','nợ xấu','tỷ giá'],
 'Công nghệ thông tin':['xuất khẩu phần mềm','chuyển đổi số','tỷ giá'],
 'Bất động sản':['lãi suất','pháp lý dự án','tín dụng'],
 'Vận tải':['cước vận tải','xuất nhập khẩu','giá dầu'],
 'Dầu khí':['giá dầu','khí tự nhiên','tỷ giá']
};
function configuration(env={}){
 let input={};
 try{input=JSON.parse(env.TRACKER_AI_ANALYST_CONFIG||'{}');}catch{throw Error('Cấu hình AI Analyst phải là JSON hợp lệ.');}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['weights','grades','sectorFactors','toolTimeoutMs','cacheMs'].includes(k)))throw Error('Cấu hình AI Analyst có trường không hợp lệ.');
 const c={weights:{technical:.4,fundamental:.4,news:.1,sector:.1,...input.weights},grades:{A:80,B:60,...input.grades},sectorFactors:{...SECTORS,...input.sectorFactors},toolTimeoutMs:input.toolTimeoutMs??90000,cacheMs:input.cacheMs??3600000};
 if(Object.keys(c.weights).some(k=>!KEYS.includes(k))||KEYS.some(k=>!Number.isFinite(c.weights[k])||c.weights[k]<0)||Math.abs(Object.values(c.weights).reduce((a,b)=>a+b,0)-1)>1e-8)throw Error('Trọng số tổng hợp phải không âm và có tổng bằng một.');
 if(Object.keys(c.grades).some(k=>!['A','B'].includes(k))||![c.grades.A,c.grades.B].every(n=>Number.isFinite(n)&&n>=0&&n<=100)||c.grades.A<=c.grades.B)throw Error('Ngưỡng hạng tổng hợp không hợp lệ.');
 if(!Number.isInteger(c.toolTimeoutMs)||c.toolTimeoutMs<100||c.toolTimeoutMs>90000||!Number.isInteger(c.cacheMs)||c.cacheMs<0||c.cacheMs>21600000)throw Error('Thời gian chờ/cache AI Analyst không hợp lệ.');
 for(const [sector,factors]of Object.entries(c.sectorFactors))if(sector.length>100||!Array.isArray(factors)||factors.length>8||factors.some(s=>typeof s!=='string'||s.length>100))throw Error('Bảng yếu tố vĩ mô ngành không hợp lệ.');
 return c;
}
function sectorContext(metrics,c){
 return [...new Set(metrics.map(m=>m.sector).filter(Boolean))].map(sector=>({sector,factors:c.sectorFactors[sector]||[],mappingStatus:c.sectorFactors[sector]?'configured':'missing'}));
}
// Chỉ nhận điểm thành phần do bộ thu thập có cấu trúc tính và lưu nguồn.
function composite(metric,components={},c=configuration()){
 const values={technical:Number.isFinite(metric.trackerScore)?metric.trackerScore:null,fundamental:null,news:null,sector:null};
 const sources={technical:'existing_tracker_engine'};
 for(const k of KEYS.slice(1)){
  const v=components[k];
  if(v&&Number.isFinite(v.score)&&v.score>=0&&v.score<=100&&v.basis==='deterministic_calculation'&&typeof v.evidenceId==='string'){
   values[k]=v.score;sources[k]=v.evidenceId;
  }
 }
 const missing=KEYS.filter(k=>c.weights[k]>0&&values[k]===null);
 const total=missing.length?null:Math.round(KEYS.reduce((n,k)=>n+(values[k]??0)*c.weights[k],0)*100)/100;
 const grade=total===null?null:total>=c.grades.A?'A':total>=c.grades.B?'B':'C';
 return {ticker:metric.ticker,components:values,sources,weights:c.weights,thresholds:c.grades,total,grade,missing,status:missing.length?'insufficient_data':'calculated',technicalGrade:metric.trackerGrade??null,
  limitation:'Điểm kỹ thuật giữ nguyên Tracker Engine. Thiếu thành phần có trọng số thì chưa tính tổng/hạng; không đổi dữ liệu thiếu thành điểm không.'};
}
function context(snap,metrics,c=configuration()){
 const market={...snap.regime,dataDate:snap.date,setupPerformance:null,setupPerformanceStatus:'not_available',
  limitation:'Playbook là quy tắc của Tracker, chưa phải bằng chứng tỷ lệ thắng. Chưa có thống kê từng setup trong cùng môi trường; không suy ra xác suất thành công.'};
 const scores=metrics.map(m=>composite(m,{},c));
 const data={market,sectors:sectorContext(metrics,c),scores};
 return {id:'analyst-context-'+hash(JSON.stringify(data)).slice(0,16),type:'analyst_context',dataDate:snap.date,data,verification:'deterministic_existing_engine_context',url:'https://github.com/Kalm-D/tracker/blob/main/public/shared/tracker-engine.js'};
}
function coverage(evidence,tickers){
 const technical=evidence.find(e=>e.type==='deterministic_calculation');
 const out=tickers.map(ticker=>({ticker,price:!!technical?.lastBars?.[ticker],technical:!!technical?.metrics?.some(m=>m.ticker===ticker),
  fundamental:evidence.some(e=>e.type==='financial_statement'&&e.ticker===ticker),
  companyNews:evidence.some(e=>e.type==='news_discovery'&&e.scope!=='sector'&&e.items?.length&&(!e.tickers||e.tickers.includes(ticker))),
  sectorNews:evidence.some(e=>e.type==='news_discovery'&&e.scope==='sector'&&e.items?.length&&e.tickers?.includes(ticker)),market:!!technical?.regime?.key&&technical.regime.key!=='UNKNOWN'}));
 return {tickers:out,missing:out.flatMap(x=>Object.entries(x).filter(([k,v])=>k!=='ticker'&&!v).map(([k])=>x.ticker+': '+k)),
  confidence:'coverage_only_not_probability',limitation:'Có nguồn không có nghĩa đã xác minh nội dung, đơn vị hay kỳ báo cáo. RSS chỉ là tiêu đề phát hiện tin.'};
}
// Chặn các trường riêng tư phổ biến trước khi gửi câu hỏi tới AI miễn phí.
function publicQuestion(question){
 const privateText=/(?:giá\s*vốn|danh\s*mục\s*(?:của\s*)?(?:tôi|mình|thật)|tôi\s*(?:đang\s*)?(?:nắm\s*giữ|sở\s*hữu|có)\s*\d|(?:mật\s*khẩu|password|api[_ -]?key|token)\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:vốn|nav|số\s*dư)\s*(?:của\s*tôi)?\s*[:=]?\s*\d|(?:portfolio|cost\s*basis|holdings)\s*[:=]|(?:i\s+(?:own|hold))\s+\d)/i;
 if(privateText.test(question))throw Error('Câu hỏi có thể chứa danh mục, giá vốn hoặc thông tin riêng tư. Hãy hỏi lại chỉ với mã và dữ liệu công khai; phần rủi ro cá nhân tính cục bộ bằng code.');
 return question;
}
module.exports={configuration,sectorContext,composite,context,coverage,publicQuestion};

