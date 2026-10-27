(function(root){
'use strict';
function sleep(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const done=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(done,ms),abort=()=>{clearTimeout(timer);reject(signal.reason);};signal?.addEventListener('abort',abort,{once:true});});}
async function waitForBackend(url,{fetcher=fetch,signal,now=Date.now,delay=sleep,onStatus=()=>{},timeoutMs=120000,attemptMs=12000}={}){
 const started=now();while(now()-started<timeoutMs){
  signal?.throwIfAborted();onStatus(Math.floor((now()-started)/1000));
  try{
   const r=await fetcher(url,{method:'GET',credentials:'omit',cache:'no-store',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(Math.min(attemptMs,timeoutMs-(now()-started)))])});
   if(r.status===404)throw Object.assign(Error('Backend chưa có endpoint kiểm tra. Cần kiểm tra địa chỉ máy chủ.'),{terminal:true});
   if(r.ok&&r.headers.get('content-type')?.includes('application/json')&&(await r.json()).status==='ok')return;
  }catch(e){if(signal?.aborted)throw signal.reason;if(e.terminal)throw e;}
  const remaining=timeoutMs-(now()-started);if(remaining>0)await delay(Math.min(2000,remaining),signal);
 }
 throw Error('Chưa kết nối được AI sau 2 phút. Có thể máy chủ/bộ lưu đang tạm dừng; bạn có thể thử mở lại. Website Tracker vẫn dùng được.');
}
if(typeof module==='object'&&module.exports)module.exports={waitForBackend,sleep};else root.TrackerAIWake={waitForBackend};
})(typeof window==='undefined'?globalThis:window);
