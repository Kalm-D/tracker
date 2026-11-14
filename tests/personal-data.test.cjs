'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const P=require('../public/shared/personal-data.js'),Q=require('../public/shared/data-quality.js'),crypto=require('node:crypto').webcrypto;
const context=vm.createContext({window:{TrackerDataQuality:Q},document:{currentScript:{src:'https://tracker.test/shared/market-data.js'},baseURI:'https://tracker.test/'},URL});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/shared/market-data.js'),'utf8'),context);
const inflate=context.window.SharedMarketData.inflate;
const codecContext=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/shared/fflate.min.js'),'utf8'),codecContext);
const codec=codecContext.fflate,options={quality:Q,inflate,crypto,now:new Date('2026-11-14T02:00:00Z')};
function fixture(){const rows=[];let day='2026-11-13';while(rows.length<220){if(Q.trading(day))rows.unshift([day,10,11,9,10,1000]);day=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);}return {meta:{schema:'shared-market-v1',isDemo:false,asOf:'2026-11-13',source:'FIXTURE CÁ NHÂN',snapshotKind:'EOD',rowCount:440,adjustmentMode:'unknown'},symbols:[{ticker:'VNINDEX',exchange:'INDEX',rows},{ticker:'AAA',exchange:'HOSE',rows:structuredClone(rows)}]};}
test('Nhập snapshot giữ hash canonical, tuổi cuối tuần và metadata nguồn',async()=>{const p=fixture(),r=await P.prepare(p,options);assert.equal(r.rows.length,440);assert.equal(r.meta.quality.status,'FRESH');assert.equal(r.meta.adjustmentMode,'unknown');assert.equal(r.meta.personalUseOnly,true);assert.equal(r.meta.snapshotId,'sha256:'+require('node:crypto').createHash('sha256').update(JSON.stringify(p)).digest('hex'));});
test('Gzip tương thích Safari qua fflate, JSON và CSV UTF-8',()=>{const p=fixture(),bytes=zlib.gzipSync(Buffer.from(JSON.stringify(p)));assert.deepEqual(P.decode(bytes,'market.json.gz',codec).payload,p);assert.equal(P.decode(Buffer.from('\uFEFFticker,date\nAAA,2026-11-13'),'gia.csv',codec).text,'ticker,date\nAAA,2026-11-13');});
for(const [name,change,pattern] of [
 ['demo',p=>p.meta.isDemo=true,/snapshot thật/],
 ['số dòng sai',p=>p.meta.rowCount--,/Số dòng/],
 ['OHLCV sai',p=>p.symbols[1].rows[0][2]=0,/OHLCV/],
 ['ngày trùng',p=>p.symbols[1].rows[1]=p.symbols[1].rows[0],/Trùng/],
 ['benchmark thiếu',p=>p.symbols[0].ticker='VN30',/VNINDEX/],
 ['phiên benchmark khác',p=>p.symbols[0].rows.at(-1)[0]='2026-11-12',/Trùng|VNINDEX/],
 ['phiên tương lai',p=>p.symbols[0].rows.at(-1)[0]='2026-11-16',/tương lai/],
 ['metadata lệch phiên',p=>p.meta.asOf='2026-11-12',/metadata/]
])test('Từ chối '+name+' trước khi thay dataset',async()=>{const p=fixture();change(p);await assert.rejects(P.prepare(p,options),pattern);});
test('Tệp nén/JSON hỏng bị từ chối',()=>{assert.throws(()=>P.decode(Buffer.from('không phải JSON'),'x.json',codec));assert.throws(()=>P.decode(Buffer.from([31,139,0,1]),'x.gz',codec));});
test('Thiếu IndexedDB báo lỗi rõ để vẫn có thể dùng tệp trong phiên',async()=>{await assert.rejects(P.store(null).get(),/không cho lưu/);});
test('Artifact Pages không có dữ liệu giá và không chạy nguồn tự động',()=>{const cp=require('node:child_process');const result=JSON.parse(cp.execFileSync(process.execPath,['tools/check-personal-pages.cjs'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}));assert.equal(result.publicSnapshot,false);assert.equal(result.backtestAssetsPublic,false);const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/tracker-eod.yml'),'utf8');assert.ok(!workflow.includes('schedule:'));assert.ok(!workflow.includes('tracker_data_exporter.py'));});
