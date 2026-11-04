'use strict';
// Tài khoản do server quản lý; không có đăng ký công khai, không tin role từ client.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(password,salt,32).toString('hex');}
function verifyPassword(password,hash){if(typeof password!=='string'||password.length>256)return false;const [salt,digest]=String(hash||'').split(':');return /^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{64}$/.test(digest||'')&&equal(passwordHash(password,salt),hash);}
const capabilities=u=>u.role==='owner'?['research','backtest','users','operations']:u.role==='admin'?['research','backtest','users']:u.canResearch?['research']:[];
const publicUser=({id,username,role,canResearch,active,revision,createdAt})=>({id,username,role,canResearch,active,revision,createdAt});
class Accounts{
  constructor({dir,env,durability}){
    this.file=path.join(dir,'accounts/users.json');this.env=env;this.durability=durability;this.users=[];this.problem=null;
    this.dummy=passwordHash('nonexistent-account-'+crypto.randomUUID());
    if(fs.existsSync(this.file))try{const p=JSON.parse(fs.readFileSync(this.file,'utf8'));if(p.version!==1||!Array.isArray(p.users)||p.users.length>50)throw Error('schema');const names=new Set(),ids=new Set();for(const u of p.users){if(!/^[a-z0-9._-]{3,40}$/.test(u.username)||u.username==='owner'||!['admin','user'].includes(u.role)||typeof u.active!=='boolean'||typeof u.canResearch!=='boolean'||!Number.isInteger(u.revision)||u.revision<1||!/^[a-f0-9-]{36}$/.test(u.id)||!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(u.passwordHash)||names.has(u.username)||ids.has(u.id))throw Error('account');names.add(u.username);ids.add(u.id);}this.users=p.users;}catch{this.problem='Bộ lưu tài khoản không hợp lệ; giữ nguyên và chặn đăng nhập/ghi mới.';}
  }
  owner(){return {id:'owner',username:'owner',role:'owner',canResearch:true,active:true,revision:crypto.createHash('sha256').update(this.env.TRACKER_AI_PASSWORD_HASH||'').digest('hex')};}
  current(identity){if(this.problem)return null;const u=identity?.id==='owner'?this.owner():this.users.find(u=>u.id===identity?.id);return u?.active&&(u.role==='owner'||this.env.TRACKER_ACCOUNTS_ENABLED!=='false')&&u.revision===identity.revision?publicUser(u):null;}
  authenticate(input){if(this.problem)throw Error(this.problem);const username=String(input.username||'owner').trim().toLowerCase(),u=username==='owner'?{...this.owner(),passwordHash:this.env.TRACKER_AI_PASSWORD_HASH}:this.users.find(u=>u.username===username);if(!verifyPassword(input.password,u?.passwordHash||this.dummy)||!u?.active||(u.role!=='owner'&&this.env.TRACKER_ACCOUNTS_ENABLED==='false'))return null;return publicUser(u);}
  list(actor){if(!capabilities(actor).includes('users'))throw Error('Không có quyền quản lý tài khoản.');return [this.owner(),...this.users].filter(u=>actor.role==='owner'||u.role==='user').map(u=>{const {revision,...safe}=publicUser(u);return safe;});}
  save(){if(this.problem)throw Error(this.problem);try{fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const value={version:1,users:this.users},tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,this.file);this.durability?.put('accounts/users.json',value);}catch{this.problem='Không lưu được tài khoản; dừng thay đổi và kiểm tra bộ lưu.';throw Error(this.problem);}}
  create(actor,input){
    if(!['owner','admin'].includes(actor.role))throw Error('Không có quyền tạo tài khoản.');
    const username=String(input.username||'').trim().toLowerCase(),role=input.role||'user';
    if(!/^[a-z0-9._-]{3,40}$/.test(username)||username==='owner'||this.users.some(u=>u.username===username))throw Error('Tên tài khoản không hợp lệ hoặc đã có.');
    if(!['user','admin'].includes(role)||(role==='admin'&&actor.role!=='owner'))throw Error('Chỉ Owner được cấp Admin; không tạo Owner qua API.');
    if(typeof input.password!=='string'||input.password.length<12||input.password.length>256)throw Error('Mật khẩu tạm cần 12–256 ký tự.');
    if(input.canResearch!==undefined&&typeof input.canResearch!=='boolean')throw Error('Quyền nghiên cứu phải là boolean.');
    if(this.users.length>=50)throw Error('Tối đa 50 tài khoản; không tự xóa dữ liệu cũ.');
    const u={id:crypto.randomUUID(),username,role,passwordHash:passwordHash(input.password),canResearch:input.canResearch===true,active:true,revision:1,createdAt:new Date().toISOString()};this.users.push(u);this.save();return publicUser(u);
  }
  update(actor,id,input){
    const u=this.users.find(u=>u.id===id);if(id==='owner'||!u)throw Error('Owner được bảo vệ hoặc tài khoản không tồn tại.');
    if(actor.role!=='owner'&&(actor.role!=='admin'||u.role!=='user'))throw Error('Không có quyền thay tài khoản này.');
    if(Object.keys(input).some(k=>!['active','canResearch','role','password'].includes(k)))throw Error('Trường thay đổi tài khoản không hợp lệ.');
    if(input.role!==undefined&&(!['admin','user'].includes(input.role)||(input.role==='admin'&&actor.role!=='owner')))throw Error('Admin không được cấp Admin/Owner.');
    for(const k of ['active','canResearch'])if(input[k]!==undefined&&typeof input[k]!=='boolean')throw Error(k+' phải là boolean.');
    if(input.password!==undefined&&(typeof input.password!=='string'||input.password.length<12||input.password.length>256))throw Error('Mật khẩu cần 12–256 ký tự.');
    const patch={...input};if(patch.password!==undefined){patch.passwordHash=passwordHash(patch.password);delete patch.password;}Object.assign(u,patch,{revision:u.revision+1});this.save();return publicUser(u);
  }
}
function owned(resource,identity){return !!resource&&(resource.ownerId||'owner')===identity.id;}
module.exports={Accounts,passwordHash,verifyPassword,capabilities,owned};
