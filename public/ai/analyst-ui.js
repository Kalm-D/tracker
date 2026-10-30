(function(){
'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const fmt=n=>Number.isFinite(n)?n.toLocaleString('vi-VN',{maximumFractionDigits:2}):'Chưa có chỉ báo';
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
function generationIssue(report){
 const issue=report.issues?.find(x=>x.stage==='analyst'||/^AI_/.test(x.code||''));
 const message=issue?.message||(report.warnings||[]).find(x=>/chưa được gọi|chưa gọi AI|ngân sách|Provider .*chưa|Nhà cung cấp AI|phản hồi AI/i.test(x));
 return message||'Chưa có phần diễn giải AI cho mục này. Dữ liệu nguồn bên dưới vẫn xem được.';
}
function financialTables(card,evidence){
 const records=evidence.filter(e=>e.type==='financial_statement');
 for(const e of records){
  card.append(el('p',e.ticker+' · '+e.data?.source+' · '+(e.data?.unit||'Đơn vị theo nguồn.')));
  for(const [name,rows]of Object.entries(e.data?.tables||{})){
   if(!rows?.length)continue;
   const d=el('details'),title={income_statement:'Kết quả kinh doanh',balance_sheet:'Bảng cân đối',cash_flow:'Lưu chuyển tiền',ratio:'Chỉ số tài chính'}[name]||name;
   d.append(el('summary',title+' · '+rows.length+' dòng dữ liệu nguồn'));
   const wrap=el('div',undefined,'tai-scroll'),t=el('table');
   const first=rows[0],long=Object.hasOwn(first,'value');
   if(Object.hasOwn(first,'item')){const periods=Object.keys(first).filter(k=>/^\d{4}-Q[1-4]$/.test(k));const head=el('tr');for(const title of ['Chỉ tiêu',...periods])head.append(el('th',title));t.append(head);for(const r of rows.slice(0,30)){const tr=el('tr');tr.append(el('th',r.item));for(const period of periods)tr.append(el('td',typeof r[period]==='number'?fmt(r[period]):String(r[period]??'—')));t.append(tr);}}
   else if(long){for(const r of rows.slice(0,30)){const tr=el('tr');tr.append(el('th',String(r.period)+' · '+(r.name||r.id)),el('td',fmt(r.value)+' '+(r.unit||'')));t.append(tr);}}
   else {for(const [k,v]of Object.entries(first).filter(([,v])=>v!==null&&v!==undefined).slice(0,30)){const tr=el('tr');tr.append(el('th',k),el('td',typeof v==='number'?fmt(v):String(v)));t.append(tr);}}
   wrap.append(t);d.append(wrap);card.append(d);
  }
  for(const text of Object.values(e.data?.tableErrors||{}))card.append(el('p',text,'tai-muted'));
  references(card,[e.id],evidence);
 }
 return records.length;
}
function render(body,report){
 const a=report.analyses?.find(a=>a.role==='analyst'),evidence=report.evidence||[];
 if(!report.composite&&!a)return;
 const conclusion=section('1. Kết luận ngắn');
 conclusion.append(el('p',a?.result.summary||generationIssue(report)),el('small',a?a.provider+' / '+a.model+(a.cached?' · kết quả lưu tạm':''):'AI chưa tạo được báo cáo · dữ liệu đã lấy vẫn được giữ'));
 body.append(conclusion);
 const scores=section('2. Điểm kỹ thuật'),wrap=el('div',undefined,'tai-scroll'),table=el('table'),head=el('thead'),tr=el('tr');
 for(const name of ['Mã','Điểm kỹ thuật','Nhóm kỹ thuật'])tr.append(el('th',name));head.append(tr);table.append(head);const rows=el('tbody');
 for(const s of report.composite||[]){const row=el('tr');for(const value of [s.ticker,fmt(s.components.technical),s.technicalGrade||'Chưa phân nhóm'])row.append(el('td',value));rows.append(row);}
 table.append(rows);wrap.append(table);scores.append(wrap,el('p','Đây là điểm kỹ thuật của Tracker. Chưa có điểm tổng đầu tư được xác thực; dữ liệu BCTC và tin được trình bày riêng bên dưới.','tai-muted'));body.append(scores);
 const groups=[['3. Kỹ thuật, thanh khoản và thị trường',['technical','market']],['4. Cơ bản',['fundamental']],['5. Tin doanh nghiệp và vĩ mô ngành',['news']],['6. Rủi ro và kịch bản xấu',['risk']]];
 for(const [title,sections]of groups){
  const card=section(title),claims=(a?.result.claims||[]).filter(c=>sections.includes(c.section));
  if(!claims.length){
   if(sections.includes('fundamental')){
    if(!evidence.some(e=>e.type==='financial_statement'))card.append(el('p',report.issues?.find(x=>x.stage==='fundamental')?.message||'Chưa đọc được BCTC từ nguồn tài chính. Phần kỹ thuật và các tin đã lấy không bị mất.'));
    else card.append(el('p','Đã lấy được số liệu tài chính. '+generationIssue(report)));
   }else if(sections.includes('news')){
    const count=evidence.filter(e=>e.type==='news_discovery').reduce((n,e)=>n+(e.items?.length||0),0);
    card.append(el('p',count?'Đã lấy '+count+' tiêu đề tin. '+generationIssue(report):'Nguồn tin chưa trả tiêu đề phù hợp; không tự bịa sự kiện.'));
   }else card.append(el('p',generationIssue(report)));
  }
  if(sections.includes('fundamental'))financialTables(card,evidence);
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

