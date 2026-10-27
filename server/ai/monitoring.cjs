'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),D=require('./data.cjs');
const VERSION='monitoring-0.3.0';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const number=x=>Number.isFinite(x)?x:null;
function point(m,regime){return {close:number(m?.close),m50:number(m?.m50),pivot:number(m?.pivot),dataQuality:m?.dataQuality||'MISSING',regime:regime?.key||'UNKNOWN'};}
function transitions(before,after,levels){
 const out=[];if(after.close===null||after.dataQuality!=='D0'){if(before.dataQuality!==after.dataQuality)out.push({type:'data_quality',message:'Chất lượng dữ liệu đổi: '+before.dataQuality+' → '+after.dataQuality});return out;}
 if(before.close!==null&&before.dataQuality==='D0'){
  for(const [key,direction,label] of [['stop','down','Close xuống qua mốc vô hiệu hóa đã lưu'],['target','up','Close lên qua mục tiêu giả định đã lưu'],['entry','up','Close lên qua mốc vào tham chiếu đã lưu']]){
   const v=levels[key]?.price;if(Number.isFinite(v)&&v>0&&((direction==='down'&&before.close>v&&after.close<=v)||(direction==='up'&&before.close<v&&after.close>=v)))out.push({type:key+'_cross',message:label,level:v,source:levels[key].source});
  }
  if(before.m50>0&&after.m50>0&&((before.close>=before.m50&&after.close<after.m50)||(before.close<=before.m50&&after.close>after.m50)))out.push({type:'ma50_cross',message:after.close<after.m50?'Close xuống dưới MA50':'Close lên trên MA50'});
 }
 if(before.dataQuality!==after.dataQuality)out.push({type:'data_quality',message:'Chất lượng dữ liệu đổi: '+before.dataQuality+' → '+after.dataQuality});
 if(before.regime!==after.regime)out.push({type:'regime_change',message:'Bối cảnh thị trường: '+before.regime+' → '+after.regime});
 return out;
}
class Monitoring{
 constructor({dir,dataFile,snapshot=D.snapshot,intervalMs=60000,autoStart=true,durability=null}){
  this.durability=durability;this.file=path.join(dir,'monitors.json');this.dataFile=dataFile;this.snapshot=snapshot;this.records=new Map();this.pending=null;this.stopped=false;fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.existsSync(this.file))try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved.version!==VERSION||!Array.isArray(saved.records))throw new Error('Dữ liệu Monitoring không tương thích; cần kiểm tra bản lưu.');for(const r of saved.records)this.records.set(r.id,r);}catch{this.loadError='Bộ lưu Monitoring không đọc được hoặc sai schema; giữ nguyên file và chặn ghi cho đến khi khôi phục.';}
  if(autoStart)this.timer=setInterval(()=>this.checkAll().catch(()=>{}),Math.max(60000,intervalMs)).unref();
 }
 save(){if(this.loadError)throw new Error(this.loadError);const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({version:VERSION,records:[...this.records.values()]}),{mode:0o600});fs.renameSync(tmp,this.file);this.durability?.put('monitoring/monitors.json',{version:VERSION,records:[...this.records.values()]});}
 list(){return [...this.records.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 create(job){if(this.loadError)throw new Error(this.loadError);
  if(!job||!['completed','blocked'].includes(job.status))throw new Error('Chỉ theo dõi báo cáo đã kết thúc có bằng chứng kỹ thuật.');
  const e=job.report?.evidence?.find(e=>e.type==='deterministic_calculation'),tickers=job.plan?.tickers||[];
  if(!e||!tickers.length||tickers.length>5||!/^[a-f0-9]{64}$/.test(e.sha256)||!/^\d{4}-\d{2}-\d{2}$/.test(e.dataDate))throw new Error('Thiếu snapshot hoặc mã để tạo theo dõi.');
  const duplicate=this.list().find(r=>r.jobId===job.id);if(duplicate)return duplicate;
  if(this.records.size>=20)throw new Error('Tối đa 20 bộ theo dõi; xóa bộ không còn dùng.');
  const points={},levels={};for(const t of tickers){const m=e.metrics.find(m=>m.ticker===t);if(!m||!Number.isFinite(m.close))throw new Error('Thiếu giá cơ sở cho '+t);points[t]=point(m,e.regime);const s=job.report.strategies?.find(s=>s.ticker===t);levels[t]=structuredClone({entry:s?.entryReference||null,stop:s?.stopReference||null,target:s?.targetReference||null});}
  const now=new Date().toISOString(),r={id:crypto.randomUUID(),version:VERSION,jobId:job.id,createdAt:now,enabled:true,tickers,levels,baseline:{date:e.dataDate,hash:e.sha256,points:structuredClone(points)},checkpoint:{date:e.dataDate,hash:e.sha256,points},lastCheckedAt:null,status:'waiting_for_check',events:[],droppedEvents:0};
  this.records.set(r.id,r);this.save();return r;
 }
 setEnabled(id,enabled){if(this.loadError)throw new Error(this.loadError);const r=this.records.get(id);if(!r)throw new Error('Không tìm thấy bộ theo dõi.');if(typeof enabled!=='boolean')throw new Error('enabled phải là boolean.');r.enabled=enabled;this.save();return r;}
 remove(id){if(this.loadError)throw new Error(this.loadError);if(!this.records.delete(id))throw new Error('Không tìm thấy bộ theo dõi.');this.save();}
 async checkAll(){if(this.stopped||this.loadError)return;if(this.pending)return this.pending;const ids=this.list().filter(r=>r.enabled).map(r=>r.id);if(!ids.length)return;
  this.pending=(async()=>{try{const snap=await this.snapshot(this.dataFile);if(this.stopped)return;for(const id of ids){const r=this.records.get(id);if(r?.enabled)this.apply(r,snap);}}catch(e){if(!this.stopped)for(const id of ids){const r=this.records.get(id);if(r?.enabled){r.status='source_error';r.error=e.message;r.lastCheckedAt=new Date().toISOString();}}}finally{if(!this.stopped){this.save();await this.durability?.flush();}}})();try{await this.pending;}finally{this.pending=null;}
 }
 apply(r,snap){
  r.lastCheckedAt=new Date().toISOString();delete r.error;r.freshness=D.freshness(snap.date);
  if(!/^[a-f0-9]{64}$/.test(snap.sha256)||!/^\d{4}-\d{2}-\d{2}$/.test(snap.date))throw new Error('Snapshot Monitoring thiếu hash/ngày.');
  if(snap.date<r.checkpoint.date){r.status='older_snapshot';return;}
  if(snap.sha256===r.checkpoint.hash){r.status='unchanged';return;}
  const sameDate=snap.date===r.checkpoint.date,points={};
  for(const t of r.tickers){const next=point(snap.metrics.find(m=>m.ticker===t),snap.regime),before=r.checkpoint.points[t];points[t]=next;
   const changes=sameDate?[{type:'snapshot_revision',message:'Nguồn chỉnh sửa cùng ngày; đặt lại mốc, không coi là giao cắt theo thời gian.'}]:transitions(before,next,r.levels[t]);
   for(const event of changes){const id=digest([r.id,snap.sha256,t,event.type,VERSION]);if(r.events.some(e=>e.id===id))continue;r.events.push({...event,id,ticker:t,dataDate:snap.date,snapshotHash:snap.sha256,previousDate:r.checkpoint.date,previousClose:before.close,close:next.close,recordedAt:r.lastCheckedAt});}
  }
  if(r.events.length>200){r.droppedEvents+=r.events.length-200;r.events=r.events.slice(-200);}
  r.checkpoint={date:snap.date,hash:snap.sha256,points};r.status=sameDate?'revised_snapshot':'updated';
 }
 status(){return {version:VERSION,storageProblem:this.loadError||null,mode:'local_snapshot_poll',intervalSeconds:60,delivery:'in_app_only',running:!this.stopped,limitation:'Chỉ kiểm tra khi máy chủ đang chạy; cần nguồn cập nhật file snapshot. Sau khởi động lại sẽ tiếp tục bộ đã bật. Không tải giá mới, không gửi email/push, không theo dõi intraday, không tạo lệnh. Nếu bỏ lỡ nhiều phiên chỉ so hai snapshot quan sát được.'};}
 shutdown(){this.stopped=true;clearInterval(this.timer);}
}
module.exports={VERSION,point,transitions,Monitoring};
