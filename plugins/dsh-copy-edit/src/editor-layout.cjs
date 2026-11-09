const EDITOR_LAYOUT_KEY='dsh-copy-edit.editor.layout.v1';
function readEditorLayout(){try{const p=JSON.parse(localStorage.getItem(EDITOR_LAYOUT_KEY));return p&&typeof p==='object'?p:{};}catch{return {};}}
function EditorLayout({header,library,libraryAction,player,properties,timeline,mobilePanel,setMobilePanel,mobileActions}){
  const root=useRef(null),area=useRef(null),gesture=useRef(null),latest=useRef(null);
  const [size,setSize]=useState({width:0,height:0}),[prefs,setPrefs]=useState(readEditorLayout),[draft,setDraft]=useState(null);
  const [touchNarrow,setTouchNarrow]=useState(()=>matchMedia('(pointer:coarse) and (max-width:1023px)').matches);
  useEffect(()=>{const media=matchMedia('(pointer:coarse) and (max-width:1023px)'),change=()=>setTouchNarrow(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const desktop=size.width>760&&!touchNarrow,layout=fitEditorLayout(size.width,size.height,draft||prefs);
  usePanelLayer(!desktop&&!!mobilePanel,()=>setMobilePanel(null),20);
  useEffect(()=>{if(desktop||!mobilePanel)return;const panel=root.current?.querySelector('[data-mobile-pane="'+mobilePanel+'"]'),previous=document.activeElement;
    const focusable=()=>[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(e=>e.getBoundingClientRect().width);
    focusable()[0]?.focus({preventScroll:true});
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMobilePanel(null);}else if(e.key==='Tab'){const list=focusable(),first=list[0],last=list.at(-1);if(!list.length){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}}};
    document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[desktop,mobilePanel]);
  latest.current={layout,prefs,desktop,size};
  const persist=value=>{setPrefs(value);try{localStorage.setItem(EDITOR_LAYOUT_KEY,JSON.stringify(value));}catch{/* 持久化不可用时保留本次布局。 */}};
  const cancel=()=>{const g=gesture.current;if(g){gesture.current=null;g.cleanup();}setDraft(null);};
  useEffect(()=>{if(!document.activeElement?.closest?.('.dce-page-edit'))root.current?.focus({preventScroll:true});const el=area.current;
    const observer=new ResizeObserver(()=>{const width=root.current.getBoundingClientRect().width,height=el.getBoundingClientRect().height;const old=latest.current.size;if(gesture.current&&(Math.abs(width-old.width)>1||Math.abs(height-old.height)>1))cancel();setSize({width,height});});observer.observe(el);observer.observe(root.current);return()=>{observer.disconnect();const g=gesture.current;if(g){gesture.current=null;g.cleanup();}};
  },[]);
  function reset(edge){cancel();const next={...latest.current.prefs};delete next[edge];persist(next);}
  function begin(e,edge){
    if(!latest.current.desktop||gesture.current||e.button!==0||!e.isPrimary)return;e.preventDefault();e.stopPropagation();
    const el=e.currentTarget,start=latest.current.layout,g={edge,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,value:{left:start.left,right:start.right,timeline:start.timeline}};el.focus({preventScroll:true});
    const move=ev=>{if(ev.pointerId!==g.pointer)return;ev.preventDefault();g.value=dragEditorLayout(start,edge,edge==='timeline'?ev.clientY-g.startY:ev.clientX-g.startX);setDraft(g.value);};
    const up=ev=>{if(ev.pointerId!==g.pointer)return;move(ev);gesture.current=null;g.cleanup();persist(g.value);setDraft(null);};
    const key=ev=>{if(ev.key==='Escape'||ev.key==='Tab'){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();}cancel();}},hide=()=>{if(document.hidden)cancel();};
    g.cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hide);el.removeEventListener('lostpointercapture',cancel);if(el.hasPointerCapture(g.pointer))el.releasePointerCapture(g.pointer);};
    gesture.current=g;el.setPointerCapture(g.pointer);el.addEventListener('lostpointercapture',cancel);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hide);setDraft(g.value);
  }
  function keyboard(e,edge){
    const horizontal=edge!=='timeline',keys=horizontal?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(![...keys,'Home','End'].includes(e.key)||!desktop)return;e.preventDefault();e.stopPropagation();if(gesture.current)return;
    const current=latest.current.layout,range=current.limits[edge],delta=(e.key===keys[0]?-1:1)*(e.shiftKey?40:10),next=dragEditorLayout(current,edge,delta);
    if(e.key==='Home'||e.key==='End')next[edge]=range[e.key==='Home'?0:1];persist(next);
  }
  const divider=(edge,label)=>h('div',{key:edge,role:'separator',tabIndex:desktop?0:-1,className:'dce-panel-divider '+(edge==='timeline'?'horizontal':'vertical'),'data-panel-edge':edge,'aria-label':label,'aria-orientation':edge==='timeline'?'horizontal':'vertical','aria-valuemin':Math.round(layout.limits[edge][0]),'aria-valuemax':Math.round(layout.limits[edge][1]),'aria-valuenow':Math.round(layout[edge]),title:'拖动调整大小，双击恢复默认',onPointerDown:e=>begin(e,edge),onDoubleClick:()=>reset(edge),onKeyDown:e=>keyboard(e,edge)},h('span',{'aria-hidden':true}));
  const pane=(name,label,child)=>h('section',{className:'dce-mobile-pane','data-mobile-pane':name,'data-open':mobilePanel===name,role:!desktop&&mobilePanel===name?'dialog':undefined,'aria-modal':!desktop&&mobilePanel===name?true:undefined,'aria-label':label},h('div',{className:'dce-mobile-pane-heading'},h('strong',null,label),name==='library'&&libraryAction,button(name==='library'?'关闭':'完成',()=>setMobilePanel(null),{'aria-label':'关闭'+label})),child);
  return h('div',{ref:root,className:'dce-editor','data-mobile':!desktop,tabIndex:-1,onPointerDownCapture:e=>{const target=e.target.closest('button,a,input,textarea,select,summary,[tabindex],[contenteditable]');if(!target||target===root.current)root.current.focus({preventScroll:true});}},header,
    h('div',{className:'dce-mobile-tools'},action('film','素材',()=>setMobilePanel('library'),{'aria-label':'素材','aria-expanded':mobilePanel==='library'}),action('layers','属性',()=>setMobilePanel('properties'),{'aria-label':'属性与声音','title':'属性与声音','aria-expanded':mobilePanel==='properties'}),mobileActions),
    !desktop&&mobilePanel&&button('',()=>setMobilePanel(null),{className:'dce-drawer-backdrop','aria-label':'关闭编辑面板',tabIndex:-1}),
    h('div',{ref:area,className:'dce-editor-workarea','data-resizing':draft?'true':undefined,style:desktop?{'--dce-library-width':layout.left+'px','--dce-properties-width':layout.right+'px','--dce-timeline-height':layout.timeline+'px'}:undefined},
      h('div',{className:'dce-editor-upper'},pane('library','素材库',library),divider('left','调整素材库宽度'),player,divider('right','调整属性区宽度'),pane('properties','属性与声音',properties)),divider('timeline','调整时间轴高度'),timeline));
}
