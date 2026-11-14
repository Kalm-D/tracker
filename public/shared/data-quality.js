(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerDataQuality=api;})(globalThis,function(){
  'use strict';
  // Lịch 2026: HNX 5305/2025, thông báo Quốc khánh và cập nhật HOSE 2410/2025.
  const CALENDAR=Object.freeze({version:'vn-cash-2026-reviewed-20261102',from:'2026-01-01',to:'2026-12-31',
    holidays:['2026-01-01','2026-01-02','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-04-27','2026-04-30','2026-05-01','2026-08-31','2026-09-01','2026-09-02'],
    sources:['https://hnx.vn/vi-vn/chi-tiet-lich-nghi-gd-60021971.html','https://stoxvn.hnx.vn/vi-vn/chi-tiet-lich-nghi-gd-60023268.html','https://staticfile.hsx.vn/Uploads/UploadDocuments/2426350/20251225_Thong%20bao%20%20ve%20%20viec%20cap%20nhat%20lich%20nghi%20giao%20dich%20Tet%20Duong%20lich%202026%20toan%20thi%20truong.pdf']});
  const VERSION='data-quality-1.0.0',STATES=Object.freeze(['FRESH','DELAYED','STALE','MISSING','INVALID']);
  function dateValid(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const n=Date.parse(date+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date;}
  function validBar(r,dateIsValid=dateValid(r?.date)){return !!r&&dateIsValid&&[r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)&&r.low>0&&r.volume>=0&&r.low<=Math.min(r.open,r.close)&&r.high>=Math.max(r.open,r.close)&&r.high>=r.low;}
  const shift=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  function trading(date,calendar=CALENDAR){const day=new Date(date+'T12:00:00Z').getUTCDay();return day>0&&day<6&&!calendar.holidays.includes(date);}
  function previous(date,calendar=CALENDAR){let d=date;for(let i=0;i<32;i++){d=shift(d,-1);if(trading(d,calendar))return d;}return null;}
  function clock(now=new Date(),calendar=CALENDAR){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const today=p.year+'-'+p.month+'-'+p.day,minutes=Number(p.hour)*60+Number(p.minute),open=trading(today,calendar);return {today,minutes,expectedSession:open&&minutes>=900?today:previous(today,calendar),intradayDue:open&&minutes>=640};}
  function assess(meta={},now=new Date(),options={}){
    const calendar=options.calendar||CALENDAR,c=clock(now,calendar),date=meta.asOf||meta.tradingDate,reasons=[];let status='FRESH';
    if(!date)status='MISSING',reasons.push('MISSING_TRADING_DATE');
    else if(!dateValid(date)||date>c.today||meta.isDemo===true)status='INVALID',reasons.push(meta.isDemo?'DEMO_DATA':'INVALID_TRADING_DATE');
    else if(c.today<calendar.from||c.today>calendar.to||c.expectedSession<calendar.from)status='DELAYED',reasons.push('CALENDAR_UNVERIFIED');
    else if(date<c.expectedSession){status=date<previous(c.expectedSession,calendar)?'STALE':'DELAYED';reasons.push('EXPECTED_SESSION_NOT_PUBLISHED');}
    else if(date>c.expectedSession)status='DELAYED',reasons.push('SESSION_NOT_CLOSED');
    else if(meta.snapshotKind==='INTRADAY')status='DELAYED',reasons.push('PROVISIONAL_INTRADAY');
    if(meta.validation?.invalidRows)reasons.push('INVALID_ROWS_QUARANTINED');
    if(meta.refreshError){if(status==='FRESH')status='DELAYED';reasons.push('REFRESH_FAILED_USING_LAST_GOOD');}
    if(meta.snapshotKind==null)reasons.push('LEGACY_SNAPSHOT_KIND_UNSPECIFIED');
    const messages={MISSING_TRADING_DATE:'Chưa có phiên dữ liệu.',DEMO_DATA:'Dữ liệu mẫu, không phải dữ liệu thị trường.',INVALID_TRADING_DATE:'Ngày dữ liệu không hợp lệ.',CALENDAR_UNVERIFIED:'Chưa có lịch giao dịch đã kiểm chứng cho thời điểm này.',EXPECTED_SESSION_NOT_PUBLISHED:'Chưa công bố đủ phiên hoàn tất dự kiến.',PROVISIONAL_INTRADAY:'Dữ liệu trong phiên, chưa phải EOD hoàn tất.',INVALID_ROWS_QUARANTINED:'Đã cách ly thanh giá sai OHLCV theo validator Backtest.',REFRESH_FAILED_USING_LAST_GOOD:'Lần tải mới lỗi; đang giữ bản thật hợp lệ gần nhất.',LEGACY_SNAPSHOT_KIND_UNSPECIFIED:'Bản cũ chưa khai báo rõ EOD/intraday.'};
    messages.SESSION_NOT_CLOSED='Phiên dữ liệu đang diễn ra, chưa phải EOD hoàn tất.';
    return {version:VERSION,status,dataDate:date||null,expectedSession:c.expectedSession,checkedAt:now.toISOString(),calendarVersion:calendar.version,reasonCodes:reasons,reasons:reasons.map(r=>messages[r]),intradayStatus:c.intradayDue&&date<c.today?'DELAYED':null,message:'Snapshot '+(date||'chưa có')+' · '+status+'; không phải giá trực tiếp.'};
  }
  function sanitize(rows){const seen=new Set(),dates=new Map(),clean=[],invalid=[];for(const r of rows){const key=r.ticker+'|'+r.date;if(seen.has(key))throw Error('Trùng mã/phiên '+key);seen.add(key);if(!dates.has(r.date))dates.set(r.date,dateValid(r.date));if(validBar(r,dates.get(r.date)))clean.push(r);else if(invalid.length<20)invalid.push({ticker:r.ticker,date:r.date});}return {rows:clean,validation:{inputRows:rows.length,validRows:clean.length,invalidRows:rows.length-clean.length,examples:invalid,policy:'backtest-1.0.0-OHLCV'}};}
  function cohortWarnings(rows,benchmark='VNINDEX'){const dates=new Map();for(const r of rows)if(!dates.has(r.ticker)||dates.get(r.ticker)<r.date)dates.set(r.ticker,r.date);const benchmarkDate=dates.get(benchmark)||null;return {benchmarkDate,mismatchedSymbols:[...dates].filter(([t,d])=>t!==benchmark&&d!==benchmarkDate).map(([ticker,symbolDate])=>({ticker,symbolDate,benchmarkDate,reason:'COHORT_DATE_MISMATCH'})),policy:'legacy-calculation-unchanged'};}
  return {VERSION,STATES,CALENDAR,dateValid,validBar,sanitize,assess,clock,trading,previous,cohortWarnings};
});
