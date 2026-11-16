'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Gateway}=require('./gateway.cjs'),{Research}=require('./research.cjs'),{VERSION}=require('./contracts.cjs');
const {Monitoring}=require('./monitoring.cjs');
const {Operations,acquire}=require('./operations.cjs');
const Analyst=require('./analyst.cjs');
const root=path.resolve(__dirname,'../..'),publicDir=path.join(root,'public');
const safeEqual=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const {Accounts,passwordHash,verifyPassword,capabilities,owned}=require('./accounts.cjs');
async function body(req){const chunks=[];let size=0;for await(const x of req){size+=x.length;if(size>20000)throw new Error('Yêu cầu quá lớn.');chunks.push(x);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))||'{}');}
function createApp({env=process.env,dir=path.resolve(env.TRACKER_AI_JOBS_DIR||path.join(root,'.ai-jobs')),gateway,tools,durability=null,privateMarket=null}={}){
 const privateMode=env.TRACKER_MARKET_PRIVATE_DNSE==='true';
 if(privateMode&&!privateMarket)throw Error('Web DNSE cá nhân cần kho snapshot riêng, không fallback dữ liệu public.');
 // Không gửi dữ liệu gốc/đã xử lý của tài khoản DNSE sang nhà cung cấp AI bên ngoài.
 if(privateMode)env={...env,GEMINI_API_KEY:'',GROQ_API_KEY:''};
 if(env.TRACKER_AI_ENABLED==='true'&&env.TRACKER_AI_HOST&&!['127.0.0.1','localhost','::1'].includes(env.TRACKER_AI_HOST)&&(env.TRACKER_AI_COOKIE_SECURE!=='true'||!/^https:\/\/[^/]+$/.test(env.TRACKER_AI_ALLOWED_ORIGIN||'')))throw new Error('Bind ngoài loopback cần Origin HTTPS chính xác và cookie Secure.');
 const enabled=env.TRACKER_AI_ENABLED==='true',sessions=new Map(),attempts=new Map(),runtimeLock=acquire(dir);
 const operations=new Operations({dir,env});
 let research,monitoring,accounts;try{
 accounts=new Accounts({dir,env,durability});
 gateway=gateway||new Gateway(path.join(dir,'gateway'),env,fetch,{durability,onEvent:(event,data)=>operations.record(event,data)});
 research=new Research({dir:path.join(dir,'jobs'),dataFile:path.resolve(env.TRACKER_AI_DATA_FILE||path.join(publicDir,'data/market.json.gz')),gateway,tools,durability,analystConfig:Analyst.configuration(env)});
 monitoring=new Monitoring({dir:path.join(dir,'monitoring'),dataFile:research.dataFile,snapshot:research.tools.snapshot,autoStart:enabled,durability});
 }catch(e){operations.shutdown();runtimeLock.release();throw e;}
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const cookie=(value,age)=>'tracker_ai_session='+value+'; Path=/; HttpOnly; SameSite='+((env.TRACKER_AI_COOKIE_SECURE==='true')?'None; Secure':'Strict')+'; Max-Age='+age;
 const app=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  let url;try{url=new URL(req.url,'http://localhost');}catch{return json(res,400,{error:'URL không hợp lệ.'});}
  if(url.pathname==='/healthz'){const healthOrigin=req.headers.origin;if(healthOrigin&&healthOrigin===env.TRACKER_AI_ALLOWED_ORIGIN){res.setHeader('Access-Control-Allow-Origin',healthOrigin);res.setHeader('Vary','Origin');}if(!['GET','HEAD'].includes(req.method))return json(res,405,{status:'unavailable'});const healthy=durability?.status().healthy!==false&&enabled&&!research.stopped&&!research.storageError&&!monitoring.status().storageProblem&&gateway.status().usage?.healthy!==false&&!accounts.problem;return json(res,healthy?200:503,{status:healthy?'ok':'unavailable'});}
  if(url.pathname==='/ai/config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end('window.TRACKER_AI_CONFIG='+JSON.stringify({enabled,apiBase:'',version:VERSION,restrictedBacktest:true})+';');}
  if(!url.pathname.startsWith('/api/ai/')){
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Phương thức không hợp lệ.'});
   let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'URL không hợp lệ.'});}
   const file=path.resolve(publicDir,'.'+(decoded==='/'?'/index.html':decoded))…16891 tokens truncated…er == 'VNINDEX' else universe[ticker]['exchange'], 'Chưa phân loại', 320)
                valid = len(frame) == 320 and frame['date'].iloc[-1] == end
                report['checks'].append({'ticker': ticker, 'rows': len(frame), 'lastDate': frame['date'].iloc[-1] if len(frame) else None, 'sameSession320': bool(valid)})
                frames.append(frame)
            exporter.import_pandas().concat(frames, ignore_index=True).to_csv(folder / 'market.csv', index=False, encoding='utf-8-sig')
            report['ready'] = all(item['sameSession320'] for item in report['checks'])
            report['stage'] = 'complete'
    except BaseException as error:
        report['error'] = exporter.safe_error(error)
    report['checkedAt'] = datetime.now(timezone.utc).isoformat()
    # Không tự coi 5 mã là đủ điều kiện bootstrap toàn danh mục.
    report['fullUniverseValidated'] = False
    destination = root.parents[1] / 'outputs/DNSE_PRIVATE_LIVE.json'
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if report['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
