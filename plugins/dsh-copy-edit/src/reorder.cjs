function useClipReorder({p,clips,disabled,touchEnabled=false,onStart,onCommit,onDragging}){
  const [draft,setDraft]=useState(null),session=useRef(null),latest=useRef(null),mounted=useRef(true),hold=useRef(false),suppress=useRef(null);
  latest.current={p,clips,disabled,touchEnabled,onStart,onCommit,onDragging};
  const publish=g=>{const rect=g.content.getBoundingClientRect(),track=g.scroller.getBoundingClientRect(),seconds=(g.x-rect.left)/g.pps,target=clipDropTarget(g.clips,g.clipId,seconds),valid=g.x>=track.left-24&&g.x<=track.right+24&&g.y>=track.top-24&&g.y<=track.bottom+24;
    g.target=target;g.valid=valid;const next={clipId:g.clipId,to:target.to,from:target.from,marker:target.marker,valid,revision:g.revision,ghost:Math.max(0,Math.min(g.axisSeconds-g.clip.duration,seconds-g.grab)),duration:g.clip.duration};
    if(JSON.stringify(next)!==g.last){g.last=JSON.stringify(next);setDraft(next);}
  };
  function stop(g){if(session.current!==g)return;session.current=null;cancelAnimationFrame(g.raf);g.resize?.disconnect();
    g.extra?.();window.removeEventListener('pointermove',g.move);window.removeEventListener('pointerup',g.up);window.removeEventListener('pointercancel',g.cancel);window.removeEventListener('keydown',g.key,true);window.removeEventListener('blur',g.cancel);document.removeEventListener('visibilitychange',g.hide);g.element.removeEventListener('lostpointercapture',g.cancel);if(g.element.hasPointerCapture(g.pointerId))g.element.releasePointerCapture(g.pointerId);
  }
  const clear=()=>{if(mounted.current){setDraft(null);latest.current.onDragging(false);}};
  function cancel(){const g=session.current;if(!g)return;if(g.active)suppress.current={id:g.clipId,until:performance.now()+500};stop(g);clear();}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(session.current)stop(session.current);};},[]);
  useEffect(()=>{if(session.current&&session.current.revision!==p.revision)cancel();},[p.revision]);
  useEffect(()=>{if(session.current?.touch&&!touchEnabled)cancel();},[touchEnabled]);
  function begin(e,c){
    if((e.pointerType==='touch'&&!latest.current.touchEnabled)||e.button!==0||!e.isPrimary||latest.current.disabled||session.current||hold.current||clips.length<2)return;
    const element=e.currentTarget,scroller=element.closest('.dce-timeline-scroll'),content=element.closest('.dce-timeline-content');if(element.closest('.dce').clientWidth<=760&&!latest.current.touchEnabled)return;
    e.preventDefault();e.stopPropagation();element.focus({preventScroll:true});const rect=content.getBoundingClientRect(),axisSeconds=Number(content.dataset.axisSeconds),pps=rect.width/axisSeconds;if(!(pps>0))return;
    const g={clip:c,clipId:c.clipId,clips:latest.current.clips,projectId:p.projectId,revision:p.revision,operationId:uid(),element,scroller,content,pps,axisSeconds,touch:e.pointerType==='touch',pointerId:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,grab:(e.clientX-rect.left)/pps-c.start,active:false};session.current=g;
    g.move=ev=>{if(ev.pointerId!==g.pointerId)return;if(ev.cancelable)ev.preventDefault();g.x=ev.clientX;g.y=ev.clientY;if(!g.active&&Math.hypot(g.x-g.startX,g.y-g.startY)>=5){g.active=true;latest.current.onStart(c);latest.current.onDragging(true);}if(g.active)publish(g);};
    g.up=ev=>{if(ev.pointerId!==g.pointerId)return;g.move(ev);stop(g);if(!g.active){clear();return;}suppress.current={id:g.clipId,until:performance.now()+500};
      if(!g.valid||g.target.to===g.target.from){clear();return;}hold.current=true;Promise.resolve().then(()=>latest.current.onCommit(g.target.to,g)).finally(()=>{hold.current=false;clear();});
    };
    g.cancel=cancel;g.hide=()=>{if(document.hidden)cancel();};g.key=ev=>{if(ev.key==='Escape'||ev.key==='Tab'){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();}cancel();}};
    g.extra=watchAdditionalPointer(g.pointerId,cancel);
    const scroll=()=>{if(session.current!==g)return;if(g.active&&g.valid){const r=scroller.getBoundingClientRect(),before=scroller.scrollLeft;if(g.x<r.left+32)scroller.scrollLeft-=Math.min(20,Math.max(0,(r.left+32-g.x)/2));else if(g.x>r.right-32)scroller.scrollLeft+=Math.min(20,Math.max(0,(g.x-r.right+32)/2));if(before!==scroller.scrollLeft)publish(g);}g.raf=requestAnimationFrame(scroll);};
    element.setPointerCapture(e.pointerId);element.addEventListener('lostpointercapture',g.cancel);window.addEventListener('pointermove',g.move,{passive:false});window.addEventListener('pointerup',g.up);window.addEventListener('pointercancel',g.cancel);window.addEventListener('keydown',g.key,true);window.addEventListener('blur',g.cancel);document.addEventListener('visibilitychange',g.hide);
    const originalWidth=rect.width;g.resize=new ResizeObserver(()=>{if(Math.abs(content.getBoundingClientRect().width-originalWidth)>1)cancel();});g.resize.observe(content);g.raf=requestAnimationFrame(scroll);
  }
  function click(e,c){const s=suppress.current;if(s&&s.id===c.clipId&&performance.now()<s.until){e.preventDefault();e.stopPropagation();suppress.current=null;return;}if(!session.current&&!hold.current)latest.current.onStart(c);}
  return {draft,begin,click};
}
