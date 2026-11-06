(function(){
  'use strict';
  let pending;
  const script=src=>new Promise((resolve,reject)=>{const n=document.createElement('script');n.src=src;n.onload=resolve;n.onerror=()=>{n.remove();reject(Error('Không tải được Backtest theo quyền đã đăng nhập.'));};document.head.append(n);});
  function init(){if(!window.Tracker140||!document.getElementById('tracker140Nav'))return setTimeout(init,100);const nav=document.createElement('button');nav.dataset.v='backtest';nav.textContent='Backtest';document.getElementById('tracker140Nav').append(nav);
    nav.onclick=async()=>{const cfg=window.TRACKER_AI_CONFIG;if(cfg?.launchUrl){const url=new URL(cfg.launchUrl);url.hash='backtest';window.open(url.href,'_blank','noopener,noreferrer');return;}
      let section=document.getElementById('t140-backtest-access');if(!section){section=document.createElement('section');section.id='t140-backtest-access';section.className='t140-view';document.getElementById('tracker140Workspace').append(section);}Tracker140.switchView('backtest-access');section.textContent='Đang kiểm tra quyền Backtest…';
      try{const response=await fetch('/api/ai/session',{credentials:'same-origin',cache:'no-store'});const session=await response.json();if(!response.ok||!session.capabilities?.includes('backtest')){section.textContent=response.status===401?'Đăng nhập Owner/Admin qua Nghiên cứu AI để mở Backtest.':'Tài khoản không được cấp Backtest.';const b=document.createElement('button');b.textContent='Mở đăng nhập';b.onclick=()=>window.TrackerAI?.open();section.append(b);return;}
        if(window.TrackerAccountId!==session.identity.id)document.dispatchEvent(new CustomEvent('tracker-session',{detail:session.identity}));if(!pending)pending=(async()=>{const css=document.createElement('link');css.rel='stylesheet';css.href='./backtest/backtest.css';document.head.append(css);await script('./backtest/engine.js');await script('./backtest/ui.js');})();await pending;section.remove();nav.hidden=true;Tracker140.switchView('backtest');
      }catch(e){pending=null;section.textContent=e.message;}
    };
    window.TrackerBacktestAccess={open:()=>nav.click()};
    document.addEventListener('backtest-disposed',()=>{pending=null;nav.hidden=false;});
    if(location.hash==='#backtest')nav.click();
  }
  document.addEventListener('tracker-session',()=>{const section=document.getElementById('t140-backtest');if(section){section.classList.remove('active');Tracker140.switchView('screener');}});init();
})();
