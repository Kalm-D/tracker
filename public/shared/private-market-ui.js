(async function(){
  'use strict';if(!window.TRACKER_PRIVATE_MARKET_WEB)return;
  document.getElementById('inforStatus').textContent='Đăng nhập Owner ở đầu trang để xem dữ liệu DNSE và phiên cuối ngày.';
  const panel=document.createElement('section');panel.id='privateMarketLogin';panel.className='panel';panel.style.cssText='margin:12px 0;padding:14px';
  panel.innerHTML='<strong>Tracker · Dữ liệu DNSE cá nhân</strong><p role="status" aria-live="polite">Đang kiểm tra phiên đăng nhập…</p><form hidden><label>Mật khẩu Tracker <input type="password" autocomplete="current-password" required maxlength="256" style="font-size:16px;max-width:100%"></label><button class="btn primary" style="min-height:44px">Đăng nhập Owner</button></form><button type="button" class="btn" hidden style="min-height:44px">Đăng xuất</button>';
  (document.getElementById('trackerDataStatus')||document.querySelector('.app>.grid')).before(panel);
  const status=panel.querySelector('[role=status]'),form=panel.querySelector('form'),password=form.querySelector('input'),logout=panel.querySelector('button[type=button]');let csrf='',token='',loaded=false;
  const base=window.TRACKER_PRIVATE_API_BASE||'',prefix=new URL(base+'/api/ai/',location.href).href;
  // Token phiên chỉ ở RAM; không dùng cookie bên thứ ba trên Safari, không lưu khóa DNSE.
  window.TrackerPrivateFetch=(url,options={})=>{const target=new URL(url,location.href);if(!target.href.startsWith(prefix))throw Error('Không gửi phiên sang máy chủ khác.');return fetch(target.href,{...options,credentials:base?'omit':'same-origin',redirect:'error',headers:{...options.headers,...(token?{Authorization:'Bearer '+token}:{})}}).then(r=>{if(loaded&&r.status===401){token='';csrf='';location.reload();}return r;});};
  async function api(route,options={}){const r=await window.TrackerPrivateFetch(prefix+route,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(csrf?{'X-Tracker-CSRF':csrf}:{}),...options.headers}});const b=await r.json();if(!r.ok)throw Error(b.error||'Chưa đăng nhập.');return b;}
  function accept(s){csrf=s.csrf;if(s.token)token=s.token;const infor=document.getElementById('t140-infor');
    infor.append(panel);
    document.getElementById('inforStatus').hidden=true;
    if(s.role!=='owner'){status.textContent='Dữ liệu DNSE này chỉ dành cho chủ tài khoản nguồn.';form.hidden=true;logout.hidden=false;return;}
    form.hidden=true;logout.hidden=false;status.textContent='Đã đăng nhập Owner. Đang tải dữ liệu cuối ngày.';
    if(!loaded){loaded=true;TrackerAutomaticData.mount(window,document,infor);}
    // Chỉ đồng bộ danh tính trên backend first-party cho Backtest; giữ vùng Watchlist Pages.
    if(!base){const identity=s.identity||{id:'owner',role:'owner'};if(window.TrackerAccountId!==identity.id){window.TrackerAccountId=identity.id;document.dispatchEvent(new CustomEvent('tracker-session',{detail:identity}));}}
  }
  form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{accept(await api('login',{method:'POST',body:JSON.stringify({username:'owner',password:password.value})}));}catch(error){status.textContent=error.message;}finally{password.value='';b.disabled=false;}});
  logout.addEventListener('click',async()=>{try{await api('logout',{method:'POST'});token='';csrf='';location.reload();}catch(error){status.textContent=error.message;}});
  document.addEventListener('tracker-session',e=>{if(loaded&&e.detail?.id!=='owner')location.reload();else if(!loaded&&e.detail?.id==='owner')api('session').then(accept).catch(()=>{});});
  try{accept(await api('session'));}catch{status.textContent='Đăng nhập bằng mật khẩu Tracker của bạn để nhận dữ liệu DNSE. Không nhập khóa DNSE vào web.';form.hidden=false;}
})();
