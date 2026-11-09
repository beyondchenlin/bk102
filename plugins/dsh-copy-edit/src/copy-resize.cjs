const COPY_SIDEBAR_KEY='dsh-copy-edit.copy.sidebar-width.v1';
function useCopySidebarResize(){
  const root=useRef(null),gesture=useRef(null),latest=useRef(null);
  const [available,setAvailable]=useState(0),[preferred,setPreferred]=useState(()=>{try{return JSON.parse(localStorage.getItem(COPY_SIDEBAR_KEY));}catch{return null;}}),[draft,setDraft]=useState(null);
  const layout=fitCopySidebar(available,draft??preferred);latest.current={available,layout,preferred};
  const persist=value=>{setPreferred(value);try{localStorage.setItem(COPY_SIDEBAR_KEY,JSON.stringify(value));}catch{/* 不支持存储时仍可在本页调整。 */}};
  const cancel=()=>{const g=gesture.current;if(g){gesture.current=null;g.cleanup();}setDraft(null);};
  useEffect(()=>{const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(gesture.current&&Math.abs(width-latest.current.available)>1)cancel();setAvailable(width);});observer.observe(root.current);return()=>{observer.disconnect();const g=gesture.current;if(g){gesture.current=null;g.cleanup();}};},[]);
  function begin(e){
    if(!latest.current.layout.desktop||gesture.current||e.button!==0||!e.isPrimary)return;e.preventDefault();e.stopPropagation();
    const el=e.currentTarget,start=latest.current.layout,g={pointer:e.pointerId,startX:e.clientX,value:start.width};el.focus({preventScroll:true});
    const move=ev=>{if(ev.pointerId!==g.pointer)return;if(ev.cancelable)ev.preventDefault();g.value=fitCopySidebar(latest.current.available,start.width+ev.clientX-g.startX).width;setDraft(g.value);};
    const up=ev=>{if(ev.pointerId!==g.pointer)return;move(ev);gesture.current=null;g.cleanup();if(g.value!==start.width)persist(g.value);setDraft(null);};
    const key=ev=>{if(ev.key==='Escape'||ev.key==='Tab'){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();}cancel();}},hide=()=>{if(document.hidden)cancel();};
    g.cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hide);el.removeEventListener('lostpointercapture',cancel);if(el.hasPointerCapture(g.pointer))el.releasePointerCapture(g.pointer);};
    gesture.current=g;el.setPointerCapture(g.pointer);el.addEventListener('lostpointercapture',cancel);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hide);setDraft(g.value);
  }
  function key(e){
    if(!layout.desktop||gesture.current||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();
    const value=e.key==='Home'?layout.min:e.key==='End'?layout.max:layout.width+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?40:10);persist(fitCopySidebar(available,value).width);
  }
  return {root,desktop:layout.desktop,style:{'--copy-sidebar-width':(available?layout.width:280)+'px'},divider:h('div',{className:'dce-copy-divider',role:'separator','aria-label':'调整文案列表宽度','aria-orientation':'vertical','aria-valuemin':layout.min,'aria-valuemax':Math.round(layout.max),'aria-valuenow':Math.round(layout.width),tabIndex:layout.desktop?0:-1,title:'拖动调整宽度，双击恢复默认',onPointerDown:begin,onKeyDown:key,onDoubleClick:()=>{cancel();persist(null);}},h('span',{'aria-hidden':true}))};
}
