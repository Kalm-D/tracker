(function(){
'use strict';
const cfg=window.TRACKER_AI_CONFIG;if(!cfg?.enabled)return;
try{
 const base=new URL(cfg.apiBase||location.origin,location.href);if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))return;
 const apiBase=base.href.replace(/\/$/,'')+'/api/ai/';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls)=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
 let csrf='',currentId=null,timer=null,pollAbort,opened=false,lastFocus,logged=false;
 const launcher=button('✦ Nghiên cứu AI',()=>toggle(true),'tai-launch');launcher.setAttribute('aria-label','Mở trợ lý nghiên cứu Tracker AI');
 const panel=el('section','tai');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Tracker AI – Trợ lý nghiên cứu');
 const head=el('header','tai-head'),brand=el('div');brand.append(el('strong','','Tracker AI'),el('small','','Nghiên cứu có dẫn nguồn · v0.1 thử nghiệm'));
 const expand=button('Mở rộng',()=>{panel.classList.toggle('tai-full');expand.textContent=panel.classList.contains('tai-full')?'Thu nhỏ':'Mở rộng';},'tai-expand'),close=button('Đóng',()=>toggle(false));head.append(brand,expand,close);
 const body=el('div','tai-body'),status=el('div','tai-status','Đang kiểm tra kết nối…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const compose=el('form','tai-compose'),row=el('div','tai-row');
 function field(label,node){const l=el('label','',label);l.append(node);return l;}
 const tickers=el('input');tickers.placeholder='MBB, ACB';tickers.maxLength=40;tickers.setAttribute('aria-label','Mã cổ phiếu');
 const mode=el('select');for(const name of ['Quick','Standard','Deep']){const o=el('option','',name);o.value=name;mode.append(o);}row.append(field('Mã đang nghiên cứu',tickers),field('Độ sâu',mode));
 const question=el('textarea');question.placeholder='Bạn muốn kiểm tra luận điểm nào?';question.maxLength=4000;question.required=true;question.setAttribute('aria-label','Câu hỏi nghiên cứu');
 const docs=el('details'),docsInput=el('textarea');docsInput.placeholder='Mỗi dòng một URL công bố/BCTC chính thức (tối đa 4).';docsInput.setAttribute('aria-label','Đường dẫn nguồn chính thức');docs.append(el('summary','','Thêm công bố hoặc báo cáo tài chính'),docsInput);
 const controls=el('div','tai-controls'),send=el('button','tai-primary','Bắt đầu nghiên cứu');send.type='submit';
 const cancel=button('Dừng',async()=>{if(currentId)try{await api('jobs/'+currentId,{method:'DELETE'});await poll();}catch(e){status.textContent=e.message;}});cancel.disabled=true;
 const history=button('Lịch sử',showHistory),logout=button('Đăng xuất',async()=>{await api('logout',{method:'POST'});csrf='';logged=false;clearTimeout(timer);loginView();});
 controls.append(send,cancel,history,logout);compose.append(row,field('Câu hỏi',question),docs,controls);compose.hidden=true;
 compose.onsubmit=async e=>{e.preventDefault();if(!logged)return;send.disabled=true;try{
  const data=await api('jobs',{method:'POST',body:JSON.stringify({question:question.value,tickers:tickers.value.toUpperCase().split(/[\s,;]+/).filter(Boolean),mode:mode.value,sourceUrls:docsInput.value.split(/\s+/).filter(Boolean)})});
  currentId=data.id;render(data);await poll();
 }catch(e){status.textContent=e.message;send.disabled=false;}};
 panel.append(head,status,body,compose);const host=el('div');host.id='tracker-ai-root';const shadow=host.attachShadow({mode:'open'});const style=el('link');style.rel='stylesheet';style.href=new URL('./ai/chat.css',document.baseURI).href;shadow.append(style,launcher,panel);document.body.append(host);
 function toggle(on){opened=on;panel.hidden=!on;launcher.hidden=on;if(on){lastFocus=document.activeElement;syncContext();if(logged){question.focus();if(currentId)poll();}else session();}else{clearTimeout(timer);pollAbort?.abort();lastFocus?.focus?.();}}
 function syncContext(){let t='';try{const selected=document.querySelector('#v2TickerSelect');if(selected&&selected.offsetParent)t=selected.value;if(typeof state!=='undefined'&&state.selectedTicker&&document.getElementById('modalBackdrop')?.style.display==='flex')t=state.selectedTicker;}catch{}if(/^[A-Z0-9]{3}$/.test(t))tickers.value=t;}
 document.addEventListener('change',e=>{if(e.target?.id==='v2TickerSelect'&&opened)syncContext();});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();toggle(false);}if(e.key==='Tab'){const items=[...panel.querySelectorAll('button,input,textarea,select,summary,a')].filter(n=>!n.disabled&&n.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 async function api(route,options={}){const controller=options.signal?null:new AbortController(),timeout=controller&&setTimeout(()=>controller.abort(),15000);try{const r=await fetch(apiBase+route,{credentials:'include',...options,signal:options.signal||controller.signal,headers:{'Content-Type':'application/json',...(csrf?{'X-Tracker-CSRF':csrf}:{}),...options.headers}});const j=await r.json();if(!r.ok)throw new Error(j.error||'Không kết nối được máy chủ AI.');return j;}finally{clearTimeout(timeout);}}
 async function session(){try{const s=await api('session');csrf=s.csrf;logged=true;compose.hidden=false;welcome();status.textContent='Đã đăng nhập · '+s.usage.attempts+'/'+s.usage.maxCalls+' lượt gọi hôm nay (UTC).';}catch(e){status.textContent=e.message;loginView();}}
 function loginView(){
  compose.hidden=true;body.replaceChildren();const card=el('div','tai-card'),form=el('form'),pass=el('input');pass.type='password';pass.autocomplete='current-password';pass.maxLength=256;const submit=el('button','tai-primary','Đăng nhập');submit.type='submit';card.append(el('h3','','Đăng nhập trợ lý nghiên cứu'),el('p','tai-muted','Sử dụng tài khoản riêng của backend AI. Khóa API được giữ trên máy chủ.'));form.append(field('Mật khẩu',pass),submit);card.append(form);body.append(card);
  form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const s=await api('login',{method:'POST',body:JSON.stringify({password:pass.value})});pass.value='';csrf=s.csrf;logged=true;compose.hidden=false;welcome();status.textContent='Sẵn sàng nghiên cứu.';question.focus();}catch(e){pass.value='';status.textContent=e.message;}finally{submit.disabled=false;}};
  pass.focus();
 }
 function welcome(){body.replaceChildren();const w=el('div','tai-welcome');w.append(el('small','','BẮT ĐẦU TỪ MỘT LUẬN ĐIỂM'),el('h2','','Kiểm tra bằng chứng.\nHiểu rõ rủi ro.'),el('p','','Đặt câu hỏi về cổ phiếu, so sánh doanh nghiệp hoặc thêm công bố để kiểm chứng. Dữ liệu luôn đi kèm ngày và nguồn.'));
  for(const q of ['Phân tích kỹ thuật MBB','Phân tích cơ bản ACB','So sánh MBB và TCB'])w.append(button(q,()=>{question.value=q;question.focus();},'tai-example'));body.append(w);}
 const labels={queued:'Đang chờ',running:'Đang chạy',completed:'Hoàn thành',blocked:'Còn phần bị chặn',failed:'Lỗi',cancelled:'Đã dừng'};
 async function poll(){clearTimeout(timer);if(!opened||!currentId)return;pollAbort?.abort();pollAbort=new AbortController();const timeout=setTimeout(()=>pollAbort.abort(),15000);try{const j=await api('jobs/'+currentId,{signal:pollAbort.signal});render(j);if(['queued','running'].includes(j.status))timer=setTimeout(poll,1800);}catch(e){if(e.name!=='AbortError')status.textContent=e.message;send.disabled=false;}finally{clearTimeout(timeout);}}
 function render(j){
  body.replaceChildren();status.textContent=labels[j.status]+' · '+j.request.mode;const busy=['queued','running'].includes(j.status);send.disabled=busy;cancel.disabled=!busy;
  const prompt=el('div','tai-card');prompt.append(el('small','','YÊU CẦU'),el('p','',j.request.question));body.append(prompt);
  if(j.trace.length){const d=el('details');d.open=busy;const list=el('ul','tai-progress');for(const t of j.trace)list.append(el('li','',t.agent.toUpperCase()+' · '+labels[t.status]+(t.error?' · '+t.error:'')));d.append(el('summary','','Tiến độ · '+j.trace.filter(t=>t.status==='completed').length+'/'+j.trace.length+' bước đã chạy'),list);body.append(d);}
  const r=j.report||{};if(r.provenance){const p=r.provenance;body.append(el('p','tai-warning',p.message));const card=el('div','tai-card');card.append(el('small','','TÍNH TOÁN TỪ TRACKER ENGINE'));const metrics=r.evidence.find(e=>e.type==='deterministic_calculation')?.metrics||[];
   if(metrics.length){const wrap=el('div','tai-scroll'),table=el('table'),tr=el('tr');for(const s of ['Mã','Close (đ)','MA50 (đ)','RS /100','Tracker /100'])tr.append(el('th','',s));const thead=el('thead');thead.append(tr);table.append(thead);const tbody=el('tbody');for(const m of metrics){const row=el('tr');for(const v of [m.ticker,m.close,m.m50,m.rsPercentile,m.trackerScore])row.append(el('td','',typeof v==='number'?v.toLocaleString('vi-VN',{maximumFractionDigits:2}):v??'Thiếu'));tbody.append(row);}table.append(tbody);wrap.append(table);card.append(wrap,el('p','tai-muted','MA50: trung bình giá 50 phiên. RS: sức mạnh tương đối. Điểm số dùng nguyên công thức Tracker, không phải xác suất tăng giá.'));}
   else card.append(el('p','','Chưa có chỉ báo đủ điều kiện cho các mã được yêu cầu.'));
   const d=el('details');d.append(el('summary','','Nguồn và phiên bản tính toán'),el('pre','',JSON.stringify(p,null,2)));card.append(d);body.append(card);
  }
  for(const a of r.analyses||[]){const card=el('article','tai-card');card.append(el('h3','',a.role.toUpperCase()),el('p','',a.result.summary),el('small','','Nhận định AI · '+a.provider+' / '+a.model+(a.cached?' · dùng kết quả lưu':'')));
   for(const c of a.result.claims){card.append(el('p','',(c.kind==='interpretation'?'Diễn giải: ':'Dữ kiện được dẫn: ')+c.text),el('small','','Nguồn: '+c.evidenceIds.join(', ')));}
   for(const s of a.result.limitations)card.append(el('p','tai-warning',s));body.append(card);
  }
  for(const check of r.premiseChecks||[])body.append(el('p',check.status==='contradicted_by_snapshot'?'tai-warning':'tai-muted',check.ticker+': '+check.message+' Close snapshot: '+check.snapshotClose.toLocaleString('vi-VN')+' đồng ('+check.dataDate+').'));for(const w of r.warnings||[])body.append(el('p','tai-warning',w));if(j.error)body.append(el('p','tai-warning',j.error));
  if(r.audit){const d=el('details');d.append(el('summary','','Kết quả kiểm tra và giới hạn'),el('p','','Đã kiểm tra hợp đồng dữ liệu, mã nguồn dẫn và số liệu xuất hiện trong nguồn. Chưa xác minh độc lập toàn bộ nội dung tài chính.'),el('pre','',JSON.stringify(r.audit,null,2)));body.append(d);}
  for(const e of r.evidence||[]){if(e.type==='deterministic_calculation')continue;const d=el('details'),title=e.ticker?'BCTC '+e.ticker:e.type==='news_discovery'?'Danh mục tin chưa xác minh':'Tài liệu chính thức';d.append(el('summary','',title),el('small','','Thu thập: '+e.retrievedAt+' · Ngày công bố: '+(e.publishedAt||'chưa xác minh')));
   try{const u=new URL(e.url);if(u.protocol==='https:'){const a=el('a','','Mở nguồn');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';d.append(el('p','',''),a);}}catch{}
   d.append(el('pre','',JSON.stringify(e.data||e.items||e.text||{},null,2)));body.append(d);
  }
  if(r.usage)body.append(el('p','tai-muted','Lượt gọi AI hôm nay: '+r.usage.usage.attempts+' · Token API ghi nhận: '+r.usage.usage.actualTokens+' · Quota nhà cung cấp: chưa xác định.'));
  if(!busy){const retry=button('Thử lại tác vụ',()=>{question.value=j.request.question;mode.value=j.request.mode;tickers.value=j.request.tickers.join(', ');docsInput.value=j.request.sourceUrls.join('\n');compose.requestSubmit();});body.append(retry);}
 }
 async function showHistory(){try{const jobs=await api('jobs');body.replaceChildren();const box=el('div','tai-history');box.append(el('h3','','Lịch sử nghiên cứu'));if(!jobs.length)box.append(el('p','','Chưa có tác vụ.'));for(const j of jobs)box.append(button(labels[j.status]+' · '+j.question,()=>{currentId=j.id;poll();}));body.append(box);}catch(e){status.textContent=e.message;}}
 window.TrackerAI={open:()=>toggle(true),close:()=>toggle(false)};
}catch(e){console.warn('Tracker AI chưa sẵn sàng.');}
})();
