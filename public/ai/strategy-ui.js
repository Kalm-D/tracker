(function(){
'use strict';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const money=n=>Number.isFinite(n)?n.toLocaleString('vi-VN',{maximumFractionDigits:2}):'Chưa tính';
const pct=n=>Number.isFinite(n)?(n*100).toLocaleString('vi-VN',{maximumFractionDigits:2})+'%':'Chưa tính';
function controls(){
 const root=node('details','tai-strategy-tools');root.append(node('summary','','Chiến lược & quản trị rủi ro'));
 const fields={},wrap=node('div','tai-strategy-fields');
 const select=(key,label,options)=>{const s=node('select');s.setAttribute('aria-label',label);for(const [v,t] of options){const o=node('option','',t);o.value=v;s.append(o);}fields[key]=s;const l=node('label','',label);l.append(s);return l;};
 root.append(select('kind','Chiến lược',[['none','Chỉ nghiên cứu'],['swing','Swing / Breakout — theo xu hướng'],['value','Giá trị / Cổ tức'],['hybrid','Hybrid — kết hợp có điều kiện']]));
 const input=(key,label,value='',type='number')=>{const i=node('input');i.type=type;i.value=value;i.setAttribute('aria-label',label);if(type==='number'){i.min='0';i.step='any';}fields[key]=i;const l=node('label','',label);l.append(i);return l;};
 const row=(...children)=>{const r=node('div','tai-row');r.append(...children);return r;};
 wrap.append(row(input('capital','Vốn danh mục (đồng)'),input('riskPct','Rủi ro mỗi phương án (%)','1')),
 row(input('maxWeight','Tỷ trọng tối đa (%)','20'),input('target','Mục tiêu tự giả định (đ/cp)')),
 row(input('entry','Giá vào tự giả định (đ/cp)'),input('stop','Stop tự giả định (đ/cp)')),
 node('p','tai-muted','Để trống giá vào/stop: Swing dùng pivot/stop sẵn có của Tracker. Giá trị/Cổ tức cần điều kiện vô hiệu hóa riêng. Không tự tạo mục tiêu. Tiền khả dụng để trống chỉ phù hợp khi giả định chưa có vị thế; nếu đã khai báo danh mục, cần nhập tiền còn lại.'));
 const more=node('details');more.append(node('summary','','Phí, thanh khoản & danh mục'));
 more.append(row(input('availableCash','Tiền khả dụng (đồng)'),input('existingPositionValue','Giá trị đang nắm ở mã này (đồng)')),
 row(input('fee','Phí mỗi chiều (%)','0.15'),input('sellTax','Thuế bán giả định (%)','0.1')),
 row(input('slippage','Trượt giá giả định (%)','0.1'),input('maxParticipation','Tham gia thanh khoản tối đa (%)','1')),
 row(input('minRR','R:R tối thiểu — Lãi/Lỗ','2'),input('stressGapPct','Gap bổ sung dưới stop (%)','10')),
 row(input('existingSectorValue','Giá trị đang nắm trong ngành (đồng)'),input('maxSectorWeight','Tỷ trọng ngành tối đa (%)','35')));
 wrap.append(more);
 const val=node('details');val.append(node('summary','','Định giá theo ba kịch bản'));
 val.append(select('valuationMethod','Phương pháp định giá',[['pb','P/B — Giá/Giá trị sổ sách'],['pe','P/E — Giá/Lợi nhuận']]),input('metricValue','BVPS hoặc EPS 12 tháng giả định (đ/cp)'),
 row(input('bearMultiple','Bội số bất lợi'),input('baseMultiple','Bội số cơ sở')),row(input('bullMultiple','Bội số thuận lợi'),input('marginOfSafety','Biên an toàn giả định (%)','20')),input('sourceNote','Cơ sở của giả định','','text'),
 node('p','tai-warning','Giá trị tự nhập là giả định. Hệ thống không dùng phép tính này để xác nhận doanh nghiệp rẻ khi chưa đối chiếu BCTC.'));
 wrap.append(val);
 const ack=input('acknowledge','Tôi đã đọc giả định mô phỏng và rủi ro T+/gap/thanh khoản.','','checkbox');ack.className='tai-ack';wrap.append(ack);root.append(wrap);wrap.hidden=true;
 fields.kind.onchange=()=>{wrap.hidden=fields.kind.value==='none';};
 const ratios=new Set(['riskPct','maxWeight','maxSectorWeight','fee','sellTax','slippage','maxParticipation','stressGapPct']);
 const numeric=['capital','availableCash','existingPositionValue','existingSectorValue','riskPct','maxWeight','maxSectorWeight','fee','sellTax','slippage','maxParticipation','minRR','stressGapPct','entry','stop','target'];
 function read(){
  if(fields.kind.value==='none')return undefined;const out={kind:fields.kind.value,acknowledge:fields.acknowledge.checked};
  for(const k of numeric)if(fields[k].value.trim()!=='')out[k]=Number(fields[k].value)/(ratios.has(k)?100:1);
  const keys=['metricValue','bearMultiple','baseMultiple','bullMultiple'];
  if(keys.some(k=>fields[k].value.trim()!=='')){
   out.valuation={method:fields.valuationMethod.value,marginOfSafety:Number(fields.marginOfSafety.value)/100,sourceNote:fields.sourceNote.value||'Giả định do người dùng nhập'};
   for(const k of keys)if(fields[k].value.trim()!=='')out.valuation[k]=Number(fields[k].value);
  }
  return out;
 }
 function restore(c){
  fields.kind.value=c?.kind||'none';wrap.hidden=!c;
  const defaults={riskPct:0.01,maxWeight:0.2,maxSectorWeight:0.35,fee:0.0015,sellTax:0.001,slippage:0.001,maxParticipation:0.01,minRR:2,stressGapPct:0.1};
  for(const k of numeric){const v=c?.[k]??defaults[k];fields[k].value=v===undefined?'':v*(ratios.has(k)?100:1);}
  fields.acknowledge.checked=c?.acknowledge===true;
  const v=c?.valuation;fields.valuationMethod.value=v?.method||'pb';
  for(const k of ['metricValue','bearMultiple','baseMultiple','bullMultiple'])fields[k].value=v?.[k]??'';
  fields.marginOfSafety.value=(v?.marginOfSafety??0.2)*100;fields.sourceNote.value=v?.sourceNote||'';
 }
 return {root,read,restore};
}
function table(headers,rows){
 const wrap=node('div','tai-scroll'),t=node('table'),head=node('thead'),tr=node('tr');for(const h of headers)tr.append(node('th','',h));head.append(tr);t.append(head);const body=node('tbody');
 for(const row of rows){const tr=node('tr');for(const c of row)tr.append(node('td','',String(c)));body.append(tr);}t.append(body);wrap.append(t);return wrap;
}
function render(parent,report){
 const decision={wait:'Chờ',avoid:'Tránh theo bộ tiêu chí',conditional_watch:'Theo dõi có điều kiện'};
 for(const s of report.strategies||[]){
  const card=node('article','tai-card tai-strategy-card');card.append(node('h3','',s.ticker+' · '+({swing:'Swing / Breakout',value:'Giá trị / Cổ tức',hybrid:'Hybrid'}[s.kind])),node('span','tai-badge',decision[s.decision]),
  node('p','tai-muted','Đánh giá theo snapshot '+s.provenance.dataDate+'. Không phải lệnh mua/bán hoặc tín hiệu trực tiếp.'));
  const axes={confirmed:'Đủ điều kiện kỹ thuật',unconfirmed:'Chưa xác nhận',insufficient:'Thiếu dữ liệu',unknown:'Chưa xác minh',not_required:'Không bắt buộc',valuation_only_quality_unverified:'Chỉ đối chiếu định giá; chất lượng chưa xác minh'};
  card.append(table(['Trục đánh giá','Trạng thái'],[['Kỹ thuật',axes[s.axes.technical.status]||s.axes.technical.status],['Cơ bản',axes[s.axes.fundamental.status]||s.axes.fundamental.status],['Thị trường',s.axes.market.regime]]));
  for(const reason of s.reasons)card.append(node('p','tai-warning',reason));
  const risk=s.risk;const refs={user_assumption:'tự giả định',existing_engine_pivot:'pivot của Tracker',existing_engine_stop:'stop của Tracker'};card.append(node('p','tai-muted','Mốc giá vào: '+(refs[s.entryReference?.source]||'chưa có')+'; stop: '+(refs[s.stopReference?.source]||'chưa có')+'; mục tiêu: '+(s.targetReference?'tự giả định':'chưa có')+'.'));
  card.append(node('h3','','Quy mô vị thế theo giả định'));
  if(risk.status==='calculated'){
   card.append(table(['Nội dung','Kết quả'],[['Giá vào / stop / mục tiêu (đ)',[risk.prices.entry,risk.prices.stop,risk.prices.target].map(money).join(' / ')],['Số cổ phiếu theo giới hạn',money(risk.quantity)],['Chi phí mua ước tính (đ)',money(risk.allocated)],['Tỷ trọng gồm phí',pct(risk.weight)],['Lỗ theo stop ước tính (đ)',money(risk.plannedLoss)],['R:R sau chi phí',money(risk.rr)],['Lỗ nếu gap thêm '+pct(risk.stress.additionalGapBelowStop)+' dưới stop (đ)',money(risk.stress.loss)]]),
    node('p','tai-warning','Lỗ theo stop không phải mức lỗ tối đa được bảo đảm. Số lượng trên là phương án mô phỏng riêng cho mã này.'),
    node('p','tai-muted',risk.settlement));
   if(risk.missingPortfolioContext)card.append(node('p','tai-muted',risk.missingPortfolioContext));
  }else for(const reason of risk.reasons)card.append(node('p','tai-warning',reason));
  card.append(node('h3','','Ba kịch bản'));
  if(s.valuation.scenarios?.length){
   card.append(node('p',s.valuation.verified?'tai-muted':'tai-warning',s.valuation.verified?'Giá trị tính từ chỉ tiêu có nguồn; bội số vẫn là giả định.':'Chỉ là phép tính theo giả định tự nhập, chưa xác minh BCTC.'),
    table(['Kịch bản','Bội số','Giá trị giả định (đ)','Mốc sau biên an toàn (đ)'],s.valuation.scenarios.map(x=>[{bear:'Bất lợi',base:'Cơ sở',bull:'Thuận lợi'}[x.name],money(x.multiple),money(x.fairValue),money(x.watchBelow)])));
  }else for(const x of s.scenarios)card.append(node('p','',({bear:'Bất lợi: ',base:'Cơ sở: ',bull:'Thuận lợi: '}[x.name])+x.condition));
  const inv=node('details');inv.append(node('summary','','Điều kiện làm mất hiệu lực luận điểm'));for(const x of s.invalidation)inv.append(node('p','',x));card.append(inv);
  const audit=node('details');audit.append(node('summary','','Giả định và phiên bản tính toán'),node('pre','',JSON.stringify({configuration:s.configuration,configurationHash:s.configurationHash,provenance:s.provenance,limitations:risk.limitations},null,2)));card.append(audit);parent.append(card);
 }
 if(report.portfolioRisk?.count>1){
  const p=report.portfolioRisk,card=node('div','tai-card');card.append(node('h3','','Nếu cộng các phương án'),table(['Tổng chi phí (đ)','Tổng lỗ theo stop (đ)'],[[money(p.allocated),money(p.plannedLoss)]]),node('p','tai-muted',p.limitation));for(const w of p.warnings)card.append(node('p','tai-warning',w));parent.append(card);
 }
}
window.TrackerAIStrategyUI={controls,render};
})();
