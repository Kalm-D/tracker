(function(){
'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const fmt=n=>Number.isFinite(n)?n.toLocaleString('vi-VN',{maximumFractionDigits:2}):'Chưa đủ dữ liệu';
function link(url,label){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;const a=el('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}
}
function section(title){const card=el('section',undefined,'tai-card tai-analyst-section');card.append(el('h3',title));return card;}
function references(card,ids,evidence){
 for(const id of ids||[]){
  const e=evidence.find(x=>x.id===id);if(!e)continue;
  const a=link(e.url,id+(e.dataDate?' · dữ liệu '+e.dataDate:e.publishedAt?' · '+e.publishedAt:' · ngày công bố chưa xác minh'));
  if(a){const p=el('p',undefined,'tai-muted');p.append(a);card.append(p);}
 }
}
function render(body,report){
 const a=report.analyses?.find(a=>a.role==='analyst'),evidence=report.evidence||[];
 if(!report.composite&&!a)return;
 const conclusion=section('1. Kết luận ngắn');
 conclusion.append(el('p',a?.result.summary||'Chưa có nhận định AI đã qua kiểm tra. Dữ liệu công cụ đã thu thập vẫn được giữ.'),el('small',a?a.provider+' / '+a.model+(a.cached?' · kết quả lưu tạm':''):'Kết quả công cụ'));
 body.append(conclusion);
 const scores=section('2. Bảng điểm do code tính'),wrap=el('div',undefined,'tai-scroll'),table=el('table'),head=el('thead'),tr=el('tr');
 for(const name of ['Mã','Kỹ thuật','Cơ bản','Tin tức','Ngành','Tổng','Hạng'])tr.append(el('th',name));head.append(tr);table.append(head);const rows=el('tbody');
 for(const s of report.composite||[]){const row=el('tr');for(const value of [s.ticker,...['technical','fundamental','news','sector'].map(k=>fmt(s.components[k])),fmt(s.total),s.grade||'Chưa xếp hạng'])row.append(el('td',value));rows.append(row);}
 table.append(rows);wrap.append(table);scores.append(wrap,el('p','Thiếu thành phần có trọng số thì chưa gán điểm tổng/hạng. Điểm kỹ thuật giữ nguyên bộ lọc Tracker; điểm không phải xác suất tăng giá.','tai-muted'));body.append(scores);
 const groups=[['3. Kỹ thuật, thanh khoản và thị trường',['technical','market']],['4. Cơ bản',['fundamental']],['5. Tin doanh nghiệp và vĩ mô ngành',['news']],['6. Rủi ro và kịch bản xấu',['risk']]];
 for(const [title,sections]of groups){
  const card=section(title),claims=(a?.result.claims||[]).filter(c=>sections.includes(c.section));
  if(!claims.length)card.append(el('p','Chưa đủ dữ liệu hoặc chưa có nhận định đã qua kiểm tra.'));
  for(const c of claims){card.append(el('p',c.text));references(card,c.evidenceIds,evidence);}
  if(sections.includes('market')&&report.marketContext){const m=report.marketContext;card.append(el('p','Môi trường: '+(m.label||m.key||'chưa biết')+'. '+(m.desc||'')),el('p',m.limitation,'tai-warning'));}
  if(sections.includes('news')){
   for(const e of evidence.filter(e=>e.type==='news_discovery')){
    card.append(el('h4',e.scope==='sector'?'Tin ngành: '+e.sector:'Tin cổ phiếu'));
    if(!e.items?.length)card.append(el('p','Chưa tìm thấy tiêu đề phù hợp.'));
    for(const item of e.items||[]){
     const row=el('p'),l=link(item.url,item.title);
     if(l)row.append(l);else row.append(el('span',item.title));
     row.append(el('small',' · '+(item.publishedAtISO?.slice(0,10)||item.publishedAt||'Chưa rõ ngày')+' · '+(item.publisher||'Chưa rõ nhà xuất bản')+(item.stale===true?' · TIN CŨ':item.stale===null?' · Chưa xác minh ngày':'')));
     card.append(row);if(item.excerpt)card.append(el('p',item.excerpt,'tai-muted'));
    }
    card.append(el('p',e.limitation,'tai-muted'));
   }
  }
  body.append(card);
 }
 const missing=section('7. Dữ liệu thiếu và độ tin cậy');
 for(const text of [...new Set([...(a?.result.limitations||[]),...(report.warnings||[]),...(report.coverage?.missing||[])])])missing.append(el('p',text,'tai-warning'));
 missing.append(el('p',report.coverage?.limitation||'Độ tin cậy phụ thuộc độ đầy đủ, ngày và chất lượng nguồn; chưa phải xác suất thắng.'));body.append(missing);
 const sources=section('8. Nguồn');
 for(const e of evidence){references(sources,[e.id],evidence);}
 sources.append(el('p','Thông tin hỗ trợ tham khảo, không phải tư vấn đầu tư.','tai-muted'));body.append(sources);
}
window.TrackerAIAnalystUI={render};
})();

