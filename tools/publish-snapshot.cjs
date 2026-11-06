'use strict';
// Chỉ công bố candidate đã kiểm tra; ranh giới production là Pages artifact nguyên khối.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const B=require('../public/backtest/engine.js'),Q=require('../public/shared/data-quality.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function parse(file){const b=fs.readFileSync(file);return JSON.parse(b[0]===31?zlib.gunzipSync(b):b);}
function latestValidDate(symbol){
  let latest=null;
  // Quét ngược để thường chỉ cần kiểm tra OHLCV của bar cuối; vẫn đúng khi legacy chưa sắp xếp.
  for(let i=(symbol.rows?.length||0)-1;i>=0;i--){const row=symbol.rows[i];if(!Array.isArray(row)||latest&&row[0]<=latest)continue;const [date,open,high,low,close,volume]=row;if(Q.validBar({date,open,high,low,close,volume}))latest=date;}
  return latest;
}
function validate(candidate,previous,{allowMissing=[],now=new Date()}={}){
  const prepared=B.prepare(candidate),m=candidate.meta,clock=Q.clock(now);
  if(prepared.audit.invalid)throw Error('Candidate còn '+prepared.audit.invalid+' bar sai OHLCV.');
  if(!prepared.audit.rows||!Q.dateValid(m.asOf)||m.asOf!==prepared.audit.last||m.asOf>clock.today)throw Error('Phiên candidate không hợp lệ.');
  if(m.snapshotKind==='EOD'&&m.asOf>clock.expectedSession)throw Error('Không công bố EOD khi phiên chưa đóng cửa.');
  const benchmark=prepared.series.get('VNINDEX');if(!benchmark?.length||benchmark.at(-1).date!==m.asOf||benchmark.length<210)throw Error('Thiếu VNINDEX cùng phiên/đủ lịch sử.');
  if(m.rowCount!==prepared.audit.rows||m.symbolCount!==prepared.audit.symbols)throw Error('Số dòng/mã không khớp metadata.');
  if(!['EOD','INTRADAY'].includes(m.snapshotKind))throw Error('Chưa xác định EOD/intraday.');
  if(!Array.isArray(m.sourceProviders)||m.sourceProviders.length!==1||m.sourceProviders[0]!=='KBS')throw Error('Nguồn thực chưa được duyệt; không đổi provider ngầm.');
  const failed=m.coverage?.failedTickers||[];if(failed.some(t=>!allowMissing.includes(t)))throw Error('Thiếu mã trong universe: '+failed.filter(t=>!allowMissing.includes(t)).join(','));
  if(previous){if(m.asOf<previous.meta.asOf)throw Error('Không thay bản tốt bằng phiên cũ hơn.');const available=new Set(candidate.symbols.map(s=>s.ticker)),missing=previous.symbols.filter(s=>!available.has(s.ticker)&&!allowMissing.includes(s.ticker));if(missing.length)throw Error('Mất mã so với bản trước: '+missing.map(s=>s.ticker).join(','));
    const regressions=[];
    for(const symbol of previous.symbols){if(!available.has(symbol.ticker))continue;const beforeDate=latestValidDate(symbol),candidateDate=prepared.series.get(symbol.ticker)?.at(-1)?.date||null;if(beforeDate&&(!candidateDate||candidateDate<beforeDate))regressions.push({ticker:symbol.ticker,beforeDate,candidateDate});}
    if(regressions.length){const error=Error('Không công bố snapshot làm lùi phiên của '+regressions.length+' mã: '+regressions.slice(0,20).map(r=>r.ticker+' '+r.beforeDate+' → '+(r.candidateDate||'MISSING')).join(', '));error.code='SYMBOL_SESSION_REGRESSION';error.details={count:regressions.length,regressions};throw error;}
  }
  return prepared.audit;
}
function publish(candidateFile,dir,options={}){
  dir=path.resolve(dir);fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'.publish.lock'),fd=fs.openSync(lock,'wx');
  const backups=new Map(),temps=[];const replace=(name,bytes)=>{const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});if(!backups.has(file))backups.set(file,fs.existsSync(file)?fs.readFileSync(file):null);const temp=file+'.'+crypto.randomUUID()+'.tmp';temps.push(temp);fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);};
  try{
    const currentFile=path.join(dir,'market.json.gz'),manifestFile=path.join(dir,'active.json'),manifest=fs.existsSync(manifestFile)?parse(manifestFile):{version:1,history:[]};let p;
    if(options.rollback){const entry=[manifest.active,...manifest.history].find(x=>x?.id===options.rollback);if(!entry||!/^snapshots\/[a-f0-9]{64}\.json\.gz$/.test(entry.file))throw Error('Không có snapshot rollback đã đăng ký.');const bytes=fs.readFileSync(path.join(dir,entry.file));if(hash(zlib.gunzipSync(bytes))!==entry.id)throw Error('Hash rollback không khớp.');p=parse(path.join(dir,entry.file));}
    else p=parse(candidateFile);
    const previous=fs.existsSync(currentFile)?parse(currentFile):null;
    const audit=validate(p,options.rollback?null:previous,options),raw=Buffer.from(JSON.stringify(p)),id=hash(raw),compressed=zlib.gzipSync(raw,{mtime:0});
    // Intraday còn phải giữ phiên đã biết của bản intraday trước, ngoài bản EOD.
    const intradayFile=path.join(dir,'intraday.json.gz');if(p.meta.snapshotKind==='INTRADAY'&&!options.rollback&&fs.existsSync(intradayFile))validate(p,parse(intradayFile),options);
    const entry={id,hashBasis:'utf8-json-raw-v1',file:'snapshots/'+id+'.json.gz',tradingDate:p.meta.asOf,kind:p.meta.snapshotKind,source:p.meta.source,publishedAt:new Date().toISOString(),audit};
    if(p.meta.snapshotKind==='INTRADAY'){
      replace('intraday.json.gz',compressed);replace('intraday-manifest.json',Buffer.from(JSON.stringify(entry,null,2)));return {published:'intraday',entry};
    }
    replace(entry.file,compressed);replace('market.json.gz',compressed);replace('market.json',raw);
    const history=[manifest.active,...manifest.history].filter(x=>x&&x.id!==id).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).slice(0,3);
    replace('active.json',Buffer.from(JSON.stringify({version:1,active:entry,history},null,2)));
    // Chỉ dọn archive do manifest cũ đăng ký, giữ active và ba bản rollback.
    const retained=new Set([entry,...history].map(x=>x.file));
    for(const old of [manifest.active,...manifest.history])if(old?.file&&!retained.has(old.file)&&/^snapshots\/[a-f0-9]{64}\.json\.gz$/.test(old.file)){
      try{const file=path.join(dir,old.file);if(fs.existsSync(file)&&hash(zlib.gunzipSync(fs.readFileSync(file)))===old.id)fs.unlinkSync(file);}catch(e){console.warn('Chưa dọn được archive hết hạn: '+e.code);}
    }
    return {published:'EOD',entry,previous:manifest.active?.id||null};
  }catch(e){for(const [file,bytes]of [...backups].reverse()){if(bytes===null){try{fs.unlinkSync(file);}catch{}}else fs.writeFileSync(file,bytes);}throw e;}
  finally{for(const file of temps)try{fs.unlinkSync(file);}catch{}fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(require.main===module){try{const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],options={allowMissing:args.includes('--allow-missing')?get('--allow-missing').split(','):[],rollback:args.includes('--rollback')?get('--rollback'):null};if(!args.includes('--dir')||(!options.rollback&&!args.includes('--candidate')))throw Error('Dùng --candidate <file> --dir <data> hoặc --rollback <id> --dir <data>.');console.log(JSON.stringify(publish(get('--candidate'),get('--dir'),options)));}catch(e){console.error(e.message);if(e.code==="SYMBOL_SESSION_REGRESSION")console.error(JSON.stringify({code:e.code,...e.details}));process.exitCode=1;}}
module.exports={parse,validate,publish};
