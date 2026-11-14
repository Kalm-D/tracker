(function(){
  'use strict';
  const api=window.TrackerPersonalData,storage=api.store(window.indexedDB);
  const panel=document.createElement('section');panel.id='personalDataPanel';panel.className='panel';panel.setAttribute('aria-label','Dữ liệu cá nhân');
  panel.style.cssText='margin:12px 0;padding:14px;overflow-wrap:anywhere';
  panel.innerHTML='<strong>Tracker · Dữ liệu cá nhân trên thiết bị</strong><p>Chọn tệp .json.gz, .json hoặc CSV từ ứng dụng Tệp. Dữ liệu được đọc và lưu trong trình duyệt trên thiết bị này. Cập nhật bằng cách nhập tệp mới.</p><label class="btn primary" for="personalMarketFile" style="display:inline-flex;min-height:44px;align-items:center;cursor:pointer">Nhập dữ liệu cá nhân</label><input id="personalMarketFile" type="file" accept=".gz,.json,.csv,application/gzip,application/json,text/csv" hidden><button class="btn" id="personalRestore" type="button" style="min-height:44px;margin:4px">Nạp bản đã lưu</button><p id="personalFileStatus" role="status" aria-live="polite">Chưa có dữ liệu. Chọn tệp cá nhân để bắt đầu.</p><details><summary>Giới hạn dữ liệu và lưu trữ</summary><p id="personalLimits">Safari có thể thu hồi dữ liệu web khi thiếu dung lượng hoặc khi bạn xóa dữ liệu duyệt web. Giữ tệp gốc trong ứng dụng Tệp. Chế độ này không tự cập nhật EOD hoặc đồng bộ giá sang AI.</p></details>';
  (document.getElementById('trackerDataStatus')||document.querySelector('.app>.grid')).before(panel);
  const input=panel.querySelector('input'),restore=panel.querySelector('button'),status=panel.querySelector('[role=status]'),limits=panel.querySelector('#personalLimits');
  let busy=false,loaded=false;
  const message=text=>{status.textContent=text;};
  function decode(bytes,name){return new Promise((resolve,reject)=>{let worker,timer;
    const finish=(value,error)=>{clearTimeout(timer);worker?.terminate();error?reject(error):resolve(value);};
    try{worker=new Worker(new URL('./personal-worker.js',document.querySelector('script[src*="personal-ui.js"]').src));worker.onmessage=e=>e.data.ok?finish(e.data.result):finish(null,Error(e.data.error));worker.onerror=()=>finish(null,Error('Không đọc được tệp trong worker; thử tải lại trang.'));timer=setTimeout(()=>finish(null,Error('Đọc tệp quá lâu; giữ nguyên bản trước.')),90000);worker.postMessage({bytes,name},[bytes]);}
    catch(error){worker?.terminate();try{resolve(api.decode(bytes,name,window.fflate));}catch(e){reject(e);}}
  });}
  async function load(file,save){
    if(busy)return;busy=true;input.disabled=restore.disabled=true;
    try{
      if(file.size>api.MAX_BYTES)throw Error('Tệp vượt giới hạn 64 MB.');
      message('Đang đọc và kiểm định tệp trên thiết bị…');
      const bytes=await file.arrayBuffer(),decoded=await decode(bytes,file.name);
      let payload=decoded.payload;
      if(decoded.kind==='csv'){
        const rows=parseCsv(decoded.text);const asOf=rows.reduce((d,r)=>r.date>d?r.date:d,'');
        payload={meta:{schema:'shared-market-v1',isDemo:false,asOf,source:'CSV cá nhân',snapshotKind:'PERSONAL_IMPORT',rowCount:rows.length,adjustmentMode:'unknown',volumeDefinitionVerified:false},rows};
      }
      const result=await api.prepare(payload,{inflate:SharedMarketData.inflate,quality:TrackerDataQuality,crypto:window.crypto});
      const before=TrackerDataBridge.getState().dataMeta?.asOf;
      if(before&&result.meta.asOf<before)throw Error('Tệp lùi phiên so với bản đang dùng; giữ bản trước.');
      await new Promise(resolve=>setTimeout(resolve,0));
      TrackerDataBridge.loadRows(result.rows,'Tệp cá nhân · '+result.meta.asOf,result.meta);loaded=true;
      const ctx=TrackerDataBridge.getState().analysisContext;
      const base='Phiên '+result.meta.asOf+' · '+result.meta.quality.status+' · '+(ctx?.coverage.eligible??0)+' mã đủ dữ liệu cùng kỳ. ';
      limits.textContent='Nguồn: '+(result.meta.source||'chưa xác định')+'. Giá điều chỉnh/volume: '+(result.meta.adjustmentMode||'chưa xác minh')+' / '+(result.meta.volumeDefinitionVerified?'đã xác minh':'chưa xác minh')+'. '+(result.meta.sourceQualityCounts?.missing||0)+' mã thiếu giá trong cửa sổ yêu cầu. Ngành có ngày nguồn riêng; không coi dữ liệu ngành cũ là mới. Safari có thể thu hồi dữ liệu web; giữ tệp gốc trong ứng dụng Tệp. Không tự cập nhật EOD hoặc đồng bộ giá sang AI.';
      if(save){try{await storage.put({name:file.name,blob:file,savedAt:new Date().toISOString(),asOf:result.meta.asOf});message(base+'Đã lưu trên thiết bị.');}catch(error){message(base+'Đã nạp nhưng không lưu được: '+error.message+' Giữ tệp gốc để nhập lại.');}}
      else message(base+'Đã nạp bản lưu trên thiết bị.');
    }catch(error){message('Không nạp được: '+error.message+(loaded?' Giữ dữ liệu trước.':''));}
    finally{busy=false;input.disabled=restore.disabled=false;input.value='';}
  }
  input.addEventListener('change',()=>{const file=input.files[0];if(file)load(file,true);});
  async function restoreSaved(){if(busy)return;try{const saved=await storage.get();if(saved?.blob)await load(new File([saved.blob],saved.name),false);else message('Chưa có bản lưu. Chọn tệp cá nhân để bắt đầu.');}catch(error){message('Không đọc được bản lưu: '+error.message+' Bạn có thể nhập tệp để dùng trong phiên này.');}}
  restore.addEventListener('click',restoreSaved);
  // Tab mở lâu vẫn cập nhật tuổi dữ liệu theo lịch Việt Nam, không cần tải giá mới.
  setInterval(()=>{const state=TrackerDataBridge.getState();if(!state.rawRows.length||!state.dataMeta?.personalUseOnly)return;const q=TrackerDataQuality.assess(state.dataMeta);state.dataMeta.quality=q;state.dataQuality=q;status.textContent=status.textContent.replace(/· (FRESH|DELAYED|STALE|MISSING|INVALID)/,'· '+q.status);window.dispatchEvent(new CustomEvent('tracker-data-status'));},60000);
  // Nút nhập cũ vẫn dùng được nhưng đi qua cùng validator trước khi thay dataset.
  const legacy=document.getElementById('csvInput');legacy.addEventListener('change',event=>{event.stopImmediatePropagation();const f=legacy.files[0];if(f)load(f,true);},true);
  document.getElementById('openDataCenterBtn')?.addEventListener('click',()=>panel.scrollIntoView({behavior:'smooth',block:'start'}));
  restoreSaved();
})();
