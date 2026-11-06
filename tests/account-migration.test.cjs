'use strict';
// PostgreSQL WASM độc lập; không kết nối hoặc sửa Supabase production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {PGlite}=require(process.env.PGLITE_TEST_MODULE||'@electric-sql/pglite');
test('Migration tài khoản giữ dữ liệu cũ, RLS và RPC chỉ dành cho service_role',{timeout:60000},async()=>{
 const db=new PGlite(),root=path.join(__dirname,'..'),owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const rpc=(actor,action,changes={})=>db.query('select public.tracker_ai_state($1::uuid,$2,$3::jsonb) as result',[actor,action,JSON.stringify(changes)]);
 try{
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(cp.execFileSync('git',['show','e3a7e079a5c27a9762db0414d66a6bcee0ada4a1:deploy/supabase/001_tracker_ai_state.sql'],{cwd:root,encoding:'utf8'}));
  await rpc(owner,'acquire');const key='jobs/'+owner+'.json';await rpc(owner,'write',{[key]:{id:owner,marker:'EXPLICIT FIXTURE'}});
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261102075614_tracker_account_state.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const rows=(await db.query("select relrowsecurity from pg_class where oid in ('public.tracker_ai_cloud_lease'::regclass,'public.tracker_ai_cloud_documents'::regclass)")).rows;assert.equal(rows.length,2);assert.ok(rows.every(x=>x.relrowsecurity));
  assert.equal((await db.query("select count(*)::int as n from pg_policies where tablename like 'tracker_ai_cloud_%'")).rows[0].n,0);
  for(const role of ['anon','authenticated','service_role']){
   const privileges=(await db.query("select has_table_privilege($1,'public.tracker_ai_cloud_documents','select,insert,update,delete') as direct,has_function_privilege($1,'public.tracker_ai_state(uuid,text,jsonb)','execute') as rpc",[role])).rows[0];assert.equal(privileges.direct,false);assert.equal(privileges.rpc,role==='service_role');
  }
  await db.exec('set role anon');await assert.rejects(rpc(owner,'acquire'),/permission denied/);await assert.rejects(db.query('select * from public.tracker_ai_cloud_documents'),/permission denied/);await db.exec('reset role; set role service_role');
  await rpc(owner,'write',{'accounts/users.json':{version:1,users:[]}});await assert.rejects(rpc(other,'acquire'),/writer_busy/);await assert.rejects(rpc(other,'write',{}),/writer_expired/);await assert.rejects(rpc(owner,'write',{'../escape':{}}),/invalid_file/);
  const files=(await rpc(owner,'acquire')).rows[0].result.files;assert.equal(files[key].marker,'EXPLICIT FIXTURE');assert.deepEqual(files['accounts/users.json'],{version:1,users:[]});
  await rpc(owner,'release');
 }finally{await db.close();}
});
