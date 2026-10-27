'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_BYTES=32*1048576;
const validKey=k=>/^(jobs\/[a-f0-9-]{36}\.json|gateway\/(usage|restore-hold)\.json|monitoring\/monitors\.json)$/.test(k);
function validateFiles(files){
 if(!files||typeof files!=='object'||Array.isArray(files)||Object.keys(files).length>103||Buffer.byteLength(JSON.stringify(files))>MAX_BYTES)throw Error('Bản lưu cloud sai định dạng hoặc vượt 32 MiB.');
 for(const [key,value]of Object.entries(files))if(!validKey(key)||!value||typeof value!=='object'||Array.isArray(value)||Buffer.byteLength(JSON.stringify(value))>8*1048576)throw Error('Tệp cloud không hợp lệ.');
 return files;
}
class CloudState{
 constructor(env,{fetcher=fetch,clock=Date.now}={}){
  const u=new URL(env.SUPABASE_URL||'');if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Cần SUPABASE_URL HTTPS của dự án Supabase.');
  if(typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||env.SUPABASE_SERVICE_ROLE_KEY.length<20)throw Error('Thiếu secret Supabase phía server.');
  this.url=u.origin+'/rest/v1/rpc/tracker_ai_state';this.key=env.SUPABASE_SERVICE_ROLE_KEY;this.fetcher=fetcher;this.clock=clock;this.owner=crypto.randomUUID();this.tail=Promise.resolve();this.problem=null;this.acquired=false;this.closed=false;this.deadline=0;this.writes=0;
 }
 async rpc(action,changes={}){
  try{
   const r=await this.fetcher(this.url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',apikey:this.key,Authorization:'Bearer '+this.key},body:JSON.stringify({p_owner:this.owner,p_action:action,p_changes:changes}),signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error('storage');let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>MAX_BYTES+1048576)throw Error('size');chunks.push(chunk);}const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!result||result.ok!==true)throw Error('contract');return result;
  }catch{this.problem='Không xác nhận được bộ lưu cloud; dừng nhận tác vụ và gọi model. Kiểm tra Supabase/kết nối trước khi khởi động lại.';throw Error(this.problem);}
 }
 touch(){this.deadline=this.clock()+60000;}
 assertHealthy(){if(this.problem||!this.acquired||this.closed||this.clock()>=this.deadline)throw Error(this.problem||'Phiên ghi cloud hết hạn; cần kết nối lại trước khi chạy.');}
 async open(dir){
  const result=await this.rpc('acquire');this.acquired=true;this.touch();
  try{const files=validateFiles(result.files);for(const [key,value]of Object.entries(files)){const target=path.join(dir,...key.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,JSON.stringify(value),{flag:'wx',mode:0o600});}}
  catch{this.problem='Bản lưu Supabase không hợp lệ; giữ nguyên database và chặn khởi động.';await this.release();throw Error(this.problem);}
  this.timer=setInterval(()=>{try{this.enqueue(async()=>{await this.rpc('renew');this.touch();});}catch{this.problem=this.problem||'Phiên ghi cloud hết hạn.';}},30000).unref();return this;
 }
 enqueue(fn){this.assertHealthy();this.tail=this.tail.then(()=>{this.assertHealthy();return fn();}).catch(()=>{this.problem=this.problem||'Lưu cloud thất bại; cần khởi động lại sau khi kiểm tra database.';});return this.tail;}
 put(key,value){if(!validKey(key))throw Error('Khóa lưu trữ không hợp lệ.');const copy=JSON.parse(JSON.stringify(value));validateFiles({[key]:copy});this.enqueue(async()=>{await this.rpc('write',{[key]:copy});this.touch();this.writes++;});}
 async flush(){await this.tail;this.assertHealthy();}
 status(){let healthy=true;try{this.assertHealthy();}catch{healthy=false;}return {kind:'supabase',healthy,problem:this.problem||(!healthy?'Phiên ghi cloud chưa sẵn sàng.':null),writes:this.writes};}
 async release(){clearInterval(this.timer);if(this.acquired){await this.tail;try{await this.rpc('release');}catch{}this.acquired=false;}this.closed=true;}
}
module.exports={CloudState,validKey,validateFiles};
