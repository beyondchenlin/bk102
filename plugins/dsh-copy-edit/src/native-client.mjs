// 只发送身份/控制消息；媒体由宿主固定端点和授权文件句柄传输。
export function createNativeMediaClient(port,{newId,timeoutMs=8000}={}){
  const pending=new Map(),listeners=new Set();let closed=false;
  const receive=event=>{let body;try{body=JSON.parse(event.data);}catch{return;}if(!body||typeof body!=='object')return;if(body.event==='preview'){for(const listener of listeners)listener(body.value);return;}const item=pending.get(body.id);if(!item)return;pending.delete(body.id);clearTimeout(item.timer);body.ok===true?item.resolve(body.value):item.reject(Error(body.error||'原生媒体操作失败'));};
  if(port?.addEventListener)port.addEventListener('message',receive);
  else if(port)port.onmessage=receive;
  const call=(action,args={},id=newId())=>new Promise((resolve,reject)=>{
    if(closed||typeof port?.postMessage!=='function'){reject(Error('NATIVE_MEDIA_UNAVAILABLE'));return;}
    if(!/^[-a-fA-F0-9]{32,36}$/.test(id)||pending.has(id)){reject(Error('INVALID_REQUEST_ID'));return;}
    const wait=action==='import'?120000:action==='frame'?30000:timeoutMs;
    const timer=setTimeout(()=>{pending.delete(id);const error=Error('原生任务响应超时，请查询任务状态');error.code='NATIVE_RESPONSE_TIMEOUT';reject(error);},wait);
    pending.set(id,{resolve,reject,timer});
    try{port.postMessage(JSON.stringify({id,action,args}));}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
  });
  return {call,subscribePreview(listener){listeners.add(listener);return()=>listeners.delete(listener);},async capabilities(){try{const c=await call('capabilities');return c?.protocol===1&&c.available===true&&c.executionLocation==='android-local'?c:null;}catch{return null;}},close(){closed=true;listeners.clear();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('NATIVE_CLIENT_CLOSED'));}pending.clear();if(port?.removeEventListener)port.removeEventListener('message',receive);else if(port?.onmessage===receive)port.onmessage=null;}};
}
// start只发一次；应答丢失时凭同一个身份只读查询，不能回退到桌面重复编码。
export async function startNativeRender(client,request,onIdentity,newId){
  const jobId=newId(),job={...request,jobId,status:'running',executionLocation:'android-local',androidLocal:true};onIdentity(job);
  try{return {...job,...await client.call('start',request,jobId)};}catch(error){if(error.code==='NATIVE_RESPONSE_TIMEOUT')return job;onIdentity({...job,status:'failed',error:error.message});throw error;}
}
// 已排队的旧定位在开始前取消；已经解码的旧响应不覆盖最新画面。
export function scheduleNativeFrame(client,args,previous,publish,failed){
  let cancelled=false;const done=previous.then(async()=>{if(cancelled)return;const value=await client.call('frame',args);if(!cancelled)publish(value);}).catch(error=>{if(!cancelled)failed(error);});
  return {done,cancel(){cancelled=true;}};
}
