/** 桌面和手机共用执行器；RPC 保存阶段结果，页面存储不承担任务真相。 */
export async function runCreation(job,{rpc,fetcher,uploadFile,stickerFile,signal,maxImportBytes=512*1024**2}){
 const identity={jobId:job.jobId,leaseId:job.leaseId},steps={...job.steps};
 const check=()=>{if(signal?.aborted)throw Error('生成已暂停，已完成内容保留');};
 const call=(name,args={})=>{check();return rpc('creation'+name,{...identity,...args},{signal});};
 const file=async(route,query,kind,name,limit)=>{
  check();const response=await fetcher('/api/copy-edit/creation/'+route+'?'+new URLSearchParams({...identity,...query}),{method:route==='speech'?'POST':'GET',credentials:'same-origin',signal});
  if(!response.ok){let error;try{error=(await response.json()).error;}catch{}throw Error(error||'生成媒体暂不可用');}
  if(!response.body)throw Error('当前浏览器不支持媒体传输');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit){await reader.cancel();throw Error('生成媒体超过大小限制');}parts.push(chunk.value);}}
  finally{reader.releaseLock();}
  return new File(parts,name,{type:kind});
 };
 const register=async(key,makeFile)=>{
  if(steps[key])return;const value=await makeFile();check();const asset=await uploadFile(value,signal);check();
  await call('Checkpoint',{key,assetId:asset.assetId});steps[key]=asset.assetId;
 };
 if(job.settings.narration)for(let i=0;i<job.sentences.length;i++)await register('asset:voice:'+i,()=>file('speech',{index:String(i)},'audio/wav','旁白 '+(i+1)+'.wav',10*1024**2));
 const selection=await call('Selection');
 if(selection.assets.some(a=>a.bytes>maxImportBytes))throw Error('选中的原片超过当前设备导入大小限制，任务已保留');
 for(const [i,asset]of selection.assets.entries())await register('asset:video:'+asset.asset_id,()=>file('asset',{assetId:asset.asset_id},'video/mp4','画面 '+(i+1)+'.mp4',asset.bytes));
 await register('asset:sticker:0',()=>stickerFile(job.sentences[0].trim()));
 return call('Complete');
}

/** 多页面通过宿主租约竞争，失联租约才可接续；没有可用媒体执行端不抢任务。 */
export function startCreationWorker({rpc,fetcher,adapter,onState=()=>{},intervalMs=1800}){
 let disposed=false,busy=false,current=null;const lifetime=new AbortController();
 const tick=async()=>{
  if(disposed||busy)return;busy=true;
  let release;
  try{
   const state=await rpc('creationState',{}, {signal:lifetime.signal});onState(state);
   const candidate=state.jobs.find(j=>['queued','running'].includes(j.status));if(!candidate)return;
   const execution=await adapter();if(!execution)return;release=execution.release;
   const job=await rpc('creationClaim',{jobId:candidate.jobId},{signal:lifetime.signal});if(!job)return;
   const controller=new AbortController();current={controller,jobId:job.jobId};const stop=()=>controller.abort();lifetime.signal.addEventListener('abort',stop,{once:true});if(lifetime.signal.aborted)stop();
   const identity={jobId:job.jobId,leaseId:job.leaseId};let heartbeatBusy=false;
   const heartbeat=setInterval(async()=>{
    if(heartbeatBusy||controller.signal.aborted)return;heartbeatBusy=true;
    try{await rpc('creationHeartbeat',identity,{signal:controller.signal});const state=await rpc('creationState',{}, {signal:controller.signal});if(!disposed)onState(state);}catch{controller.abort();}finally{heartbeatBusy=false;}
   },10000);
   try{await runCreation(job,{rpc,fetcher,...execution,signal:controller.signal});}
   catch(e){if(!disposed)await rpc('creationFail',{...identity,message:e.message}).catch(()=>{});}
   finally{clearInterval(heartbeat);lifetime.signal.removeEventListener('abort',stop);current=null;}
   if(!disposed)onState(await rpc('creationState',{}, {signal:lifetime.signal}));
  }catch{/* 短暂连接失败只读重试；业务恢复由持久阶段和租约控制。 */}
  finally{release?.();busy=false;}
 };
 const timer=setInterval(()=>void tick(),intervalMs);void tick();
 return {wake:()=>void tick(),abortCurrent:jobId=>{if(current?.jobId===jobId)current.controller.abort();},close(){disposed=true;lifetime.abort();current?.controller.abort();clearInterval(timer);}};
}
