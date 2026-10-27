'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createApp}=require('./server.cjs'),D=require('./data.cjs');
function configuration(env){
 if(env.TRACKER_AI_ENABLED!=='true'||env.STRICT_FREE_MODE!=='true'||env.ALLOW_PAID_API!=='false'||env.ALLOW_AUTOTRADING!=='false')throw Error('Cần bật AI và khai báo rõ strict free, paid=false, autotrading=false.');
 let origin;try{origin=new URL(env.TRACKER_AI_ALLOWED_ORIGIN);}catch{throw Error('Cần origin HTTPS hợp lệ.');}
 if(origin.protocol!=='https:'||origin.origin!==env.TRACKER_AI_ALLOWED_ORIGIN||origin.username||origin.password||/(^|\.)(example\.(com|org|net)|example|invalid|test)$/.test(origin.hostname))throw Error('Thay origin mẫu bằng origin HTTPS thật, không có path hoặc credentials.');
 if(env.TRACKER_AI_COOKIE_SECURE!=='true')throw Error('Backend HTTPS cần cookie Secure.');
 if(!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(env.TRACKER_AI_PASSWORD_HASH||''))throw Error('Chưa cấu hình hash mật khẩu owner riêng.');
 if(!env.TRACKER_AI_JOBS_DIR||!path.isAbsolute(env.TRACKER_AI_JOBS_DIR))throw Error('Cần đường dẫn tuyệt đối tới bộ lưu AI bền.');
 if(!env.TRACKER_AI_DATA_FILE||!path.isAbsolute(env.TRACKER_AI_DATA_FILE)||!fs.statSync(env.TRACKER_AI_DATA_FILE).isFile())throw Error('Cần file snapshot thật ở đường dẫn tuyệt đối.');
 const port=Number(env.TRACKER_AI_PORT||env.PORT||8790);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Cổng backend phải từ 1024 đến 65535.');
 const host=env.TRACKER_AI_HOST||'127.0.0.1';if(!['127.0.0.1','::1','0.0.0.0'].includes(host))throw Error('Host backend không hợp lệ.');
 return {env:{...env,TRACKER_AI_HOST:host},dir:path.resolve(env.TRACKER_AI_JOBS_DIR),port,host};
}
async function prepare(env=process.env,snapshot=D.snapshot){
 let config=configuration(env),durability=null,instance;
 if(env.TRACKER_AI_STORAGE==='supabase'){
  const {CloudState}=require('./cloud-state.cjs'),State=require('../../tools/ai-state.cjs');
  const base=State.safeDir(config.dir);fs.mkdirSync(base,{recursive:true,mode:0o700});config.dir=fs.mkdtempSync(path.join(base,'run-'));durability=new CloudState(env);
  try{await durability.open(config.dir);}catch(e){await durability.release();throw e;}
 }else if(env.TRACKER_AI_STORAGE&&env.TRACKER_AI_STORAGE!=='local')throw Error('Loại bộ lưu không hợp lệ.');
 try{
 // Uses the existing Quant worker; demo or malformed sources are refused before binding.
 await snapshot(env.TRACKER_AI_DATA_FILE);
 instance=createApp({...config,durability});if(instance.gateway.status().usage.healthy===false||instance.monitoring.status().storageProblem){instance.dispose();throw Error('Bộ lưu chưa sẵn sàng; kiểm tra ledger/monitor và khôi phục trước khi chạy.');}
 await durability?.flush();return {...config,...instance,durability};
 }catch(e){instance?.dispose();await durability?.release();throw e;}
}
async function main(){
 const instance=await prepare(),{app,research,port,host}=instance;
 app.once('error',()=>{instance.dispose();void instance.durability?.release();console.error('Không thể mở cổng backend; kiểm tra cổng và quyền dịch vụ.');process.exitCode=1;});
 app.listen(port,host,()=>console.log('Tracker AI backend listening; TLS is terminated by the configured reverse proxy.'));
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;research.shutdown();const forced=setTimeout(()=>process.exit(1),10000);forced.unref();app.close(async()=>{try{await instance.durability?.flush();await instance.durability?.release();clearTimeout(forced);process.exit(0);}catch{process.exit(1);}});};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(require.main===module)main().catch(()=>{console.error('Backend chưa khởi động: kiểm tra cấu hình HTTPS, owner, snapshot và bộ lưu; không ghi secrets vào log.');process.exitCode=1;});
module.exports={configuration,prepare};
