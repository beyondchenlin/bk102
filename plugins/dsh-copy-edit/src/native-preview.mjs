// Android本地结果由Media3呈现；桌面和旧宿主仍使用HTML播放器。
// 每个控件实例有独立身份；迟到的关闭/定位不能影响后来打开的播放器。
export function createNativePreviewPlayer(element,{client,jobId,newId,onPreparing=()=>{},onRunning=()=>{},onPosition=()=>{},onError=()=>{},onEnded=()=>{}}){
  const playbackId=newId(),win=element.ownerDocument.defaultView,doc=element.ownerDocument;
  let disposed=false,generation=0,state={sequence:-1,position:0},waiter=null,frame=0,lastBounds='',endedCommand=-1,lastError='';
  const aborted=()=>Object.assign(Error('预览已取消'),{name:'AbortError'});
  const cancel=()=>{generation++;if(waiter){clearTimeout(waiter.timer);waiter.reject(aborted());waiter=null;}};
  const accept=value=>{
    if(disposed||value?.playbackId!==playbackId||!Number.isFinite(value.sequence)||value.sequence<state.sequence)return;
    state=value;onPreparing(!!value.preparing);onRunning(!!value.running);onPosition(value.position);
    if(value.error&&value.error!==lastError){lastError=value.error;onError(Error(value.error));}else if(!value.error)lastError='';
    if(value.ended&&endedCommand!==value.command){endedCommand=value.command;onEnded();}
    if(waiter&&value.command>=waiter.command){
      if(value.command>waiter.command){cancel();}
      else if(value.error){const w=waiter;waiter=null;clearTimeout(w.timer);w.reject(Error(value.error));}
      else if(!value.preparing&&(!waiter.resume||value.running||value.ended)){const w=waiter;waiter=null;clearTimeout(w.timer);w.resolve();}
    }
  };
  const unsubscribe=client.subscribePreview(accept);
  const bounds=()=>{const r=element.getBoundingClientRect(),clear=(x,y)=>{const hit=doc.elementFromPoint(x,y);return hit===element||element.contains(hit);};return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:win.innerWidth,visible:!doc.hidden&&r.width>0&&r.height>0&&[[.5,.5],[.01,.01],[.99,.01],[.01,.99],[.99,.99]].every(([x,y])=>clear(r.x+r.width*x,r.y+r.height*y))};};
  const opened=client.call('previewOpen',{jobId,playbackId,bounds:bounds()}).then(value=>{accept(value);return value;});
  // 生命周期可能在open响应前结束，所有后续命令仍只指向本实例。
  const command=async(command,args={})=>{await opened;const value=await client.call('preview',{playbackId,command,...args});accept(value);return value;};
  const layout=()=>{frame=0;if(disposed)return;const value=bounds();const json=JSON.stringify(value);if(json===lastBounds)return;lastBounds=json;void command('layout',{bounds:value}).catch(error=>{if(!disposed)onError(error);});};
  const schedule=()=>{if(!disposed&&!frame)frame=win.requestAnimationFrame(layout);};
  const resize=new win.ResizeObserver(schedule);resize.observe(element);
  const mutations=new win.MutationObserver(schedule);mutations.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden']});
  win.addEventListener('resize',schedule);win.addEventListener('scroll',schedule,true);doc.addEventListener('visibilitychange',schedule);
  async function seek(position,resume=false){
    if(disposed)throw aborted();cancel();const own=generation;onPreparing(true);try{await opened;if(disposed||generation!==own)throw aborted();
    const value=await command('seek',{position,resume});if(disposed||generation!==own)throw aborted();
    if(value.error)throw Error(value.error);
    if(!state.preparing&&(!resume||state.running||state.ended))return;
    await new Promise((resolve,reject)=>{waiter={command:value.command,resume,resolve,reject,timer:setTimeout(()=>{waiter=null;void command('pause').catch(()=>{});reject(Error('原生预览准备超时，请重试'));},11000)};accept(state);});
    }finally{if(!disposed&&generation===own)onPreparing(false);}
  }
  return {playFrom:position=>seek(position,true),seek,position:()=>state.position,
    async readPosition(){const value=await command('state');return value.position;},
    pause(){cancel();onPreparing(false);onRunning(false);void command('pause').catch(error=>{if(!disposed)onError(error);});},
    dispose(){if(disposed)return;disposed=true;cancel();unsubscribe();resize.disconnect();mutations.disconnect();win.cancelAnimationFrame(frame);win.removeEventListener('resize',schedule);win.removeEventListener('scroll',schedule,true);doc.removeEventListener('visibilitychange',schedule);
      // open应答可能丢失，不能等它成功才释放；同一通道按序处理，身份隔离迟到关闭。
      void client.call('preview',{playbackId,command:'close'}).catch(()=>{});}
  };
}
