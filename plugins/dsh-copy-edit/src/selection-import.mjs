/** 素材库原片到 BK 草案；浏览器只保留无凭据的待恢复操作。 */
export function selectionSourceOrigin(value) {
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash||
     (u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('素材库地址须为 HTTPS 原点或本机 HTTP 原点');
  return u.origin;
}

export async function importSelection({origin,token,planId,revision,workspaceId,voiceFile,musicFile,stickerFile,storage,fetcher,uploadFile,newId,onProgress=()=>{}}) {
  origin=selectionSourceOrigin(origin);
  if(!/^[a-f0-9-]{36}$/i.test(planId)||!Number.isSafeInteger(revision)||revision<1||!token)throw Error('请填写素材库地址、口令、计划编号和版本');
  const key='dce.selection-import.v1:'+workspaceId+':'+origin+':'+planId+':'+revision;
  const save=value=>{storage.setItem(key,JSON.stringify(value));};
  let saved;try{saved=JSON.parse(storage.getItem(key)||'null');}catch{throw Error('导入恢复记录损坏，请先保留现场并检查');}
  const local=async(route,body)=>{
    const response=await fetcher('/api/copy-edit/draft/'+route,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok||!data.ok)throw Error('BK 导入失败：'+(data.error?.code||response.status));return data.value;
  };
  const caps=await local('capabilities');
  if(caps.workspaceId!==workspaceId||!['draft.atomic.v1','tracks.four.v1','source.pts.v1','source.mapping.v1'].every(x=>caps.features.includes(x)))throw Error('当前 BK 库或导入能力不匹配');
  if(saved?.workspaceId!==workspaceId||saved?.planId!==planId||saved?.revision!==revision){if(saved)throw Error('导入恢复记录身份不匹配');saved={workspaceId,planId,revision,operationId:newId()};save(saved);}
  const receipt=async()=>local('receipt?workspaceId='+encodeURIComponent(workspaceId)+'&operationId='+encodeURIComponent(saved.operationId));
  const verifyReceipt=(value,ticket)=>{if(value.workspaceId!==workspaceId||value.operationId!==saved.operationId||!ticket||value.planHash!==ticket.planHash||value.ticketId!==ticket.ticketId)throw Error('导入回执与恢复记录不匹配');return value;};
  let result=await receipt();if(result.status==='committed')return verifyReceipt(result,saved.ticket);
  const source=async(path)=>{
    const response=await fetcher(origin+path,{headers:{Authorization:'Bearer '+token},credentials:'omit',redirect:'error',cache:'no-store'});
    if(!response.ok)throw Error('素材库读取失败（'+response.status+'），请检查授权或计划版本');return response;
  };
  const sourceJson=async(path)=>{
    const response=await source(path);if(!response.body)throw Error('浏览器不支持有界素材读取');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256*1024){await reader.cancel();throw Error('素材库清单超过大小限制');}parts.push(part.value);}}
    finally{reader.releaseLock();}
    try{return JSON.parse(await new Blob(parts).text());}catch{throw Error('素材库清单格式无效');}
  };
  if(!saved.plan){
    const base='/v1/plans/'+encodeURIComponent(planId)+'/export', manifest=await sourceJson(base+'?revision='+revision);
    if(manifest.plan_id!==planId||manifest.revision!==revision||manifest.fps!==30||!Number.isSafeInteger(manifest.target_frames)||manifest.target_frames<1||manifest.target_frames>900)throw Error('素材库计划身份或时长不匹配');
    if(typeof manifest.text!=='string'||!Array.isArray(manifest.sentences)||!Array.isArray(manifest.assets)||!manifest.sentences.length||manifest.sentences.length>32||manifest.assets.length>32)throw Error('素材库清单无效');
    let cursor=0,copy='';const ids=new Set();
    for(const s of manifest.sentences){
      if(typeof s.text!=='string'||!Number.isSafeInteger(s.frames)||s.frames<1||s.timeline_start_frame!==cursor||!Number.isSafeInteger(s.gap_frames)||s.gap_frames<0||s.gap_frames>s.frames||(!s.selected&&s.gap_frames!==s.frames)||!/^[-\w]{1,70}$/.test(s.sentence_id)||ids.has(s.sentence_id))throw Error('素材库句子或时间范围无效');
      ids.add(s.sentence_id);cursor+=s.frames;copy+=s.text;
    }
    if(cursor!==manifest.target_frames||copy!==manifest.text)throw Error('素材库正文或时长不完整');
    if(voiceFile&&manifest.text.length>2000)throw Error('配音正文超过当前 BK 单段上限，请分段后导入');
    if(manifest.assets.reduce((n,a)=>n+(Number.isSafeInteger(a.bytes)?a.bytes:Infinity),0)>2*1024**3)throw Error('选中素材超过 BK 的 2 GiB 导入上限');
    const aliases=new Map(),assets=[],clips=[],gaps=[],warnings=[];
    for(const [i,item] of manifest.assets.entries()){
      if(item.bytes<1||item.bytes>512*1024*1024||!Number.isSafeInteger(item.bytes)||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('素材大小或摘要无效');
      onProgress('正在登记素材 '+(i+1)+' / '+manifest.assets.length);
      const response=await source(base+'/assets/'+encodeURIComponent(item.asset_id)+'?revision='+revision);
      if(!response.body)throw Error('浏览器不支持有界素材读取');
      const reader=response.body.getReader(),parts=[];let bytes=0;
      try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>item.bytes){await reader.cancel();throw Error('原素材长度已变化');}parts.push(part.value);}}
      finally{reader.releaseLock();}
      if(bytes!==item.bytes)throw Error('原素材长度已变化');
      const blob=new Blob(parts,{type:'video/mp4'});
      const registered=await uploadFile(new File([blob],'镜头 '+(i+1)+'.mp4',{type:'video/mp4'}));
      if(registered.kind!=='video'||registered.sha256!==item.sha256||registered.bytes!==item.bytes)throw Error('登记素材与计划摘要不一致');
      aliases.set(item.asset_id,registered);if(!assets.some(x=>x.assetId===registered.assetId))assets.push({assetId:registered.assetId,sha256:registered.sha256,bytes:registered.bytes,kind:'video'});
    }
    for(const s of manifest.sentences){
      const hit=s.selected,clipId='clip-'+s.sentence_id;
      if(!hit){gaps.push({gapId:'gap-'+s.sentence_id,startFrame:s.timeline_start_frame,frames:s.frames,text:s.text,reason:'没有可用素材'});continue;}
      const a=aliases.get(hit.asset_id);if(!a)throw Error('选中素材不在清单中');
      if(s.gap_frames)throw Error('选中素材时长不足，请先在素材库调整；原文和时长未改动');
      const mapped=await local('map-source',{workspaceId,assetId:a.assetId,sha256:a.sha256,bytes:a.bytes,startUs:hit.start_us,endUs:hit.end_us,frames:s.frames});
      clips.push({clipId,assetId:a.assetId,inUs:mapped.inUs,outUs:mapped.outUs});
      const details=[];
      for(const c of hit.name_conflicts||[])details.push('文案 '+c.requested+'，模型标注 '+c.annotated.join('、')+'；品类待核对');
      if(hit.unmatched_subjects?.length)details.push('描述未覆盖：'+hit.unmatched_subjects.join('、'));
      if(mapped.inUs!==hit.source_in_us||mapped.outUs!==hit.source_out_us)details.push('实际源帧边界：'+mapped.inUs+'–'+mapped.outUs+' 微秒（计划 '+hit.source_in_us+'–'+hit.source_out_us+'）');
      if(details.length){const warning={clipId,message:details.join('；').slice(0,1000)};if(hit.name_conflicts?.length)warnings.unshift(warning);else warnings.push(warning);}
    }
    const add=async(file,kind)=>{if(!file)return null;const a=await uploadFile(file);if(a.kind!==kind)throw Error('导入文件类型不匹配');if(!assets.some(x=>x.assetId===a.assetId))assets.push({assetId:a.assetId,sha256:a.sha256,bytes:a.bytes,kind});return a;};
    const stickerText=manifest.text.trim().split(/[。！？\n]/u)[0].slice(0,500);
    const image=await add(await stickerFile(stickerText),'image'),voice=await add(voiceFile,'audio'),music=await add(musicFile,'audio');
    if(voice&&(!Number.isSafeInteger(voice.durationUs)||voice.durationUs<1||Math.max(1,Math.ceil((voice.durationUs-1)*30/1e6))>manifest.target_frames))throw Error('配音长于画面计划，请调整配音或返回素材库修改时长');
    if(assets.length>64||assets.reduce((n,a)=>n+a.bytes,0)>2*1024**3)throw Error('选中素材与音频超过 BK 导入上限，请调整后重试');
    const plan={schemaVersion:1,draftId:planId,revision,requiredCapabilities:['draft.atomic.v1','tracks.four.v1','source.pts.v1','source.mapping.v1','gaps.persist.v1'],canvas:{width:1080,height:1920,fps:{numerator:30,denominator:1}},text:manifest.text,assets,clips,
      stickers:image?[{stickerId:'sticker-'+planId,assetId:image.assetId,text:stickerText,color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:230,width:1080,startFrame:0,endFrame:null}]:[],
      voices:voice?[{voiceId:'voice-'+planId,assetId:voice.assetId,text:manifest.text,inUs:0,outUs:voice.durationUs,startFrame:0,volume:1}]:[],
      music:music?[{musicId:'music-'+planId,assetId:music.assetId,startFrame:0,endFrame:null,offsetSamples:0,volume:.2}]:[],warnings,gaps};
    saved={...saved,plan,manifest};save(saved); // 先保存完整请求，再允许准备或提交。
  }
  // 恢复或提交前重新检查来源授权、素材身份和精确版本；已提交回执则在上方直接返回。
  const current=await sourceJson('/v1/plans/'+encodeURIComponent(planId)+'/export?revision='+revision);
  if(JSON.stringify(current)!==JSON.stringify(saved.manifest))throw Error('素材库计划或授权已变化，请重新选片');
  onProgress('正在准备工程');
  let ticket=saved.ticket;
  if(!ticket||ticket.expiresAt<=Date.now()){
    const prepared=await local('prepare',{workspaceId,operationId:saved.operationId,plan:saved.plan});
    if(prepared.status==='committed'){
      if(prepared.receipt.workspaceId!==workspaceId||prepared.receipt.operationId!==saved.operationId)throw Error('导入回执身份不匹配');
      return prepared.receipt; // prepare 已核对完整计划摘要。
    }
    ticket=prepared;saved={...saved,ticket};save(saved);
  }
  try{
    onProgress('正在提交工程');
    result=await local('commit',{workspaceId,operationId:saved.operationId,ticketId:ticket.ticketId,planHash:ticket.planHash});
  }catch(error){
    // 响应丢失先查询原回执；查询失败或未提交均交给用户继续同一操作。
    try{result=await receipt();}catch{throw error;}
    if(result.status!=='committed')throw error;
  }
  return verifyReceipt(result,ticket);
}
