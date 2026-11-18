'use strict';
// Snapshot DNSE riêng: chỉ backend giữ secret; không có URL public hoặc fallback KBS.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const P=require('../../tools/publish-snapshot.cjs'),Q=require('../../public/shared/data-quality.js'),D=require('./data.cjs');
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const bytesHash=b=>crypto.createHash('sha256').update(b).digest('hex');
function validateInWorker(bytes,entry,previous,now){
 return new Promise((resolve,reject)=>{
  const {Worker}=require('node:worker_threads'),worker=new Worker(path.join(__dirname,'private-market-worker.cjs'),{workerData:{bytes,entry,previous,now:now.toISOString()},env:{}});let received=false;
  const timer=setTimeout(()=>{void worker.terminate();reject(Error('Kiểm định snapshot vượt thời gian.'));},30000);
  worker.once('message',result=>{received=true;clearTimeout(timer);void worker.terminate().then(()=>result.error?reject(Error(result.error)):resolve(result)).catch(reject);});
  worker.once('error',error=>{clearTimeout(timer);reject(error);});
  worker.once('exit',()=>{if(!received){clearTimeout(timer);reject(Error('Luồng kiểm định snapshot dừng sớm.'));}});
 });
}
function manifest(bytes){
  if(bytes.length>65536)throw Error('Manifest riêng quá lớn.');const m=JSON.parse(bytes);
  if(m.version!==1||!m.active||!Array.isArray(m.history)||m.history.length>3)throw Error('Manifest riêng không hợp lệ.');
  for(const e of [m.active,...m.history])if(!/^[a-f0-9]{64}$/.test(e.id)||e.file!=='snapshots/'+e.id+'.json.gz'||e.kind!=='EOD'||!Q.dateValid(e.tradingDate))throw Error('Archive riêng không hợp lệ.');
  return m;
}
function decode(bytes,entry,previous=null,now=new Date()){
  if(bytes.length>16*1048576)throw Error('Snapshot riêng quá lớn.');
  const p=JSON.parse(zlib.gunzipSync(bytes,{maxOutputLength:64*1048576}));
  if(hash(p)!==entry.id||p.meta.asOf!==entry.tradingDate||p.meta.snapshotKind!=='EOD')throw Error('Hash/phiên snapshot DNSE không khớp.');
  P.validate(p,previous,{now,sourceProvider:'DNSE'});return p;
}
class PrivateStore{
  constructor(env,{fetcher=fetch}={}){
    const u=new URL(env.SUPABASE_URL||'');
    if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.port||u.username||u.password||u.search||u.hash)throw Error('Cần URL Supabase HTTPS hợp lệ.');
    if(typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||env.SUPABASE_SERVICE_ROLE_KEY.length<20)throw Error('Thiếu secret lưu snapshot phía server.');
    this.base=u.origin+'/storage/v1';this.key=env.SUPABASE_SERVICE_ROLE_KEY;this.bucket='tracker-dnse-private';this.fetcher=fetcher;
  }
  async request(route,{method='GET',body,upsert=false,max=16*1048576}={}){
    try{
      const r=await this.fetcher(this.base+route,{method,body,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:this.key,Authorization:'Bearer '+this.key,...(body?{'Content-Type':route.endsWith('.gz')?'application/gzip':'application/json','Cache-Control':'no-store','x-upsert':String(upsert)}:{})}});
      if(!r.ok)throw Error('http');const parts=[];let size=0;for await(const part of r.body){size+=part.length;if(size>max)throw Error('size');parts.push(part);}return Buffer.concat(parts);
    }catch{throw Error('Kho snapshot riêng chưa sẵn sàng; giữ bản trước, kiểm tra quyền/kết nối/hạn mức.');}
  }
  async assertPrivate(){const b=JSON.parse(await this.request('/bucket/'+this.bucket,{max:65536}));if(b.id!==this.bucket||b.public!==false)throw Error('Từ chối bucket không được xác nhận private.');}
  object(name){if(name!=='active.json'&&!/^snapshots\/[a-f0-9]{64}\.json\.gz$/.test(name))throw Error('Tên object riêng không hợp lệ.');return '/object/'+this.bucket+'/'+name;}
  get(name){return this.request(this.object(name).replace('/object/','/object/authenticated/'),{max:name==='active.json'?65536:16*1048576});}
  put(name,bytes){return this.request(this.object(name),{method:'POST',body:bytes,upsert:name==='active.json',max:65536});}
}
class PrivateMarket{
  constructor({store,dir,clock=Date.now,interval=60000}){
    this.store=store;this.clock=clock;this.interval=interval;this.dir=path.resolve(dir);
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});this.dir=fs.realpathSync(this.dir);
    const pub=fs.realpathSync(path.resolve(__dirname,'../../public'));
    if(this.dir===pub||this.dir.startsWith(pub+path.sep))throw Error('Kho DNSE phải nằm ngoài public.');
    this.current=null;this.checked=0;this.pending=null;this.problem=null;this.workTail=Promise.resolve();this.verified=new Map();
  }
  work(fn){const task=this.workTail.then(fn);this.workTail=task.catch(()=>{});return task;}
  async refresh(){
    if(this.current&&this.clock()-this.checked<this.interval&&!this.problem)return this.current;
    if(this.pending)return this.pending;
    this.pending=(async()=>{try{
      await this.store.assertPrivate();const m=manifest(await this.store.get('active.json'));
      let p=this.current?.payload;
      if(m.active.id!==this.current?.manifest.active.id){const b=await this.store.get(m.active.file),previous=this.current?{file:this.current.file,entry:this.current.manifest.active}:null;p=await this.work(()=>validateInWorker(b,m.active,previous,new Date(this.clock())));
        const file=path.join(this.dir,m.active.id+'.json.gz'),temporary=file+'.'+crypto.randomUUID()+'.tmp';
        try{fs.writeFileSync(temporary,b,{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}finally{try{fs.unlinkSync(temporary);}catch{}}
        this.current={manifest:m,payload:p,file};this.verified.set(m.active.id,bytesHash(b));const retained=new Set([m.active,...m.history].map(e=>e.id));for(const id of this.verified.keys())if(!retained.has(id))this.verified.delete(id);
      }else {if(m.active.tradingDate!==p.meta.asOf)throw Error('Manifest lệch phiên với hash đang dùng.');this.current.manifest=m;}
      this.checked=this.clock();this.problem=null;return this.current;
    }catch{this.problem='Chưa tải được snapshot DNSE mới; đang giữ bản riêng trước đó.';throw Error(this.problem);}finally{this.pending=null;}})();return this.pending;
  }
  async asset(name){const c=await this.refresh();if(name==='active.json')return {bytes:Buffer.from(JSON.stringify(c.manifest)),type:'application/json'};
    const e=[c.manifest.active,...c.manifest.history].find(e=>e.file===name);if(!e)throw Error('Không tìm thấy snapshot riêng.');
    const file=path.join(this.dir,e.id+'.json.gz');let b=fs.existsSync(file)?fs.readFileSync(file):await this.store.get(e.file);const digest=bytesHash(b);
    if(this.verified.get(e.id)!==digest){await this.work(()=>validateInWorker(b,e,null,new Date(this.clock())));this.verified.set(e.id,digest);}return {bytes:b,type:'application/gzip'};
  }
  async quant(){let c;try{c=await this.refresh();}catch{c=this.current;if(!c)throw Error(this.problem);}
    const result=await this.work(()=>D.snapshot(c.file));return this.problem?{...result,quality:Q.assess({...result.meta,refreshError:true}),refresh:{warning:this.problem}}:result;
  }
}
function renderIndex(html,{apiBase=''}={}){
  if(apiBase&&apiBase!=='https://tracker-ai-free.onrender.com')throw Error('Backend DNSE chưa được cấu hình/kiểm chứng.');
  const mode='window.TRACKER_PERSONAL_WEB = true;',script='<script src="./shared/personal-ui.js" defer></script>';
  if(!html.includes(mode)||!html.includes(script))throw Error('Không tìm được điểm nối web DNSE.');
  return html.replace(mode,"window.TRACKER_PERSONAL_WEB = false; window.TRACKER_PRIVATE_MARKET_WEB = true; window.TRACKER_PRIVATE_API_BASE = "+JSON.stringify(apiBase)+"; window.TRACKER_AUTOMATIC_OPTIONS = {provider:'DNSE',dataBase:"+JSON.stringify(apiBase+'/api/ai/market/')+"};")
    .replace(script,'<script src="./shared/automatic-data.js" defer></script><script src="./shared/private-market-ui.js" defer></script>')
    .replace('<script src="./ai/config.js"></script>','<script>window.TRACKER_AI_CONFIG = Object.freeze('+JSON.stringify({enabled:false,privateData:true,...(apiBase?{launchUrl:apiBase}:{})})+');</script>')
    .replace('if(window.TRACKER_PERSONAL_WEB){toast(', 'if(window.refreshTrackerSharedMarketData){await window.refreshTrackerSharedMarketData();return;}\n      if(window.TRACKER_PERSONAL_WEB){toast(');
}
module.exports={PrivateStore,PrivateMarket,manifest,decode,hash,renderIndex};
