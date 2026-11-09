// 只约束只读载入。超时不会重发保存、裁切或导出命令。
export async function boundedWorkspaceRead(read,{signal,timeoutMs=12000}={}){
  const controller=new AbortController();let timer,rejectWait;
  const cancelled=new Promise((_,reject)=>{rejectWait=reject;});
  const abort=()=>{const e=new Error('已取消载入');e.name='AbortError';controller.abort();rejectWait(e);};
  try{
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return await cancelled;}
    timer=setTimeout(()=>{rejectWait(new Error('载入超时，请重试；若仍失败，请重新打开 dsh web 的完整链接。'));controller.abort();},timeoutMs);
    return await Promise.race([Promise.resolve().then(()=>read(controller.signal)),cancelled]);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
