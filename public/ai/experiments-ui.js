(function(){
'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const fmt=n=>typeof n==='number'?n.toLocaleString('vi-VN',{maximumFractionDigits:2}):'Chưa có';
const pct=n=>typeof n==='number'?fmt(100*n)+'%':'Chưa có';
const labels={market:'Theo thị trường',personal:'Bộ lọc cá nhân mặc định',both:'So sánh cả hai'};
function detail(label,value){const d=el('details');d.append(el('summary',label),el('pre',JSON.stringify(value,null,2)));return d;}
function table(headers,rows){const wrap=el('div',undefined,'tai-scroll'),t=el('table'),h=el('tr');for(const v of headers)h.append(el('th',v));const head=el('thead');head.append(h);t.append(head);const b=el('tbody');for(const row of rows){const tr=el('tr');for(const v of row)tr.append(el('td',v));b.append(tr);}t.append(b);wrap.append(t);return wrap;}
function controls(){
 const root=el('details'),fields={};let saved={};const restoredDetail=el('details');restoredDetail.hidden=true;root.append(el('summary','Backtest · kiểm định lịch sử'));
 function input(key,label,type,value){const n=el(type==='select'?'select':'input');if(type!=='select')n.type=type;n.setAttribute('aria-label',label);if(value!==undefined)n.value=value;const l=el('label',label);if(type==='checkbox')l.className='tai-ack';l.append(n);root.append(l);fields[key]=n;return n;}
 input('enabled','Bật Backtest cho tác vụ này','checkbox');
 root.append(el('p','Chạy riêng với Strategy. Chọn 1–5 mã. Toàn bộ thị trường vẫn được dùng để tính RS/breadth. Tối đa 60 phiên, cần 252 phiên làm nóng trước kỳ thử.','tai-muted'));
 input('start','Từ ngày','date');input('end','Đến ngày','date');input('outOfSampleStart','Mốc ngoài mẫu (tùy chọn)','date');
 input('capital','Vốn mô phỏng (đồng)','number');const method=input('method','Bộ lọc kỹ thuật','select');for(const [v,label] of Object.entries(labels)){const o=el('option',label);o.value=v;method.append(o);}method.value='both';
 for(const [k,label,value] of [['fee','Phí mỗi chiều (%)',0.15],['tax','Thuế bán giả định (%)',0.1],['slippage','Trượt giá mỗi chiều (%)',0.1]]){const n=input(k,label,'number',value);n.min='0';n.max='9.99';n.step='0.01';}
 root.append(el('p','Mặc định khi tạo mới (khi thử lại giữ cấu hình được khôi phục): 5 vị thế, tối đa 20% mỗi mã, phân bổ đều, mua khi chạm pivot, mục tiêu 2R, tham gia 1%, lô 100, T+3 bảo thủ, không thanh lý bắt buộc cuối kỳ. Bộ lọc cá nhân dùng mặc định engine. Chi tiết được lưu trong kết quả.','tai-muted'));
 input('acknowledge','Tôi hiểu đây là mô phỏng có thiên lệch sống sót, chưa xác nhận điều chỉnh giá/cổ tức; không phải dự báo hay lệnh giao dịch.','checkbox');
 root.append(restoredDetail);
 return {root,read(){if(!fields.enabled.checked)return undefined;const out={...saved,start:fields.start.value,end:fields.end.value,capital:Number(fields.capital.value),method:fields.method.value,acknowledge:fields.acknowledge.checked};delete out.outOfSampleStart;if(fields.outOfSampleStart.value)out.outOfSampleStart=fields.outOfSampleStart.value;for(const k of ['fee','tax','slippage'])out[k]=Number(fields[k].value)/100;return out;},restore(c){saved=c?structuredClone(c):{};restoredDetail.replaceChildren(el('summary','Cấu hình được khôi phục'),el('pre',JSON.stringify(saved,null,2)));restoredDetail.hidden=!c;fields.enabled.checked=!!c;root.open=!!c;if(!c)return;for(const k of ['start','end','outOfSampleStart','capital','method'])fields[k].value=c[k]??'';for(const k of ['fee','tax','slippage'])fields[k].value=100*c[k];fields.acknowledge.checked=c.acknowledge===true;}};
}
function render(body,report){
 const r=report.backtest;if(!r){if(report.backtestProgress)body.append(el('p','Backtest: '+report.backtestProgress.phase+' · '+report.backtestProgress.done+'/'+report.backtestProgress.total,'tai-muted'));return;}
 const card=el('article',undefined,'tai-card');card.append(el('h3','Backtest · mô phỏng lịch sử'),el('p',r.start+' → '+r.end+' · engine '+r.engineVersion));
 for(const result of r.results){const s=result.summary;card.append(el('h4',labels[result.method]||result.method),table(['Chỉ số','Kết quả'],[['Lợi nhuận sau chi phí',pct(s.return)],['Sụt giảm vốn lớn nhất',pct(s.maxDrawdown)],['Số giao dịch / đã đóng',s.trades+' / '+s.closed],['Tỷ lệ thắng (lệnh đã đóng)',pct(s.winRate)],['Giá trị cuối kỳ (đ)',fmt(s.finalEquity)],['Lãi/lỗ đã thực hiện (đ)',fmt(s.realized)],['Lãi/lỗ chưa thực hiện (đ)',fmt(s.unrealized)],['Tổng chi phí (đ)',fmt(s.costs)]]));
  if(!s.trades)card.append(el('p','Không có giao dịch trong kỳ; lợi nhuận 0% không chứng minh chiến lược hiệu quả.','tai-warning'));
  if(result.periods)card.append(table(['Phân đoạn','Số phiên','Lợi nhuận','Sụt giảm'],result.periods.map(p=>[p.name==='in_sample'?'Trong mẫu':'Ngoài mẫu theo mốc chọn',p.sessions,pct(p.return),pct(p.maxDrawdown)])));
  card.append(detail('Đường vốn và giao dịch · '+(labels[result.method]||result.method),{curve:result.curve,trades:result.trades,signalStatusCounts:result.signalStatusCounts}));
 }
 card.append(table(['Chỉ số so sánh','Lợi nhuận giá','Sụt giảm'],r.benchmarks.map(b=>[b.ticker,b.available?pct(b.return):b.reason,b.available?pct(b.maxDrawdown):'Thiếu'])));
 for(const line of r.limitations)card.append(el('p',line.replace('survivorship bias','thiên lệch sống sót (thiếu mã đã rời thị trường)'),'tai-muted'));
 card.append(detail('Nguồn, cấu hình và hash tái lập',{snapshotHash:r.snapshotHash,configurationHash:r.configurationHash,source:r.source,audit:r.audit,config:r.config,settings:r.settings,calculationVersion:r.calculationVersion,ruleVersion:r.ruleVersion}));
 const download=el('button','Tải kết quả JSON');download.type='button';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='tracker-backtest-'+r.end+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};card.append(download);body.append(card);
}
const states={waiting_for_check:'Chờ kiểm tra',unchanged:'Snapshot chưa đổi',updated:'Đã so sánh snapshot mới',revised_snapshot:'Nguồn chỉnh sửa cùng ngày',older_snapshot:'Từ chối snapshot cũ hơn',source_error:'Lỗi nguồn'};
async function monitors(body,api,status){
 const data=await api('monitors');status.textContent='Theo dõi snapshot · cảnh báo trong ứng dụng';body.replaceChildren();const wrap=el('section');wrap.append(el('h3','Theo dõi báo cáo'),el('p',data.limitation,'tai-warning'));
 function button(label,fn){const b=el('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();await monitors(body,api,status);}catch(e){status.textContent=e.message;b.disabled=false;}};return b;}
 wrap.append(button('Kiểm tra snapshot bây giờ',()=>api('monitors/check',{method:'POST'})));
 if(!data.records.length)wrap.append(el('p','Mở một báo cáo đã kết thúc rồi chọn “Theo dõi báo cáo”.'));
 for(const r of data.records){const card=el('article',undefined,'tai-card');card.append(el('h4',r.tickers.join(', ')+' · '+(r.enabled?'Đang bật':'Tạm dừng')),el('p',(states[r.status]||r.status)+' · dữ liệu '+r.checkpoint.date),el('p','Kiểm tra gần nhất: '+(r.lastCheckedAt?new Date(r.lastCheckedAt).toLocaleString('vi-VN'):'chưa kiểm tra'),'tai-muted'));
  if(r.freshness)card.append(el('p',r.freshness.message,'tai-warning'));if(r.error)card.append(el('p',r.error,'tai-warning'));
  card.append(detail('Mốc cơ sở và điều kiện cố định',{date:r.baseline.date,hash:r.baseline.hash,levels:r.levels}));
  if(!r.events.length)card.append(el('p','Chưa ghi nhận thay đổi thỏa điều kiện giữa các snapshot đã quan sát.'));
  for(const e of [...r.events].reverse().slice(0,30))card.append(el('p',e.dataDate+' · '+e.ticker+' · '+e.message+(e.level?' · mốc '+fmt(e.level)+' đ':'')+' · close '+fmt(e.close)+' đ'));
  if(r.events.length>30||r.droppedEvents)card.append(el('p','Hiện 30 sự kiện gần nhất; giữ tối đa 200. Đã loại khỏi bộ lưu: '+r.droppedEvents,'tai-muted'));
  card.append(button(r.enabled?'Tạm dừng':'Tiếp tục',()=>api('monitors/'+r.id,{method:'POST',body:JSON.stringify({enabled:!r.enabled})})),button('Xóa bộ theo dõi',()=>api('monitors/'+r.id,{method:'DELETE'})));wrap.append(card);
 }
 body.append(wrap);
}
window.TrackerAIExperimentsUI={controls,render,monitors};
})();
