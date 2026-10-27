'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const B=require('../../public/backtest/engine.js');
const VERSION='backtest-agent-0.3.0',MAX_SESSIONS=60;
function config(input){
 if(input===undefined||input===null)return null;
 if(typeof input!=='object'||Array.isArray(input))throw new Error('Cấu hình Backtest không hợp lệ.');
 const allowed=['start','end','outOfSampleStart','capital','method','fee','tax','slippage','maxPositions','maxWeight','riskBudget','allocation','entry','exit','rewardR','targetPct','trailingPct','participation','cooldown','priority','liquidate','acknowledge'];
 for(const k of Object.keys(input))if(!allowed.includes(k))throw new Error('Trường Backtest không hỗ trợ: '+k);
 for(const k of ['start','end'])if(typeof input[k]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input[k])||new Date(input[k]).toISOString().slice(0,10)!==input[k])throw new Error('Cần ngày '+k+' hợp lệ.');
 if(input.end<input.start)throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
 if(input.outOfSampleStart!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.outOfSampleStart)||new Date(input.outOfSampleStart).toISOString().slice(0,10)!==input.outOfSampleStart||input.outOfSampleStart<=input.start||input.outOfSampleStart>input.end))throw new Error('Mốc ngoài mẫu phải nằm trong kỳ và sau ngày bắt đầu.');
 if(!Number.isFinite(input.capital)||input.capital<=0||input.capital>1e12)throw new Error('Cần vốn mô phỏng >0 và không vượt 1.000 tỷ đồng.');
 if(input.acknowledge!==true)throw new Error('Cần xác nhận giới hạn mô phỏng Backtest.');
 if(input.liquidate!==undefined&&typeof input.liquidate!=='boolean')throw new Error('liquidate phải là boolean.');
 const c=B.config(input);if(c.maxPositions>20||c.cooldown>252||c.rewardR>20)throw new Error('Backtest giới hạn 20 vị thế, cooldown 252 phiên và R:R 20.');
 return Object.fromEntries(allowed.filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
}
function compact(raw,sha){
 return {agentVersion:VERSION,snapshotHash:sha,configurationHash:crypto.createHash('sha256').update(JSON.stringify({config:raw.config,settings:raw.settings,engine:raw.version,calculation:raw.calculationVersion})).digest('hex'),engineVersion:raw.version,calculationVersion:raw.calculationVersion,ruleVersion:raw.ruleVersion,config:raw.config,settings:raw.settings,audit:raw.audit,source:raw.source,start:raw.start,end:raw.end,baselineDate:raw.baselineDate,
  universe:'full_snapshot_before_ticker_filter',optimization:false,simulationOnly:true,limitations:[...raw.limitations,'Không kiểm định chiến lược Value/Dividend/Hybrid v0.2: đây là hai bộ lọc kỹ thuật market/personal của engine hiện có.','Mốc ngoài mẫu là phân đoạn do người dùng chọn; không chứng minh chưa từng dùng dữ liệu đó để chọn cấu hình.','Không tối ưu tham số, không coi số ít giao dịch hoặc kỳ ngắn là bằng chứng hiệu quả tương lai.'],
  results:raw.results.map(r=>({method:r.method,summary:r.summary,curve:r.curve,periods:r.periods||null,byTicker:r.byTicker,regimes:r.regimes,signalRegimes:r.signalRegimes,trades:r.trades,signalsTotal:r.signals.length,signalStatusCounts:r.signals.reduce((a,s)=>(a[s.status]=(a[s.status]||0)+1,a),{})})),
  benchmarks:raw.benchmarks};
}
function run(file,input,{tickers=[],signal,expectedHash,timeoutMs=120000,onProgress=()=>{}}={}){
 const c=config(input);if(!c)return Promise.reject(new Error('Thiếu cấu hình Backtest.'));
 if(tickers.length>5||!tickers.length||tickers.some(t=>!/^[A-Z0-9]{3}$/.test(t)))return Promise.reject(new Error('Chọn 1–5 mã cho Backtest.'));
 if(signal?.aborted)return Promise.reject(signal.reason||new Error('Đã hủy.'));
 return new Promise((resolve,reject)=>{
  const w=new Worker(path.join(__dirname,'backtest-worker.cjs'),{workerData:{file,config:{...c,tickers},expectedHash},resourceLimits:{maxOldGenerationSizeMb:512}});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);w.terminate();error?reject(error):resolve(value);};
  const abort=()=>finish(signal.reason||new Error('Đã hủy Backtest.'));
  const timer=setTimeout(()=>finish(new Error('Backtest vượt thời gian 120 giây; hãy rút ngắn khoảng ngày.')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  w.on('message',m=>{if(m.progress){if(!settled)try{onProgress(m.progress);}catch(e){finish(e);}return;}finish(m.error?new Error(m.error):null,m.result);});
  w.once('error',e=>finish(e));w.once('exit',()=>{if(!settled)finish(new Error('Backtest worker dừng trước khi hoàn tất.'));});
 });
}
module.exports={VERSION,MAX_SESSIONS,config,compact,run};
