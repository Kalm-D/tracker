'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const POLICY_VERSION='token-policy-1.0.0';
const integer=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function option(env,key,fallback,min,max){if(env[key]===undefined||env[key]==='')return fallback;const n=Number(env[key]);if(!integer(n,min,max))throw new Error('Cấu hình giới hạn không hợp lệ: '+key);return n;}
function limits(env={}){
 const result={maxCalls:option(env,'AI_MAX_DAILY_CALLS',30,1,1000),maxTokens:option(env,'AI_MAX_DAILY_TOKENS',60000,1,10000000),providers:{}};
 for(const name of ['gemini','groq']){const prefix=name.toUpperCase();result.providers[name]={rpm:option(env,prefix+'_MAX_RPM',5,1,1000),tpm:option(env,prefix+'_MAX_TPM',60000,1,10000000),rpd:option(env,prefix+'_MAX_RPD',30,1,1000),tpd:option(env,prefix+'_MAX_TPD',60000,1,10000000)};}
 return result;
}
const empty=()=>({schemaVersion:1,days:{},events:[],cooldowns:{},observations:{}});
const dayAt=now=>new Date(now).toISOString().slice(0,10);
const stats=()=>({attempts:0,reservedTokens:0,chargedTokens:0,actualTokens:0,inputTokens:0,outputTokens:0,reasoningTokens:0,unknownUsageResponses:0,inputReports:0,outputReports:0,reasoningReports:0});
function usage(provider,raw){
 if(!raw||typeof raw!=='object')return null;
 const values=provider==='gemini'?{input:raw.promptTokenCount,output:raw.candidatesTokenCount,reasoning:raw.thoughtsTokenCount,total:raw.totalTokenCount}:{input:raw.prompt_tokens,output:raw.completion_tokens,reasoning:raw.completion_tokens_details?.reasoning_tokens,total:raw.total_tokens};
 if(!integer(values.total,0,100000000)||Object.values(values).some(x=>x!==undefined&&!integer(x,0,100000000)))return null;
 if(Object.values(values).some(x=>x!==undefined&&x>values.total)||(values.input!==undefined&&values.output!==undefined&&values.input+values.output>values.total))return null;
 return {input:values.input??null,output:values.output??null,reasoning:values.reasoning??null,total:values.total};
}
function readState(file,now){
 if(!fs.existsSync(file))return empty();if(fs.statSync(file).size>2*1048576)throw new Error('Sổ token vượt 2 MiB; cần kiểm tra bộ lưu.');let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('Sổ token không đọc được; dừng API để tránh đặt lại hạn mức.');}
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Sổ token sai kiểu dữ liệu; chặn API.');
 if(value.schemaVersion===undefined){
  const migrated=empty();for(const [day,d] of Object.entries(value)){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!d||(!['attempts','reservedTokens','actualTokens'].every(k=>integer(d[k]))||Object.keys(d).some(k=>!['attempts','reservedTokens','actualTokens'].includes(k))))throw new Error('Sổ token cũ sai định dạng; cần kiểm tra bản lưu.');migrated.days[day]={...stats(),...d,chargedTokens:Math.max(d.reservedTokens,d.actualTokens)};
   if(day>=dayAt(now-86400000)&&day<=dayAt(now))migrated.events.push({id:crypto.randomUUID(),scope:'legacy_unknown',at:now,estimate:migrated.days[day].chargedTokens,charged:migrated.days[day].chargedTokens,count:d.attempts,settled:true});
  }return migrated;
 }
 if(value.schemaVersion!==1||!value.days||Array.isArray(value.days)||!Array.isArray(value.events)||value.events.length>5000||!value.cooldowns||!value.observations)throw new Error('Sổ token sai schema; API đang bị chặn.');
 for(const [day,d] of Object.entries(value.days))if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!d||(!Object.keys(stats()).every(k=>integer(d[k]))||Object.keys(d).some(k=>!Object.hasOwn(stats(),k))))throw new Error('Bộ đếm token sai định dạng.');
 const scopeValid=s=>typeof s==='string'&&/^(gemini|groq):[\w./-]{3,100}$/.test(s);
 for(const e of value.events)if(typeof e.id!=='string'||!/^[a-f0-9-]{36}$/.test(e.id)||!(scopeValid(e.scope)||e.scope==='legacy_unknown')||!integer(e.at)||!integer(e.estimate)||!integer(e.charged)||!integer(e.count,1,1000)||typeof e.settled!=='boolean')throw new Error('Lịch sử quota sai định dạng.');
 for(const [scope,v] of Object.entries(value.cooldowns))if(!scopeValid(scope)||!integer(v))throw new Error('Cooldown quota sai định dạng.');
 for(const [scope,o]of Object.entries(value.observations))if(!scopeValid(scope)||!o||Object.keys(o).some(k=>!['at','status','retryAt','remainingRequests','remainingTokens'].includes(k))||!integer(o.at)||!integer(o.status,100,599)||(o.retryAt!==null&&!integer(o.retryAt))||['remainingRequests','remainingTokens'].some(k=>o[k]!==undefined&&!integer(o[k],0,100000000)))throw new Error('Quan sát quota sai schema.');
 return value;
}
class TokenManager{
 constructor(dir,env={},clock=Date.now){this.file=path.join(dir,'usage.json');this.lock=this.file+'.lock';this.clock=clock;fs.mkdirSync(dir,{recursive:true,mode:0o700});try{this.limits=limits(env);}catch(e){this.configError=e.message;}this.state=empty();this.refresh();}
 refresh(){try{this.state=readState(this.file,this.clock());this.storageError=null;const holdFile=path.join(path.dirname(this.file),'restore-hold.json');if(fs.existsSync(holdFile)){let h;try{h=JSON.parse(fs.readFileSync(holdFile,'utf8'));}catch{throw new Error('Dấu khôi phục quota không đọc được; chặn API.');}if(h.schemaVersion!==1||!integer(h.until))throw new Error('Dấu khôi phục quota sai định dạng; chặn API.');if(h.until>this.clock())throw new Error('Bản sao lưu đã được khôi phục; giữ API model đến '+new Date(h.until).toISOString()+' để tránh đặt lại quota chưa quan sát.');}}catch(e){this.storageError=e.message;}return this.state;}
 transaction(fn){
  if(this.configError)throw new Error(this.configError);let fd;try{fd=fs.openSync(this.lock,'wx',0o600);}catch{throw new Error('Sổ token đang bị khóa; chưa gọi API. Kiểm tra tiến trình trước khi khôi phục khóa.');}
  try{this.refresh();if(this.storageError)throw new Error(this.storageError);const now=this.clock();this.state.events=this.state.events.filter(e=>e.at>now-86400000);for(const day of Object.keys(this.state.days))if(day<dayAt(now-35*86400000))delete this.state.days[day];const result=fn(this.state,now);const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.state),{mode:0o600});fs.renameSync(tmp,this.file);this.onPersist?.(this.state);return result;}finally{fs.closeSync(fd);fs.unlinkSync(this.lock);}
 }
 reserve(provider,model,estimate){
  if(!['gemini','groq'].includes(provider)||typeof model!=='string'||!integer(estimate,1,10000000))throw new Error('Giữ chỗ token không hợp lệ.');
  return this.transaction((s,now)=>{const scope=provider+':'+model,day=dayAt(now),d=s.days[day]||stats(),l=this.limits.providers[provider],daily=s.events.filter(e=>(e.scope.startsWith(provider+':')||e.scope==='legacy_unknown')&&e.at>now-86400000),minute=daily.filter(e=>e.at>now-60000),sum=(a,key)=>a.reduce((n,e)=>n+e[key],0);
   if((s.cooldowns[scope]||0)>now)throw new Error('Provider '+provider+' đang chờ quota đến '+new Date(s.cooldowns[scope]).toISOString()+'.');
   if(d.attempts>=this.limits.maxCalls||d.chargedTokens+estimate>this.limits.maxTokens)throw new Error('Đã đạt ngân sách AI nội bộ; giữ kết quả và thử lại sau.');
   if(sum(minute,'count')>=l.rpm||sum(minute,'charged')+estimate>l.tpm||sum(daily,'count')>=l.rpd||sum(daily,'charged')+estimate>l.tpd)throw new Error('Đã đạt giới hạn nội bộ RPM/TPM/RPD/TPD của '+provider+'. Quota thực tế có thể thấp hơn.');
   const e={id:crypto.randomUUID(),scope,at:now,estimate,charged:estimate,count:1,settled:false};s.events.push(e);d.attempts++;d.reservedTokens+=estimate;d.chargedTokens+=estimate;s.days[day]=d;return {id:e.id,day,scope,estimate};
  });
 }
 settle(ticket,provider,raw){return this.transaction(s=>{const e=s.events.find(e=>e.id===ticket.id);if(!e||e.settled)return;const d=s.days[ticket.day];if(!d)throw new Error('Thiếu bản giữ chỗ token.');const u=usage(provider,raw);e.settled=true;
  if(!u){d.unknownUsageResponses++;return null;}d.actualTokens+=u.total;d.inputTokens+=u.input||0;d.outputTokens+=u.output||0;d.reasoningTokens+=u.reasoning||0;for(const field of ['input','output','reasoning'])if(u[field]!==null)d[field+'Reports']++;const extra=Math.max(0,u.total-e.charged);e.charged+=extra;d.chargedTokens+=extra;return u;
 });}
 observe(provider,model,response){
  const now=this.clock(),raw=response.headers.get('retry-after');let retryAt=null;if(raw!==null){const seconds=Number(raw);const time=Number.isFinite(seconds)&&seconds>=0?now+seconds*1000:Date.parse(raw);if(Number.isFinite(time))retryAt=Math.min(now+86400000,Math.max(now,time));}
  if(response.status===429&&retryAt===null)retryAt=now+60000;
  return this.transaction(s=>{const scope=provider+':'+model,o={at:now,status:response.status,retryAt};for(const [header,key] of [['x-ratelimit-remaining-requests','remainingRequests'],['x-ratelimit-remaining-tokens','remainingTokens']]){const text=response.headers.get(header);if(text!==null&&integer(Number(text),0,100000000))o[key]=Number(text);}s.observations[scope]=o;if(retryAt!==null)s.cooldowns[scope]=Math.max(s.cooldowns[scope]||0,retryAt);return o;});
 }
 status(){this.refresh();const day=dayAt(this.clock()),d=this.state.days[day]||stats();return {...d,dayUTC:day,maxCalls:this.limits?.maxCalls??null,maxEstimatedTokens:this.limits?.maxTokens??null,policyVersion:POLICY_VERSION,healthy:!this.configError&&!this.storageError,problem:this.configError||this.storageError||null,providerQuota:'unknown_until_provider_response',providerCeilings:this.limits?.providers||{},cooldowns:{...this.state.cooldowns},observations:structuredClone(this.state.observations),accounting:'estimates_reserved_before_generation; rolling_24h_provider_caps; no_refund_on_error',cost:'not_inferred_from_token_count'};}
}
module.exports={TokenManager,limits,usage,POLICY_VERSION};
