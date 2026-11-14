'use strict';
// This creates only a local owner password hash. API keys are configured separately.
const fs=require('node:fs'),path=require('node:path'),{passwordHash}=require('../server/ai/server.cjs');
if(!process.stdin.isTTY)throw new Error('Chạy lệnh này trong terminal tương tác để nhập mật khẩu ẩn.');
const file=path.join(__dirname,'../.env.ai');if(fs.existsSync(file))throw new Error('.env.ai đã tồn tại. Sao lưu/cập nhật có chủ ý; không tự ghi đè.');
process.stdout.write('Đặt mật khẩu backend AI (ít nhất 12 ký tự, không hiển thị): ');
let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
process.stdin.on('data',data=>{
 for(const c of data){if(c==='\u0003'){process.stdin.setRawMode(false);process.exit(1);}if(c==='\r'||c==='\n'){
  process.stdin.setRawMode(false);process.stdin.pause();
  if(value.length<12){console.error('\nMật khẩu quá ngắn. Chưa tạo cấu hình.');process.exit(1);}
  fs.writeFileSync(file,'TRACKER_AI_ENABLED=true\nTRACKER_AI_PASSWORD_HASH='+passwordHash(value)+'\nSTRICT_FREE_MODE=true\nALLOW_PAID_API=false\nALLOW_AUTOTRADING=false\n',{mode:0o600,flag:'wx'});value='';console.log('\nĐã lưu hash. Chạy: node --env-file=.env.ai server/ai/server.cjs');process.exit(0);
 }if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' '&&value.length<256)value+=c;}
});
