(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.TrackerAutomaticData=api;if(root.TRACKER_PERSONAL_WEB===false)api.mount(root,document);}
})(globalThis,function(){
  'use strict';
  // Chỉ tải snapshot bất biến cùng origin; không gọi nguồn giá từ từng iPhone.
  function controller({fetch,load,bridge,quality,base,now=()=>new Date()}){
    let pending;
    async function read(){
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
      try{
        const response=await fetch(new URL('./data/active.json',base).href,{cache:'no-store',signal:abort.signal});
        if(!response.ok)throw Error('Chưa tải được phiên công bố (HTTP '+response.status+').');
        const text=await response.text();if(text.length>65536)throw Error('Manifest vượt giới hạn.');
        const manifest=JSON.parse(text),entry=manifest.active;
        if(manifest.version!==1||!entry||!/^[a-f0-9]{64}$/.test(entry.id)||entry.file!=='snapshots/'+entry.id+'.json.gz'||entry.kind!=='EOD'||!quality.dateValid(entry.tradingDate))throw Error('Manifest snapshot không hợp lệ.');
        const result=await load(new URL('./data/'+entry.file,base).href);
        const m=result.meta;
        if(m.snapshotId!=='sha256:'+entry.id||m.asOf!==entry.tradingDate||m.snapshotKind!=='EOD'||m.isDemo!==false||m.validation?.invalidRows||m.sourceProviders?.length!==1||m.sourceProviders[0]!=='KBS')throw Error('Snapshot không khớp manifest hoặc nguồn công bố.');
        const current=bridge.getState().dataMeta;
        if(current?.asOf&&m.asOf<current.asOf)throw Error('Snapshot lùi phiên; giữ bản đang dùng.');
        const q=quality.assess(m,now());
        if(q.status==='INVALID'||q.status==='MISSING'||q.reasonCodes.includes('SESSION_NOT_CLOSED'))throw Error('Phiên snapshot không hợp lệ hoặc chưa đóng.');
        // Dữ liệu trễ vẫn có thể tra cứu, luôn mang cảnh báo đúng tuổi dữ liệu.
        const meta={...m,quality:q,automaticEod:true,personalUseOnly:false};
        if(!bridge.loadRows(result.rows,'KBS · EOD '+m.asOf,meta))throw Error('Không nạp được snapshot.');
        return meta;
      }catch(error){
        const state=bridge.getState();
        if(state.dataMeta){state.dataMeta={...state.dataMeta,refreshError:true};state.dataQuality=quality.assess(state.dataMeta,now());state.dataMeta.quality=state.dataQuality;}
        throw error;
      }finally{clearTimeout(timer);}
    }
    return {refresh(){if(pending)return pending;pending=read().finally(()=>{pending=null;});return pending;}};
  }
  function mount(root,document){
    const panel=document.createElement('section');panel.className='panel';panel.id='automaticDataPanel';
    panel.style.cssText='margin:12px 0;padding:14px;overflow-wrap:anywhere';
    panel.innerHTML='<strong>Dữ liệu cuối ngày tự động</strong><p role="status" aria-live="polite">Đang tải snapshot đã công bố…</p><button type="button" class="btn" style="min-height:44px">Kiểm tra phiên mới</button>';
    (document.getElementById('trackerDataStatus')||document.querySelector('.app>.grid')).before(panel);
    const status=panel.querySelector('[role=status]'),button=panel.querySelector('button');
    const app=controller({fetch:root.fetch.bind(root),load:root.SharedMarketData.load,bridge:root.TrackerDataBridge,quality:root.TrackerDataQuality,base:document.baseURI});
    async function refresh(){button.disabled=true;try{const m=await app.refresh();status.textContent='Phiên '+m.asOf+' · '+m.quality.status+' · nguồn '+m.source+' · cập nhật '+(m.generatedAt||'chưa có thời điểm nguồn')+'. '+m.quality.reasons.join(' ');}catch(error){status.textContent=error.message+' '+(root.TrackerDataBridge.getState().rawRows?.length?'Giữ dữ liệu trước; xem cảnh báo tuổi dữ liệu.':'Chưa có dữ liệu để phân tích.');}finally{button.disabled=false;root.dispatchEvent(new CustomEvent('tracker-data-status'));}}
    button.addEventListener('click',refresh);root.refreshTrackerSharedMarketData=refresh;
    // Khi mở lại tab trên iPhone, kiểm tra một manifest nhỏ thay vì polling toàn bộ giá.
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    setInterval(()=>{const s=root.TrackerDataBridge.getState();if(!s.dataMeta?.automaticEod)return;s.dataQuality=root.TrackerDataQuality.assess(s.dataMeta);s.dataMeta.quality=s.dataQuality;status.textContent=status.textContent.replace(/· (FRESH|DELAYED|STALE|MISSING|INVALID)/,'· '+s.dataQuality.status);root.dispatchEvent(new CustomEvent('tracker-data-status'));},60000);
    // Tab mở xuyên phiên vẫn kiểm tra bản mới; chỉ tải manifest khi đang thiếu phiên.
    setInterval(()=>{const m=root.TrackerDataBridge.getState().dataMeta;if(!document.hidden&&(!m||m.asOf<root.TrackerDataQuality.clock().expectedSession))refresh();},15*60000);
    refresh();
  }
  return {controller,mount};
});
