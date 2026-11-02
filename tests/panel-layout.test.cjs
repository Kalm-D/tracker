'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitRect,splitLayout,readPreferences}=require('../public/ai/panel-layout.js');
test('Khung đã lưu luôn nằm trong màn hình sau khi đổi kích thước cửa sổ',()=>{
 for(const viewport of [{width:1920,height:1080},{width:1024,height:600},{width:700,height:400},{width:320,height:480},{width:390,height:250}]){
  const r=fitRect({width:1800,height:1000,left:1700,top:900},viewport);
  assert.ok(r.width>0&&r.height>0&&r.left>=0&&r.top>=0);
  assert.ok(r.left+r.width<=viewport.width&&r.top+r.height<=viewport.height);
 }
});
test('Điện thoại dùng toàn màn hình, không giữ tọa độ desktop ngoài vùng nhìn',()=>{
 assert.deepEqual(fitRect({width:560,height:820,left:1300,top:30},{width:390,height:650}),{width:390,height:650,left:0,top:0});
});
test('Mở rộng cho báo cáo toàn bộ chiều cao và ô nhập thành cột cạnh bên',()=>{
 const split=splitLayout(1800,700,{});assert.equal(split.wide,true);assert.equal(split.input,350);assert.ok(split.report>1400);
});
test('Khung hẹp ưu tiên báo cáo và vẫn chừa vùng nhập có thể cuộn',()=>{
 const split=splitLayout(560,650,{});assert.equal(split.wide,false);assert.ok(split.report>400);assert.ok(split.input>=130);
 for(const height of [80,200,380])for(const stackShare of [.2,.85]){
  const s=splitLayout(390,height,{stackShare});assert.ok(s.report>=0&&s.input>=0);assert.ok(s.report+s.input<=height);
 }
});
test('Kéo đường chia không thể làm một cột biến mất',()=>{
 for(const sideWidth of [-10000,10000]){
  const s=splitLayout(1100,700,{sideWidth});assert.ok(s.report>=360);assert.ok(s.input>=260);
 }
});
test('Tùy chọn bố cục hỏng được phục hồi và không chấp nhận dữ liệu câu hỏi',()=>{
 for(const raw of [null,'broken','[]','{"rect":{"width":"999px","height":null},"full":"true","question":"private","stackShare":99}']){
  const p=readPreferences(raw);assert.ok(Number.isFinite(p.rect.width));assert.ok(Number.isFinite(p.rect.height));assert.ok(p.stackShare>=.2&&p.stackShare<=.85);assert.equal(Object.hasOwn(p,'question'),false);assert.equal(p.full,false);
 }
 const p=readPreferences('{"rect":{"width":820,"height":650},"sideWidth":420,"collapsed":true,"full":true}');assert.equal(p.rect.width,820);assert.equal(p.collapsed,true);assert.equal(p.full,true);
});
