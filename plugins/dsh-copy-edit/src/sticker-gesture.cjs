// 文字时间手柄按工程帧吸附；一次手势只提交一次，独立于源视频裁切。
function useStickerTrim({p,totalFrames,clips,disabled,onSelect,onCommit}){
  const [draft,setDraft]=useState(null),session=useRef(null),hold=useRef(false),latest=useRef(null);
  latest.current={p,totalFrames,clips,disabled,onSelect,onCommit};
  const limit=(s,range)=>{const c=latest.current.clips.find(c=>c.clipId===s.binding?.clipId);return c?{startFrame:Math.max(c.startFrame,range.startFrame),endFrame:Math.min(c.startFrame+c.frames,range.endFrame)}:range;};
  const stop=()=>{const g=session.current;if(!g)return;session.current=null;g.cleanup();};
  const cancel=()=>{stop();setDraft(null);};
  useEffect(()=>()=>stop(),[]);useEffect(()=>{if(session.current?.revision!==p.revision)cancel();},[p.revision]);
  async function submit(g){hold.current=true;try{await latest.current.onCommit(g);}finally{hold.current=false;setDraft(null);}}
  function begin(e,s,edge){
    const l=latest.current;if(l.disabled||hold.current||session.current||e.button!==0||!e.isPrimary||!l.totalFrames)return;
    e.preventDefault();e.stopPropagation();l.onSelect(s.stickerId);
    const el=e.currentTarget,content=el.closest('.dce-timeline-content'),scroller=el.closest('.dce-timeline-scroll'),range=stickerRange(s,l.totalFrames);
    const g={stickerId:s.stickerId,edge,range,original:range,revision:l.p.revision,projectId:l.p.projectId,operationId:uid(),pointerId:e.pointerId,startX:e.clientX,lastX:e.clientX,startScroll:scroller.scrollLeft,framesPerPixel:Number(content.dataset.axisSeconds)*30/content.getBoundingClientRect().width,totalFrames:l.totalFrames};
    const publish=()=>{g.range=limit(s,trimStickerRange(g.original,edge,g.original[edge==='in'?'startFrame':'endFrame']+(g.lastX-g.startX+scroller.scrollLeft-g.startScroll)*g.framesPerPixel,g.totalFrames));setDraft({...g});};
    const move=ev=>{if(ev.pointerId!==g.pointerId)return;ev.preventDefault();g.lastX=ev.clientX;publish();};
    const up=ev=>{if(ev.pointerId!==g.pointerId)return;g.lastX=ev.clientX;publish();stop();if(g.range.startFrame===g.original.startFrame&&g.range.endFrame===g.original.endFrame){setDraft(null);return;}void submit(g);};
    const key=ev=>{if(ev.key==='Escape'||ev.key==='Tab'){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();}cancel();}},hide=()=>{if(document.hidden)cancel();};
    const scroll=()=>{if(session.current!==g)return;const r=scroller.getBoundingClientRect(),before=scroller.scrollLeft;if(Math.abs(g.lastX-g.startX)>3){if(g.lastX<r.left+24)scroller.scrollLeft-=12;else if(g.lastX>r.right-24)scroller.scrollLeft+=12;}if(before!==scroller.scrollLeft)publish();g.raf=requestAnimationFrame(scroll);};
    const extra=watchAdditionalPointer(g.pointerId,cancel);
    g.cleanup=()=>{extra();cancelAnimationFrame(g.raf);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hide);el.removeEventListener('lostpointercapture',cancel);if(el.hasPointerCapture(g.pointerId))el.releasePointerCapture(g.pointerId);};
    session.current=g;el.setPointerCapture(g.pointerId);el.addEventListener('lostpointercapture',cancel);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hide);setDraft({...g});g.raf=requestAnimationFrame(scroll);
  }
  function key(e,s,edge){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const l=latest.current;if(l.disabled||hold.current||session.current||!l.totalFrames)return;
    const original=stickerRange(s,l.totalFrames),field=edge==='in'?'startFrame':'endFrame',target=e.key==='Home'?0:e.key==='End'?l.totalFrames:original[field]+(e.key==='ArrowLeft'?-1:1);
    const range=limit(s,trimStickerRange(original,edge,target,l.totalFrames));if(range.startFrame===original.startFrame&&range.endFrame===original.endFrame)return;l.onSelect(s.stickerId);
    const g={stickerId:s.stickerId,edge,original,range,revision:p.revision,projectId:p.projectId,operationId:uid()};setDraft(g);void submit(g);
  }
  return {draft,begin,key};
}
