'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads');
let cached,pending;
async function snapshot(file){
 const st=fs.statSync(file),key=path.resolve(file)+':'+st.size+':'+st.mtimeMs;
 if(cached?.key===key)return cached.value;if(pending?.key===key)return pending.promise;
 const promise=new Promise((resolve,reject)=>{
  const w=new Worker(path.join(__dirname,'quant-worker.cjs'),{workerData:{file}});let received=false;
  const timer=setTimeout(()=>{w.terminate();reject(new Error('Quant worker vượt thời gian.'));},30000);
  w.once('message',m=>{received=true;clearTimeout(timer);w.terminate();if(m.error)reject(new Error(m.error));else {cached={key,value:m};resolve(m);}});
  w.once('error',e=>{clearTimeout(timer);reject(e);});
  w.once('exit',()=>{if(!received){clearTimeout(timer);reject(new Error('Quant worker dừng trước khi trả kết quả.'));}});
 });pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
}
function freshness(date,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return {dataDate:date,checkedAt:now.toISOString(),status:date<today?'dated_snapshot':'same_calendar_day',message:'Dữ liệu snapshot ngày '+date+'; không phải giá trực tiếp. Chưa đối chiếu lịch nghỉ và giờ đóng cửa.'};
}
function remember(file,value){const st=fs.statSync(file);cached={key:path.resolve(file)+':'+st.size+':'+st.mtimeMs,value};}
module.exports={snapshot,freshness,remember};
