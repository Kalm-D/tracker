'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkedAnalysis}=require('../server/ai/analysis-audit.cjs'),C=require('../server/ai/contracts.cjs');
const evidence=[{id:'t',type:'deterministic_calculation',close:66000},{id:'f',type:'financial_statement',data:{profit:100}},{id:'d',type:'official_document',text:'Số tham khảo 100'}];
const risk={section:'risk',kind:'interpretation',text:'Nếu xu hướng suy yếu cần kiểm tra lại.',evidenceIds:['t']};
const valid={section:'technical',kind:'source',text:'Giá trong snapshot là 66000.',evidenceIds:['t']};
const result=claims=>({summary:'Cần theo dõi bằng chứng.',claims,limitations:[]});
test('Một số sai không xóa luận điểm đúng; đầu ra cuối vẫn qua hợp đồng cũ',()=>{
 const value=result([valid,{...valid,text:'Giá là 987654321.'},risk]),checked=checkedAnalysis(value,evidence,{analyst:true});
 assert.equal(checked.audit.status,'filtered');assert.equal(checked.audit.discardedClaims,1);assert.deepEqual(checked.result.claims,[valid,risk]);assert.ok(!JSON.stringify(checked.result).includes('987654321'));C.validateAnalyst(checked.result,evidence);assert.equal(value.claims.length,3);
});
test('Tóm tắt sai dùng nguyên luận điểm hợp lệ; không sửa hoặc tự tạo số',()=>{
 const value={...result([valid,risk]),summary:'Chắc chắn tăng 987654321.',limitations:['Còn thiếu tài liệu.','Có 987654321 năm dữ liệu.']};const checked=checkedAnalysis(value,evidence,{analyst:true});assert.equal(checked.result.summary,valid.text);assert.equal(checked.audit.summaryReplaced,true);assert.equal(checked.audit.discardedLimitations,1);C.validateAnalyst(checked.result,evidence);
});
test('Loại riêng nguồn giả, số BCTC từ HTML và hạng đầu tư tự gán',()=>{
 const checked=checkedAnalysis(result([{...valid,evidenceIds:['fake']},{section:'fundamental',kind:'source',text:'Lợi nhuận 100.',evidenceIds:['d']},{...valid,text:'Đạt hạng A.'},{section:'fundamental',kind:'source',text:'Lợi nhuận theo nguồn 100.',evidenceIds:['f']},risk]),evidence,{analyst:true});assert.equal(checked.audit.discardedClaims,3);assert.equal(checked.result.claims.length,2);C.validateAnalyst(checked.result,evidence);
});
test('Không có luận điểm hợp lệ hoặc thiếu rủi ro vẫn chặn, không bịa thay thế',()=>{
 assert.throws(()=>checkedAnalysis(result([{...valid,text:'Giá là 987654321.'}]),evidence,{analyst:true}));assert.throws(()=>checkedAnalysis(result([valid]),evidence,{analyst:true}));assert.throws(()=>checkedAnalysis({summary:'Sai schema',claims:'x',limitations:[]},evidence,{analyst:true}));
});
test('Báo cáo hợp lệ giữ nguyên nội dung và không thêm cảnh báo lọc',()=>{
 const value=result([valid,risk]),checked=checkedAnalysis(value,evidence,{analyst:true});assert.equal(checked.result,value);assert.equal(checked.audit.status,'passed');
});

test('Quick thiếu rủi ro giữ phần AI hợp lệ và sao nguyên văn rủi ro từ engine với nhãn riêng',()=>{
 const context={id:'ctx',type:'analyst_context',verification:'deterministic_existing_engine_context',data:{scores:[],market:{desc:'Thị trường đi ngang; breakout dễ nhiễu.',limitation:'Chưa có thống kê xác suất thành công.'}}};const checked=checkedAnalysis(result([valid]),[...evidence,context],{analyst:true});assert.equal(checked.audit.riskFromCode,true);assert.equal(checked.audit.discardedClaims,0);assert.equal(checked.result.claims.at(-1).text,context.data.market.desc+' '+context.data.market.limitation);assert.equal(checked.result.claims.at(-1).kind,'source');C.validateAnalyst(checked.result,[...evidence,context]);assert.throws(()=>checkedAnalysis(result([{...valid,text:'Giá 987654321.'}]),[...evidence,context],{analyst:true}));
});
test('Rủi ro sai bị loại; ngữ cảnh không xác nhận nguồn engine không được dùng thay thế',()=>{
 const context={id:'ctx',type:'analyst_context',verification:'deterministic_existing_engine_context',data:{scores:[],market:{desc:'Đi ngang.',limitation:'Cần đối chiếu thêm.'}}};const checked=checkedAnalysis(result([valid,{...risk,text:'Chắc chắn giảm 987654321.'}]),[...evidence,context],{analyst:true});assert.equal(checked.audit.discardedClaims,1);assert.equal(checked.audit.riskFromCode,true);assert.ok(!JSON.stringify(checked.result).includes('987654321'));assert.throws(()=>checkedAnalysis(result([valid]),[...evidence,{...context,verification:'untrusted'}],{analyst:true}));
});
