'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),dns=require('node:dns').promises;
const {spawn}=require('node:child_process'),path=require('node:path');
const ALLOWED=new Set(['www.hoaphat.com.vn','hoaphat.com.vn','fpt.com','www.fpt.com','www.gemadept.com.vn','gemadept.com.vn','www.mbbank.com.vn','mbbank.com.vn','acb.com.vn','www.acb.com.vn','techcombank.com','www.techcombank.com','www.hsx.vn','hsx.vn','www.hnx.vn','hnx.vn','vsd.vn','www.vsd.vn','vsdc.vn','www.vsdc.vn','sbv.gov.vn','www.sbv.gov.vn','www.nso.gov.vn','nso.gov.vn','www.federalreserve.gov','federalreserve.gov','www.gso.gov.vn','gso.gov.vn']);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function urlAllowed(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!ALLOWED.has(u.hostname.toLowerCase()))throw new Error('Chỉ đọc HTTPS từ danh sách nguồn chính thức.');return u;}
function publicAddress(a){return !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::|fc|fd|fe80)/i.test(a)&&(!a.includes(':')||/^[23]/.test(a));}
async function bounded(response,max,signal){
 if(Number(response.headers.get('content-length'))>max)throw new Error('Nguồn quá lớn.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Nguồn quá lớn.');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
function python(req,{signal,python=process.env.TRACKER_AI_PYTHON||[path.resolve(__dirname,'../../.venv-ai',process.platform==='win32'?'Scripts/python.exe':'bin/python')].find(p=>fs.existsSync(p))||(process.platform==='win32'?'python':'python3'),timeout=60000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(python,[path.join(__dirname,'finance_adapter.py')],{stdio:['pipe','pipe','ignore'],windowsHide:true,signal}),out=[];let size=0;
  const timer=setTimeout(()=>child.kill(),timeout);
  child.stdout.on('data',b=>{size+=b.length;if(size>800000)child.kill();else out.push(b);});
  child.once('error',()=>{clearTimeout(timer);reject(Object.assign(Error('Máy chủ chưa có môi trường Python đọc BCTC/PDF. Cần sửa bước build backend.'),{code:'FINANCE_RUNTIME_MISSING'}));});
  child.once('close',code=>{clearTimeout(timer);try{if(code!==0||size>800000)throw new Error('Nguồn hết thời gian hoặc không khả dụng.');const j=JSON.parse(Buffer.concat(out).toString('utf8'));if(!j.ok)throw Object.assign(new Error(j.message),{code:['FINANCE_DEPENDENCY_MISSING','FINANCE_SOURCE_UNAVAILABLE'].includes(j.code)?j.code:'FINANCE_SOURCE_UNAVAILABLE'});resolve(j.data);}catch(e){reject(e);}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(req));
 });
}
async function documentSource(raw,{signal,fetcher=fetch,resolve=dns.lookup,parse=python}={}){
 let u=urlAllowed(raw);const timeout=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)]);let response;
 for(let redirects=0;redirects<4;redirects++){
  const addresses=await resolve(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Địa chỉ nguồn không công khai.');
  response=await fetcher(u,{signal:timeout,redirect:'manual',headers:{Accept:'text/html,application/pdf,application/json'}});
  if(response.status>=300&&response.status<400){u=urlAllowed(new URL(response.headers.get('location'),u).href);response=null;continue;}break;
 }
 if(!response?.ok)throw new Error('Nguồn chính thức không khả dụng.');
 const bytes=await bounded(response,5*1024*1024,timeout),type=response.headers.get('content-type')||'';let text,truncated=false;
 if(type.includes('pdf')||bytes.subarray(0,5).toString()==='%PDF-'){const p=await parse({type:'pdf',data:bytes.toString('base64')},{signal});text=p.text;truncated=p.truncated;}
 else if(/html|text|json/.test(type)){text=bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();truncated=text.length>40000;text=text.slice(0,40000);}
 else throw new Error('Định dạng nguồn chưa được hỗ trợ.');
 if(text.length<40)throw new Error('Nguồn không có nội dung có thể đọc; có thể cần OCR.');
 return {id:'doc-'+hash(bytes).slice(0,16),type:'official_document',url:u.href,publishedAt:null,dataDate:null,retrievedAt:new Date().toISOString(),sha256:hash(bytes),text,truncated,verification:'retrieved_not_fact_checked'};
}
async function financialSource(ticker,{signal,adapter=python}={}){
 const data=await adapter({type:'finance',ticker},{signal});
 return {id:'finance-'+ticker+'-'+hash(JSON.stringify(data)).slice(0,12),type:'financial_statement',ticker,url:'https://trading.vietcap.com.vn/',publishedAt:null,dataDate:null,retrievedAt:new Date().toISOString(),sha256:hash(JSON.stringify(data)),data,verification:'provider_statement_publication_date_unknown'};
}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&nbsp;|&#160;/g,' ').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1');
async function newsDiscovery(question,tickers,{signal,fetcher=fetch,query,clock=Date.now}={}){
 const url=new URL('https://news.google.com/rss/search');
 // Câu hỏi có thể chứa dữ liệu riêng tư; RSS chỉ nhận mã và từ khóa công khai.
 const symbols=tickers.filter(t=>/^[A-Z0-9]{3}$/.test(t));
 const keywords=query||(symbols.length?'('+symbols.join(' OR ')+') cổ phiếu':'thị trường chứng khoán Việt Nam');
 url.search=new URLSearchParams({q:keywords.slice(0,500),hl:'vi',gl:'VN',ceid:'VN:vi'}).toString();
 const abort=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(15000)]);
 const r=await fetcher(url,{signal:abort,redirect:'error'});if(!r.ok)throw new Error('Không truy xuất được danh mục tin.');
 const bytes=await bounded(r,500000,abort),xml=bytes.toString('utf8'),seen=new Set();
 const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{
  const field=n=>decode(m[1].match(new RegExp('<'+n+'(?: [^>]*)?>([\\s\\S]*?)<\\/'+n+'>'))?.[1]||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const link=field('link'),date=field('pubDate'),timestamp=Date.parse(date),known=Number.isFinite(timestamp)&&timestamp<=clock();
  return {title:field('title').slice(0,700),excerpt:field('description').slice(0,280),url:/^https:\/\/news\.google\.com\//.test(link)?link:null,
   publishedAt:date,publishedAtISO:known?new Date(timestamp).toISOString():null,stale:known?clock()-timestamp>30*86400000:null,publisher:field('source')};
 }).filter(x=>{if(!x.url||!x.title||seen.has(x.url))return false;seen.add(x.url);return true;}).slice(0,8);
 return {id:'news-'+hash(url.href+bytes.toString('utf8')).slice(0,16),type:'news_discovery',tickers:symbols,scope:'company',url:url.href,retrievedAt:new Date(clock()).toISOString(),publishedAt:null,dataDate:null,sha256:hash(bytes),items,
  verification:'headlines_only_not_verified',limitation:'Chỉ là danh mục phát hiện tin, chưa xác minh bài gốc. Tin có cờ stale đã cũ; ngày chưa biết không được coi là tin mới.'};
}
async function sectorMacroNews(sector,{factors=[],...options}={}){
 if(typeof sector!=='string'||!sector.trim())throw Error('Chưa có ngành để tìm tin vĩ mô.');
 const e=await newsDiscovery('',[],{...options,query:[sector,...factors].join(' OR ')+' Việt Nam'});
 return {...e,scope:'sector',sector,factors};
}
module.exports={urlAllowed,publicAddress,bounded,python,documentSource,financialSource,newsDiscovery,sectorMacroNews,hash};
