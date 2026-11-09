// 预览准备与播放分开：元数据、定位、缓冲和首帧提交都就绪后才推进时钟。
// 每次请求有独立代次；离开工程、重新裁切或取消时，旧请求不能再触发播放。
function createPreviewPlayer(video,{duration,onPreparing=()=>{},onRunning=()=>{},onPosition=()=>{},onError=()=>{},onEnded=()=>{}}={}) {
  let disposed=false,active=null,frameRequest=0,lastFrame=null,stallTimer=0,endTimer=0,completed=false;
  const listeners=[];
  const on=(name,fn)=>{video.addEventListener(name,fn);listeners.push([name,fn]);};
  const aborted=()=>Object.assign(Error('预览已取消'),{name:'AbortError'});
  const sample=(_,metadata)=>{lastFrame=metadata.mediaTime;active?.checkFrame?.();if(!disposed)frameRequest=video.requestVideoFrameCallback(sample);};
  if(video.requestVideoFrameCallback)frameRequest=video.requestVideoFrameCallback(sample);
  const clearStall=()=>{clearTimeout(stallTimer);stallTimer=0;};
  const endTime=()=>Number.isFinite(duration)&&duration>0?Math.min(duration,video.duration):video.duration;
  const clearEnd=()=>{clearTimeout(endTimer);endTimer=0;};
  const finish=()=>{if(completed)return;completed=true;clearEnd();clearStall();video.pause();onPreparing(false);onRunning(false);onPosition(endTime());onEnded();};
  const watchEnd=()=>{clearEnd();if(disposed||video.paused||!Number.isFinite(endTime()))return;if(video.currentTime>=endTime()){finish();return;}endTimer=setTimeout(watchEnd,Math.max(1,(endTime()-video.currentTime)*1000));};
  on('playing',()=>{clearStall();onPreparing(false);onRunning(true);watchEnd();});
  on('waiting',()=>{if(video.paused)return;onRunning(false);onPreparing(true);clearStall();stallTimer=setTimeout(()=>{if(disposed||video.paused||active)return;pause();onError(Error('预览缓冲超时，请重试'));},10000);});
  on('pause',()=>{clearEnd();clearStall();onPreparing(false);onRunning(false);onPosition(Math.min(video.currentTime,endTime()));});
  on('ended',finish);
  on('error',()=>{clearStall();video.pause();onPreparing(false);onRunning(false);if(!active)onError(Error('预览视频读取失败，请重新准备'));});
  on('timeupdate',()=>{if(!video.paused&&video.currentTime>=endTime())finish();else onPosition(Math.min(video.currentTime,endTime()));});
  function cancel(){const previous=active;active=null;previous?.controller.abort();onPreparing(false);}
  function pause(){clearEnd();clearStall();cancel();video.pause();onRunning(false);}
  async function prepare(position,resume=true) {
    if(disposed)throw aborted();
    cancel();video.pause();completed=false;onRunning(false);
    const request={controller:new AbortController(),checkFrame:null};active=request;
    const {signal}=request.controller;onPreparing(true);
    const check=()=>{if(disposed||active!==request||signal.aborted)throw aborted();if(video.error)throw Error('预览视频读取失败，请重新准备');};
    // 所有监听都有截止和撤销；失败只报错，不冒充就绪或偷偷重播。
    function wait(test,events,label){
      return new Promise((resolve,reject)=>{
        let timer;
        const cleanup=()=>{clearTimeout(timer);for(const name of events)video.removeEventListener(name,probe);video.removeEventListener('error',probe);signal.removeEventListener('abort',probe);if(request.checkFrame===probe)request.checkFrame=null;};
        function probe(){try{check();if(!test())return;cleanup();resolve();}catch(e){cleanup();reject(e);}}
        for(const name of events)video.addEventListener(name,probe);video.addEventListener('error',probe);signal.addEventListener('abort',probe);
        request.checkFrame=probe;timer=setTimeout(()=>{cleanup();reject(Error(label+'超时，请重试预览'));},10000);probe();
      });
    }
    try {
      await wait(()=>video.readyState>=1,['loadedmetadata'],'读取预览');check();
      // 部分Android WebView把AAC priming算进duration；工程端点以冻结计划为准。
      const target=Math.max(0,Math.min(Number.isFinite(position)?position:0,Math.max(0,endTime()-1/30)));
      // 代理固定 30fps。按输出帧号匹配，不能把接缝前一帧当成目标首帧。
      const atTarget=()=>lastFrame!==null&&Math.floor(lastFrame*30+.0001)===Math.floor(target*30+.0001);
      // 控制器挂载前可能已经提交首帧；同位置seek不保证再触发rVFC。
      // 先定位相邻帧再回来，让就绪判断仍以实际提交的目标帧为准。
      if(video.requestVideoFrameCallback&&lastFrame===null&&!video.seeking&&video.readyState>=3&&Math.abs(video.currentTime-target)<.001&&endTime()>1/30){
        video.currentTime=target+1/30<endTime()?target+1/30:Math.max(0,target-1/30);
        await wait(()=>!video.seeking&&video.readyState>=3,['seeked','canplay','loadeddata'],'准备定位');check();
      }
      const needsSeek=video.seeking||Math.abs(video.currentTime-target)>.001||!atTarget();
      // Chromium 的 currentTime 会量化至微秒；59/30 可能落为 1.966666，解码成前一帧。
      // 只向目标帧内部移动至多约 1us，逻辑位置与工程/编码时间戳保持原值。
      if(needsSeek){
        // 同一输出帧内定位时，WebView可能不再发出帧回调；已提交且未在定位的目标帧仍有效。
        if(video.seeking||!atTarget())lastFrame=null;
        video.currentTime=Math.max(target,Math.floor(target*30+.0001)/30+.000001);
      }
      await wait(()=>!video.seeking&&video.readyState>=3,['seeked','canplay','canplaythrough','loadeddata'],'定位预览');check();
      if(video.requestVideoFrameCallback)await wait(atTarget,[],'准备首帧');
      check();
      // 首帧回调在合成提交时触发；跨两个绘制机会，让新播放器布局与画面先落地。
      await new Promise((resolve,reject)=>{
        let frame=0,timer;
        const cleanup=()=>{cancelAnimationFrame(frame);clearTimeout(timer);signal.removeEventListener('abort',stop);};
        const stop=()=>{cleanup();reject(aborted());};signal.addEventListener('abort',stop);
        timer=setTimeout(()=>{cleanup();reject(Error('预览窗口尚未就绪，请重试'));},10000);
        frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{cleanup();resolve();});});
      });check();onPosition(target);
      if(resume){
        // 某些WebView在音频设备异常后不结算play Promise，仍须可取消且有截止。
        await new Promise((resolve,reject)=>{
          let timer,settled=false;
          const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',stop);video.removeEventListener('error',fail);error?reject(error):resolve();};
          const stop=()=>finish(aborted()),fail=()=>finish(Error('预览视频读取失败，请重新准备'));
          signal.addEventListener('abort',stop);video.addEventListener('error',fail);
          timer=setTimeout(()=>{if(active===request)video.pause();finish(Error('启动预览超时，请重试'));},10000);
          try{Promise.resolve(video.play()).then(()=>{try{check();finish();}catch(e){finish(e);}},finish);}catch(e){finish(e);}
        });check();
      }
    } finally {if(active===request){active=null;onPreparing(false);}}
  }
  return {playFrom:position=>prepare(position,true),seek:(position,resume=false)=>prepare(position,resume),pause,
    dispose(){if(disposed)return;disposed=true;pause();if(frameRequest)video.cancelVideoFrameCallback(frameRequest);for(const [name,fn]of listeners)video.removeEventListener(name,fn);}};
}
module.exports={createPreviewPlayer};
