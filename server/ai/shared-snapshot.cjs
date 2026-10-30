'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const D=require('./data.cjs'),{bounded}=require('./sources.cjs');
const SOURCE='https://raw.githubusercontent.com/Kalm-D/tracker/main/public/data/market.json.gz';
// Chỉ tải snapshot công khai cố định, kiểm tra bằng engine trước khi thay tệp đang dùng.
function sharedSnapshot(file,{fetcher=fetch,parse=D.snapshot,clock=Date.now,intervalMs=30*60000}={}){
 let checkedAt=null,pending=null,etag='',current=null,warning=null;
 async function refresh(){
  current=await parse(file);if(checkedAt!==null&&clock()-checkedAt<intervalMs)return current;
  const temp=path.join(path.dirname(file),'.market-download-'+crypto.randomUUID()+'.gz');
  try{
   const abort=AbortSignal.timeout(20000),r=await fetcher(SOURCE,{redirect:'error',signal:abort,headers:{Accept:'application/gzip',...(etag?{'If-None-Match':etag}:{})}});
   if(r.status===304){warning=null;return current;}
   if(!r.ok)throw Error('unavailable');
   const bytes=await bounded(r,16*1048576,abort);fs.writeFileSync(temp,bytes,{flag:'wx'});
   const candidate=await parse(temp);
   if(!candidate?.date||candidate.date<current.date)throw Error('older_snapshot');
   if(candidate.sha256!==current.sha256){fs.renameSync(temp,file);current=candidate;}
   D.remember(file,current);
   const tag=r.headers.get('etag');if(tag&&tag.length<200)etag=tag;
   warning=null;return current;
  }catch{warning='Chưa đồng bộ được snapshot mới từ web chính thức; đang dùng dữ liệu ngày '+current.date+'.';return current;}
  finally{checkedAt=clock();try{fs.unlinkSync(temp);}catch{}}
 }
 async function read(){if(!pending)pending=refresh().finally(()=>{pending=null;});const value=await pending;return {...value,refresh:{checkedAt:new Date(checkedAt??clock()).toISOString(),warning,source:SOURCE}};}
 return {read};
}
module.exports={sharedSnapshot,SOURCE};
