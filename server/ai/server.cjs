'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Gateway}=require('./gateway.cjs'),{Research}=require('./research.cjs'),{VERSION}=require('./contracts.cjs');
const {Monitoring}=require('./monitoring.cjs');
const {Operations,acquire}=require('./operations.cjs');
const Analyst=require('./analyst.cjs');
const root=path.resolve(__dirname,'../..'),publicDir=path.join(root,'public');
const safeEqual=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(password,salt,32).toString('hex');}
function verifyPassword(password,hash){const [salt,digest]=String(hash||'').split(':');return /^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{64}$/.test(digest||'')&&safeEqual(passwordHash(password,salt),hash);}
async function body(req){const chunks=[];let size=0;for await(const x of req){size+=x.length;if(size>20000)throw new Error('Yêu cầu quá lớn.');chunks.push(x);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))||'{}');}
function createApp({env=process.env,dir=path.resolve(env.TRACKER_AI_JOBS_DIR||path.join(root,'.ai-jobs')),gateway,tools,durability=null}={}){
 if(env.TRACKER_AI_ENABLED==='true'&&env.TRACKER_AI_HOST&&!['127.0.0.1','localhost','::1'].includes(env.TRACKER_AI_HOST)&&(env.TRACKER_AI_COOKIE_SECURE!=='true'||!/^https:\/\/[^/]+$/.test(env.TRACKER_AI_ALLOWED_ORIGIN||'')))throw new Error('Bind ngoài loopback cần Origin HTTPS chính xác và cookie Secure.');
 const enabled=env.TRACKER_AI_ENABLED==='true',sessions=new Map(),attempts=new Map(),runtimeLock=acquire(dir);
 const operations=new Operations({dir,env});
 let research,monitoring;try{
 gateway=gateway||new Gateway(path.join(dir,'gateway'),env,fetch,{durability,onEvent:(event,data)=>operations.record(event,data)});
 research=new Research({dir:path.join(dir,'jobs'),dataFile:path.resolve(env.TRACKER_AI_DATA_FILE||path.join(publicDir,'data/market.json.gz')),gateway,tools,durability,analystConfig:Analyst.configuration(env)});
 monitoring=new Monitoring({dir:path.join(dir,'monitoring'),dataFile:research.dataFile,snapshot:research.tools.snapshot,autoStart:enabled,durability});
 }catch(e){operations.shutdown();runtimeLock.release();throw e;}
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const cookie=(value,age)=>'tracker_ai_session='+value+'; Path=/api/ai; HttpOnly; SameSite='+((env.TRACKER_AI_COOKIE_SECURE==='true')?'None; Secure':'Strict')+'; Max-Age='+age;
 const app=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  let url;try{url=new URL(req.url,'http://localhost');}catch{return json(res,400,{error:'URL không hợp lệ.'});}
  if(url.pathname==='/healthz'){const healthOrigin=req.headers.origin;if(healthOrigin&&healthOrigin===env.TRACKER_AI_ALLOWED_ORIGIN){res.setHeader('Access-Control-Allow-Origin',healthOrigin);res.setHeader('Vary','Origin');}if(!['GET','HEAD'].includes(req.method))return json(res,405,{status:'unavailable'});const healthy=durability?.status().healthy!==false&&enabled&&!research.stopped&&!research.storageError&&!monitoring.status().storageProblem&&gateway.status().usage?.healthy!==false;return json(res,healthy?200:503,{status:healthy?'ok':'unavailable'});}
  if(url.pathname==='/ai/config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end('window.TRACKER_AI_CONFIG='+JSON.stringify({enabled,apiBase:'',version:VERSION})+';');}
  if(!url.pathname.startsWith('/api/ai/')){
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Phương thức không hợp lệ.'});
   let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'URL không hợp lệ.'});}
   const file=path.resolve(publicDir,'.'+(decoded==='/'?'/index.html':decoded));
   if(!file.startsWith(publicDir+path.sep)||decoded.split('/').some(p=>p.startsWith('.')))return json(res,404,{error:'Không tìm thấy.'});
   try{if(!fs.statSync(file).isFile())throw 0;const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);}catch{json(res,404,{error:'Không tìm thấy.'});}return;
  }
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  if(!enabled)return json(res,503,{error:'AI đã tắt độc lập bằng Feature Flag.'});
  const expected=env.TRACKER_AI_ALLOWED_ORIGIN||'http://'+req.headers.host,origin=req.headers.origin;
  if(origin&&origin!==expected)return json(res,403,{error:'Nguồn yêu cầu không được phép.'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',expected);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, X-Tracker-CSRF','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});return res.end();}
  if(durability)try{await durability.flush();}catch{return json(res,503,{error:'Bộ lưu cloud chưa sẵn sàng. Thử lại sau khi kết nối được khôi phục.'});}
  const durableJson=async(status,fn)=>{const value=fn();await durability?.flush();return json(res,status,value);};
  const route=url.pathname.slice('/api/ai/'.length);
  const logRoute=/^(login|logout|session|jobs|monitors|operations)(\/|$)/.exec(route)?.[1]||'unknown';res.once('finish',()=>operations.record('http',{route:logRoute,status:res.statusCode}));
  try{
   if(route==='login'&&req.method==='POST'){
    // Bound both memory and expensive scrypt attempts, including requests without Origin.
    const ip=req.socket.remoteAddress,now=Date.now();let a=attempts.get(ip);
    if(!a||now-a.at>900000){a={at:now,count:0};if(attempts.size>=100)attempts.clear();attempts.set(ip,a);}
    if(++a.count>5)return json(res,429,{error:'Thử đăng nhập quá nhiều. Chờ 15 phút.'});
    const b=await body(req);if(typeof b.password!=='string'||b.password.length>256||!verifyPassword(b.password,env.TRACKER_AI_PASSWORD_HASH))return json(res,401,{error:'Mật khẩu không hợp lệ hoặc máy chủ chưa cấu hình tài khoản.'});
    for(const [k,s] of sessions)if(s.until<Date.now())sessions.delete(k);
    if(sessions.size>=10)sessions.delete(sessions.keys().next().value);
    const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');sessions.set(id,{until:Date.now()+7200000,csrf,rateAt:Date.now(),rateCount:0});
    res.setHeader('Set-Cookie',cookie(id,7200));return json(res,200,{ok:true,csrf,role:'owner'});
   }
   const id=(req.headers.cookie||'').match(/(?:^|;\s*)tracker_ai_session=([a-f0-9]{64})(?:;|$)/)?.[1],session=sessions.get(id);
   if(!session||session.until<Date.now()){if(id)sessions.delete(id);return json(res,401,{error:'Cần đăng nhập vào backend AI.'});}
   if(Date.now()-session.rateAt>60000){session.rateAt=Date.now();session.rateCount=0;}if(++session.rateCount>120)return json(res,429,{error:'Quá nhiều yêu cầu.'});
   if(!['GET','HEAD'].includes(req.method)&&(!origin||origin!==expected||!safeEqual(req.headers['x-tracker-csrf']||'',session.csrf)))return json(res,403,{error:'Thiếu mã bảo vệ phiên hoặc Origin hợp lệ.'});
   if(route==='session'&&req.method==='GET')return json(res,200,{role:'owner',csrf:session.csrf,...gateway.status(),version:VERSION});
   if(route==='logout'&&req.method==='POST'){sessions.delete(id);res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});}
   if(route==='jobs'&&req.method==='GET')return json(res,200,[...research.jobs.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(({id,status,createdAt,request})=>({id,status,createdAt,question:request?.question||'Bản lưu cần kiểm tra'})));
   if(route==='jobs'&&req.method==='POST'){operations.assertCanStart();const input=await body(req);return await durableJson(202,()=>research.create(input));}
   if(route==='operations'&&req.method==='GET')return json(res,200,{...await operations.report({research,gateway,monitoring,env,snapshot:research.tools.snapshot}),storage:durability?.status()||{kind:'local',healthy:true}});
   if(route==='monitors'&&req.method==='GET')return json(res,200,{...monitoring.status(),records:monitoring.list()});
   if(route==='monitors'&&req.method==='POST'){const b=await body(req);return await durableJson(201,()=>monitoring.create(research.jobs.get(b.jobId)));}
   if(route==='monitors/check'&&req.method==='POST'){await monitoring.checkAll();return json(res,200,{...monitoring.status(),records:monitoring.list()});}
   const monitor=route.match(/^monitors\/([a-f0-9-]{36})$/);
   if(monitor&&req.method==='POST'){const b=await body(req);return await durableJson(200,()=>monitoring.setEnabled(monitor[1],b.enabled));}
   if(monitor&&req.method==='DELETE'){return await durableJson(200,()=>{monitoring.remove(monitor[1]);return {ok:true};});}
   const stream=route.match(/^jobs\/([a-f0-9-]{36})\/events$/),streamJob=stream&&research.jobs.get(stream[1]);
   if(streamJob&&req.method==='GET'){
    if(research.events.listenerCount('job')>=8)return json(res,429,{error:'Đang mở quá nhiều luồng tiến độ.'});
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.flushHeaders();
    let stopped=false,heartbeat;
    const cleanup=()=>{if(stopped)return;stopped=true;clearInterval(heartbeat);research.events.off('job',update);};
    const update=j=>{
     if(j.id!==streamJob.id||stopped)return;
     if(sessions.get(id)!==session||session.until<Date.now()){cleanup();res.end();return;}
     res.write('event: job\ndata: '+JSON.stringify(j)+'\n\n');
     if(!['queued','running'].includes(j.status)){cleanup();res.end();}
    };
    res.on('close',cleanup);res.on('error',cleanup);
    research.events.on('job',update);
    heartbeat=setInterval(()=>{if(sessions.get(id)!==session||session.until<Date.now()){cleanup();res.end();}else res.write(': keepalive\n\n');},15000);
    update(streamJob);return;
   }
   const m=route.match(/^jobs\/([a-f0-9-]{36})$/),job=m&&research.jobs.get(m[1]);
   if(job&&req.method==='GET')return json(res,200,job);
   if(job&&req.method==='DELETE')return await durableJson(200,()=>research.cancel(job.id));
   return json(res,404,{error:'Không tìm thấy tác vụ.'});
  }catch(e){json(res,400,{error:e.message});}
 });
 app.requestTimeout=30000;app.headersTimeout=10000;app.keepAliveTimeout=5000;app.maxHeadersCount=64;
 const dispose=()=>{research.shutdown();monitoring.shutdown();operations.shutdown();runtimeLock.release();};
 app.on('close',dispose);
 return {app,research,gateway,monitoring,operations,dispose};
}
if(require.main===module){
 const {app,research}=createApp();const port=Number(process.env.TRACKER_AI_PORT||8790),host=process.env.TRACKER_AI_HOST||'127.0.0.1';
 app.listen(port,host,()=>console.log('Tracker AI preview: http://'+host+':'+port));
 const end=()=>{research.shutdown();app.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();};process.on('SIGINT',end);process.on('SIGTERM',end);
}
module.exports={createApp,passwordHash,verifyPassword};
