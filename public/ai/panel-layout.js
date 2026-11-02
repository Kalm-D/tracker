(function(root){
'use strict';
const KEY='tracker-ai.panel-layout.v1';
const clamp=(n,min,max)=>Math.min(Math.max(n,min),Math.max(min,max));
const finite=(n,fallback)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
function fitRect(rect,viewport){
 const mobile=viewport.width<=640,gap=mobile?0:12;
 const availableWidth=Math.max(1,viewport.width-gap*2),availableHeight=Math.max(1,viewport.height-gap*2);
 const width=mobile?availableWidth:clamp(finite(rect.width,560),Math.min(360,availableWidth),availableWidth);
 const height=mobile?availableHeight:clamp(finite(rect.height,availableHeight),Math.min(360,availableHeight),availableHeight);
 return {width,height,left:mobile?0:clamp(finite(rect.left,viewport.width-width-gap),gap,viewport.width-width-gap),top:mobile?0:clamp(finite(rect.top,gap),gap,viewport.height-height-gap)};
}
function splitLayout(width,height,preferences){
 const wide=width>=960,space=Math.max(0,(wide?width:height)-12);
 // Chừa đủ chỗ cho báo cáo; ô nhập cuộn riêng khi người dùng mở nhiều tùy chọn.
 const report=wide?clamp(space-finite(preferences.sideWidth,350),Math.min(360,space*.55),Math.max(0,space-260)):clamp(space*finite(preferences.stackShare,.64),Math.min(140,space*.5),Math.max(0,space-130));
 return {wide,report,input:Math.max(0,space-report),space};
}
function readPreferences(value){
 let p;try{p=JSON.parse(value);}catch{}p=p&&typeof p==='object'&&!Array.isArray(p)?p:{};
 return {rect:{width:clamp(finite(p.rect?.width,560),360,10000),height:clamp(finite(p.rect?.height,820),360,10000),left:finite(p.rect?.left,NaN),top:finite(p.rect?.top,12)},stackShare:clamp(finite(p.stackShare,.64),.2,.85),sideWidth:clamp(finite(p.sideWidth,350),260,900),collapsed:p.collapsed===true,full:p.full===true};
}
function attach({panel,body,compose,expand}){
 const win=panel.ownerDocument.defaultView,doc=panel.ownerDocument;
 const create=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
 const button=(text,cls)=>{const n=create('button',cls,text);n.type='button';return n;};
 let stored;try{stored=win.localStorage.getItem(KEY);}catch{}
 const preferences=readPreferences(stored);
 // Chỉ lưu hình học giao diện, không lưu câu hỏi, mã cổ phiếu hay nội dung báo cáo.
 if(!stored)preferences.rect.height=Math.max(360,win.innerHeight-24);
 const workspace=create('div','tai-workspace'),splitter=create('div','tai-splitter'),inputPane=create('section','tai-input-pane');
 const tools=create('div','tai-input-tools'),collapse=button('Thu gọn ô nhập','tai-compose-toggle'),reset=button('Đặt lại bố cục','tai-layout-reset');
 body.id='tai-report';body.setAttribute('role','region');body.setAttribute('aria-label','Báo cáo nghiên cứu AI');body.tabIndex=0;
 compose.id='tai-composer';collapse.setAttribute('aria-controls',compose.id);
 tools.append(collapse,reset);inputPane.append(tools,compose);workspace.append(body,splitter,inputPane);panel.append(workspace);
 splitter.tabIndex=0;splitter.setAttribute('role','separator');splitter.setAttribute('aria-label','Điều chỉnh vùng báo cáo và ô nhập');splitter.setAttribute('aria-controls',body.id+' '+compose.id);splitter.title='Kéo để chia lại vùng xem · dùng phím mũi tên để điều chỉnh';
 let rect,split,dragging=false;
 const viewport=()=>({width:win.innerWidth,height:win.innerHeight});
 const save=()=>{try{win.localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}};
 function refresh(){
  const v=viewport();rect=fitRect(preferences.full?{width:v.width-24,height:v.height-24,left:12,top:12}:preferences.rect,v);
  for(const k of ['width','height','left','top'])panel.style[k]=rect[k]+'px';
  panel.classList.toggle('tai-full',preferences.full);panel.classList.toggle('tai-composer-collapsed',preferences.collapsed);panel.classList.toggle('tai-no-composer',compose.hidden);
  inputPane.hidden=compose.hidden;splitter.hidden=compose.hidden||preferences.collapsed;
  expand.textContent=preferences.full?'Thu nhỏ':'Mở rộng';expand.setAttribute('aria-pressed',String(preferences.full));
  collapse.textContent=preferences.collapsed?'Mở ô nhập':'Thu gọn ô nhập';collapse.setAttribute('aria-expanded',String(!preferences.collapsed));
  const box=workspace.getBoundingClientRect();split=splitLayout(box.width,box.height,preferences);
  panel.classList.toggle('tai-wide',split.wide);workspace.style.setProperty('--tai-report-size',split.report+'px');
  splitter.setAttribute('aria-orientation',split.wide?'vertical':'horizontal');splitter.setAttribute('aria-valuemin','0');splitter.setAttribute('aria-valuemax','100');splitter.setAttribute('aria-valuenow',String(Math.round(split.report/Math.max(1,split.space)*100)));splitter.setAttribute('aria-valuetext','Vùng báo cáo '+Math.round(split.report/Math.max(1,split.space)*100)+'%');
 }
 function changeSplit(delta){
  if(split.wide)preferences.sideWidth=clamp(split.input-delta,260,Math.max(260,split.space-360));
  else preferences.stackShare=clamp((split.report+delta)/Math.max(1,split.space),.2,.85);
  refresh();
 }
 function drag(node,start,move){
  node.addEventListener('pointerdown',e=>{
   if(e.button!==0||dragging)return;e.preventDefault();dragging=true;panel.classList.add('tai-dragging');
   const initial=start(e),x=e.clientX,y=e.clientY;node.setPointerCapture(e.pointerId);
   const update=event=>{if(event.pointerId===e.pointerId)move(initial,event.clientX-x,event.clientY-y);};
   const finish=event=>{if(event.pointerId!==e.pointerId)return;node.removeEventListener('pointermove',update);node.removeEventListener('pointerup',finish);node.removeEventListener('pointercancel',finish);node.removeEventListener('lostpointercapture',finish);dragging=false;panel.classList.remove('tai-dragging');save();};
   node.addEventListener('pointermove',update);node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish);node.addEventListener('lostpointercapture',finish);
  });
 }
 drag(splitter,()=>({report:split.report,input:split.input,wide:split.wide,space:split.space}),(initial,dx,dy)=>{
  if(initial.wide)preferences.sideWidth=clamp(initial.input-dx,260,Math.max(260,initial.space-360));
  else preferences.stackShare=clamp((initial.report+dy)/Math.max(1,initial.space),.2,.85);
  refresh();
 });
 splitter.addEventListener('keydown',e=>{
  const delta=({ArrowLeft:-24,ArrowUp:-24,ArrowRight:24,ArrowDown:24})[e.key];if(delta===undefined)return;
  e.preventDefault();changeSplit(delta*(e.shiftKey?3:1));save();
 });
 for(const [kind,label]of [['w','Đổi chiều rộng bảng AI'],['s','Đổi chiều cao bảng AI'],['sw','Đổi chiều rộng và chiều cao bảng AI']]){
  const handle=button('', 'tai-resize tai-resize-'+kind);handle.setAttribute('aria-label',label);handle.title=label+' · kéo hoặc dùng phím mũi tên';panel.append(handle);
  function resize(initial,dx,dy){
   const v=viewport(),left=kind.includes('w')?clamp(initial.left+dx,12,initial.left+initial.width-Math.min(360,v.width-24)):initial.left;
   preferences.rect=fitRect({left,top:initial.top,width:kind.includes('w')?initial.width+initial.left-left:initial.width,height:kind.includes('s')?initial.height+dy:initial.height},v);refresh();
  }
  drag(handle,()=>({...rect}),(initial,dx,dy)=>resize(initial,dx,dy));
  handle.addEventListener('keydown',e=>{const delta=24*(e.shiftKey?3:1),d={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]}[e.key];if(!d)return;e.preventDefault();resize({...rect},...d);save();});
 }
 collapse.addEventListener('click',()=>{preferences.collapsed=!preferences.collapsed;refresh();save();});
 reset.addEventListener('click',()=>{const v=viewport();Object.assign(preferences,readPreferences(null),{rect:{width:560,height:v.height-24,left:NaN,top:12},full:preferences.full});refresh();save();});
 new win.ResizeObserver(refresh).observe(workspace);
 new win.MutationObserver(refresh).observe(compose,{attributes:true,attributeFilter:['hidden']});
 win.addEventListener('resize',refresh);refresh();
 return {refresh,toggleFull(){preferences.full=!preferences.full;refresh();save();}};
}
const api={fitRect,splitLayout,readPreferences,attach};
if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerAIPanelLayout=api;
})(typeof window==='object'?window:globalThis);
