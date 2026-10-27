'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {configuration,prepare}=require('../server/ai/production.cjs'),{createApp,passwordHash}=require('../server/ai/server.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tracker-cloud-test-'));
function env(dir){return {TRACKER_AI_ENABLED:'true',TRACKER_AI_HOST:'127.0.0.1',TRACKER_AI_ALLOWED_ORIGIN:'https://tracker-fixture.com',TRACKER_AI_COOKIE_SECURE:'true',TRACKER_AI_PASSWORD_HASH:passwordHash('explicit-test-owner-password'),TRACKER_AI_JOBS_DIR:path.join(dir,'state'),TRACKER_AI_DATA_FILE:path.join(__dirname,'../public/data/market.json.gz'),STRICT_FREE_MODE:'true',ALLOW_PAID_API:'false',ALLOW_AUTOTRADING:'false'};}
test('Cloud startup rejects insecure origins, missing owner, ephemeral defaults and invalid ports',()=>{
 const dir=temp();try{const valid=env(dir);assert.equal(configuration(valid).port,8790);assert.equal(configuration({...valid,PORT:'8080'}).port,8080);
 for(const patch of [{TRACKER_AI_ALLOWED_ORIGIN:'http://tracker-fixture.com'},{TRACKER_AI_ALLOWED_ORIGIN:'https://tracker-fixture.com/path'},{TRACKER_AI_ALLOWED_ORIGIN:'https://tracker-ai.example.com',TRACKER_AI_COOKIE_SECURE:'false'},{TRACKER_AI_ALLOWED_ORIGIN:'https://host.example'},{TRACKER_AI_PASSWORD_HASH:''},{TRACKER_AI_JOBS_DIR:''},{TRACKER_AI_JOBS_DIR:'relative'},{TRACKER_AI_PORT:'NaN'},{PORT:'80'},{STRICT_FREE_MODE:'false'}])assert.throws(()=>configuration({...valid,...patch}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Production boot computes the real snapshot and serves minimal health plus authenticated HTTPS-origin API',{timeout:60000},async()=>{
 const dir=temp();let instance;try{
 instance=await prepare(env(dir));await new Promise(r=>instance.app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+instance.app.address().port;
 const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});assert.equal(health.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/healthz',{method:'POST'})).status,405);assert.equal((await fetch(base+'/api/ai/session')).status,401);
 const login=await fetch(base+'/api/ai/login',{method:'POST',headers:{Origin:'https://tracker-fixture.com'},body:JSON.stringify({password:'explicit-test-owner-password'})});
 assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=None; Secure/);
 assert.equal((await fetch(base+'/api/ai/session',{headers:{Origin:'https://wrong-fixture.com'}})).status,403);
 const config=await (await fetch(base+'/ai/config.js')).text();assert.match(config,/"enabled":true/);assert.equal(instance.gateway.status().usage.attempts,0);
 instance.research.shutdown();assert.equal((await fetch(base+'/healthz')).status,503);
 }finally{if(instance)await new Promise(r=>instance.app.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('Boot refuses demo before opening a listener; corrupt ledger preserves evidence and releases runtime lock',async()=>{
 const dir=temp();try{
 await assert.rejects(prepare({...env(dir),TRACKER_AI_DATA_FILE:path.join(__dirname,'../public/data/market.json')}));assert.equal(fs.existsSync(path.join(dir,'state','.runtime.lock')),false);
 const state=path.join(dir,'state');fs.mkdirSync(path.join(state,'gateway'),{recursive:true});fs.writeFileSync(path.join(state,'gateway','usage.json'),'{broken');
 await assert.rejects(prepare(env(dir),async()=>({label:'EXPLICIT STARTUP FIXTURE'})),/Bộ lưu/);
 assert.equal(fs.existsSync(path.join(state,'.runtime.lock')),false);assert.equal(fs.readFileSync(path.join(state,'gateway','usage.json'),'utf8'),'{broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
