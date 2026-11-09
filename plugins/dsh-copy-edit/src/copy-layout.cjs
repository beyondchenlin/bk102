// 只调整文案输入框的展示高度，不触碰正文值、版本或工程数据。
function useCopyTextHeight(text){
  const ref=useRef(null),fit=useRef(()=>{});
  React.useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const resize=()=>{
      if(!el.isConnected||!el.clientWidth)return;
      const scroll=el.closest('.dce-document-scroll'),top=scroll?.scrollTop;
      el.style.height='0px';el.style.height=el.scrollHeight+'px';
      if(scroll&&top!==undefined)scroll.scrollTop=top;
    };
    fit.current=resize;let width=el.clientWidth;resize();
    const observer=new ResizeObserver(()=>{const next=el.clientWidth;if(next!==width){width=next;resize();}});observer.observe(el);
    return()=>{observer.disconnect();fit.current=()=>{};};
  },[]);
  React.useLayoutEffect(()=>{fit.current();},[text]);
  return ref;
}
