(function(){
  'use strict';
  const panel=document.createElement('section');panel.id='trackerDataStatus';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');panel.style.cssText='margin:12px 0;padding:12px;border:1px solid var(--line,#64748b);border-radius:12px;overflow-wrap:anywhere';
  const heading=document.createElement('strong'),summary=document.createElement('div'),details=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('div');title.textContent='Nguồn, thời gian và kiểm tra dữ liệu';details.append(title,body);panel.append(heading,summary,details);(document.querySelector('.app>.grid')||document.querySelector('#tracker140Workspace')||document.body.firstElementChild).before(panel);
  function update(){const state=window.TrackerDataBridge?.getState();if(!state)return;const m=state.dataMeta||{},q=state.dataQuality||{status:'MISSING',reasons:[]},benchmark=(typeof settings==='function'?settings().benchmarkTicker:'VNINDEX'),rows=state.series?.get(benchmark)||[],date=rows.at(-1)?.date;
    heading.textContent='Dữ liệu · '+q.status;summary.textContent='Phiên '+(m.asOf||state.quality?.standardDate||'chưa có')+' · '+(m.source||state.lastDataSource||'đang tải')+(m.isDemo?' · DEMO, chỉ minh họa':'');
    const lines=['Cập nhật: '+(m.generatedAt?new Date(m.generatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' UTC+7':'chưa xác định'),'Snapshot: '+(m.snapshotId||'chưa có'),'Benchmark '+benchmark+': '+(date||'MISSING'),...(q.reasons||[])];
    if(m.validation?.invalidRows)lines.push(m.validation.invalidRows+' thanh giá sai đã cách ly; công thức giữ nguyên.');
    const context=state.analysisContext;
    if(context){const c=context.coverage;heading.textContent+=' · Phân tích '+context.asOf+': '+c.eligible+'/'+c.recent+' mã cùng kỳ';lines.push('Chính sách: '+context.cohortPolicyVersion,'Context: '+(context.cohortId||'đang tạo hash'),'Độ phủ: '+c.eligible+'/'+c.recent+' mã thuộc nhóm recent cũ; '+c.sameDate+' mã D0 đủ lịch sử. Không phải tỷ lệ toàn thị trường.',context.marketLimitation,'Tìm mã bằng Global Search để tra cứu giá/volume/biểu đồ; mã chưa đủ kỳ vẫn giữ trong Watchlist.');}
    else{heading.textContent+=' · Phân tích MISSING';if(state.analysisError)lines.push(state.analysisError);}
    if(q.intradayStatus==='DELAYED')lines.push('Cập nhật trong phiên chưa có; bản EOD hiển thị không phải giá trực tiếp.');
    body.replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  }
  window.addEventListener('shared-market-data-ready',update);window.addEventListener('tracker-data-status',update);setInterval(update,60000);update();
})();
