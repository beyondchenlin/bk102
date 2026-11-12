import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CreationJobs,creationSentences} from './creation-jobs.mjs';
import {CreationConnections,CreationQuestion,providerRequest,readBounded,validateOptions} from './creation-connections.mjs';
import {outputFrames} from './project.mjs';

const ref=a=>({assetId:a.assetId,sha256:a.sha256,bytes:a.bytes,kind:a.kind});
/** 编排在宿主保存，浏览器仅提供目标端媒体登记与文字绘制。 */
export class CreationService {
 constructor(store,drafts,{connections=new CreationConnections(store.root),fetcher=fetch}={}){
  this.store=store;this.drafts=drafts;this.jobs=new CreationJobs(store);this.connections=connections;this.fetcher=fetcher;this.active=new Map();this.cache=path.join(store.root,'creation-cache');
 }
 state(){return {workspaceId:this.store.workspaceId,jobs:this.jobs.list()};}
 async connectionsView(){try{const config=await this.connections.read();return {materialConfigured:!!config.material,speechConfigured:!!config.speech};}catch{return {materialConfigured:false,speechConfigured:false};}}
 async confirm(request){
  validateOptions(request.options||{});const answer=await this.jobs.confirm(request);
  if(answer.job){const j=this.jobs.row(answer.job.jobId);if(j.status==='queued'&&!j.settings){
   try{const {settings}=await this.connections.resolve(j,this.store.state);creationSentences(j.text);await this.store.write(s=>{const current=this.jobs.row(j.jobId,s);if(current.status==='queued'&&!current.settings)current.settings=settings;});}
   catch(e){await this.store.write(s=>{const current=this.jobs.row(j.jobId,s);if(current.status==='queued'){current.status=e.question?'needs_input':'failed';current.message=e.message;current.question=e.question||null;}});}
  }answer.job=this.jobs.public(this.jobs.row(j.jobId));}return answer;
 }
 async claim(jobId){
  if([...this.active.keys()].some(k=>k.startsWith(jobId+':')))return null;
  const claimed=await this.jobs.claim(jobId);if(!claimed)return null;
  try{
   const {settings}=await this.connections.resolve(claimed,this.store.state),sentences=creationSentences(claimed.text);
   await this.jobs.update(jobId,claimed.lease.id,j=>{j.settings=settings;j.sentences=sentences;j.message='正在准备配音和音乐';});
   return {jobId,leaseId:claimed.lease.id,text:claimed.text,sentences,settings,steps:claimed.steps};
  }catch(e){await this.jobs.fail(jobId,claimed.lease.id,e.message,e.question||null);return null;}
 }
 /** @param {string} jobId @param {string} action @param {{options?:any,retrySpeech?:boolean,remember?:boolean}} settings */
 async control(jobId,action,{options,retrySpeech=false,remember=false}={}){
  if(action==='pause')for(const [key,value]of this.active)if(key.startsWith(jobId+':'))value.controller.abort();
  if(options||retrySpeech){
   if(action!=='resume')throw Error('只能在继续任务时补充设置');
   if([...this.active.keys()].some(k=>k.startsWith(jobId+':')))throw Error('当前步骤仍在结束，请稍后继续');
   if(options)validateOptions(options);
   await this.store.write(s=>{
    const j=this.jobs.row(jobId,s);if(j.status==='running'||j.status==='complete')throw Error('当前任务不能更换设置');
    if(options){if(j.settings)throw Error('已执行任务的声音与画面设置已固定；更换风格请生成新一版');j.options={...j.options,...options};if(remember)s.creationDefaults={...s.creationDefaults,...options};}
    if(retrySpeech)for(const [key,value]of Object.entries(j.steps))if(key.startsWith('speech:')&&value.status==='started')j.steps[key]={status:'retry_approved',attempt:(value.attempt||0)+1};
   });
  }
  return this.jobs.control(jobId,action);
 }
 async single(key,signal,run){
  if(this.active.has(key))throw Error('该步骤仍在执行，请稍后继续');
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  const value={controller,promise:null};this.active.set(key,value);
  value.promise=run(controller.signal);
  try{return await value.promise;}finally{signal?.removeEventListener('abort',abort);this.active.delete(key);}
 }
 async close(){for(const value of this.active.values())value.controller.abort();await Promise.allSettled([...this.active.values()].map(v=>v.promise));}
 async speech(jobId,leaseId,index,signal){
  return this.single(jobId+':speech:'+index,signal,async signal=>{
   const j=this.jobs.checked(this.store.state,jobId,leaseId);
   if(!j.settings?.narration||!Number.isInteger(index)||index<0||index>=j.sentences.length)throw Error('配音句子无效');
   const {config}=await this.connections.resolve(j,this.store.state),key='speech:'+index,file=path.join(this.cache,jobId+'-'+index+'.wav');
   await fs.mkdir(this.cache,{recursive:true});if((await fs.lstat(this.cache)).isSymbolicLink())throw Error('配音缓存路径无效');
   let bytes;
   try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024**2)throw Error('配音缓存无效');bytes=await fs.readFile(file);}
   catch(e){if(e.code!=='ENOENT')throw e;}
   let saved=j.steps[key];
   if(!bytes){
    if(saved?.status==='ready')throw Error('已生成的配音文件缺失，请恢复文件后继续');
    if(saved?.status==='started'&&!config.speech.idempotent)throw new CreationQuestion('上一段配音的服务回执不确定。请核对服务记录；确认需要重新合成后再重试这一段，可能产生一次额外费用。');
    const space=await fs.statfs(this.cache,{bigint:true});if(space.bavail*space.bsize<64n*1024n**2n)throw Error('配音缓存空间不足，文案与任务已保留');
    await this.jobs.update(jobId,leaseId,current=>{saved=current.steps[key]={status:'started',attempt:saved?.attempt||0};current.message='正在生成配音 '+(index+1)+' / '+j.sentences.length;});
    const response=await providerRequest(config.speech.endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(config.speech.token?{Authorization:'Bearer '+config.speech.token}:{}),...(config.speech.idempotent?{'Idempotency-Key':jobId+'-'+index+'-'+saved.attempt}:{})},body:JSON.stringify({model:config.speech.model,voice:j.settings.voice,input:j.sentences[index],speed:j.settings.speed,response_format:'wav'}),signal},'配音服务',this.fetcher);
    bytes=await readBounded(response,10*1024**2);
    if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('配音服务没有返回有效 WAV 音频');
    // 完整响应先持久写盘；断线恢复可读回，不再次调用合成。
    const temporary=file+'.pending';let handle;
    try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await fs.rename(temporary,file);}
    finally{await handle?.close();await fs.rm(temporary,{force:true});}
   }
   const identity={status:'ready',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),attempt:saved?.attempt||0};
   if(saved?.status==='ready'&&(saved.sha256!==identity.sha256||saved.bytes!==identity.bytes))throw Error('配音缓存身份已变化');
   await this.jobs.update(jobId,leaseId,current=>{current.steps[key]=identity;});
   return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store'}});
  });
 }
 async source(j,route,{signal,body}={}){
  const {config}=await this.connections.resolve(j,this.store.state);
  return providerRequest(config.material.origin+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.material.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal},'素材库',this.fetcher);
 }
 async jsonSource(j,route,options){const response=await this.source(j,route,options);try{return JSON.parse((await readBounded(response,256*1024)).toString('utf8'));}catch(e){if(e.message.includes('超过'))throw e;throw Error('素材库返回的计划格式无效');}}
 async selection(jobId,leaseId,signal){return this.single(jobId+':selection',signal,async signal=>{
  const j=this.jobs.checked(this.store.state,jobId,leaseId);if(!j.settings)throw Error('请先领取任务');
  let frames;
  if(j.settings.narration){frames=j.sentences.map((_,i)=>{const a=this.store.state.assets.find(a=>a.assetId===j.steps['asset:voice:'+i]);if(!a)throw Error('配音尚未登记');return outputFrames(a.durationUs);});}
  else{const count=j.sentences.length,total=j.settings.targetFrames;frames=j.sentences.map((_,i)=>Math.floor(total/count)+(i<total%count?1:0));}
  const total=frames.reduce((a,b)=>a+b,0);
  if(total>900||frames.some(f=>f<1))throw new CreationQuestion('这份文案的实际配音超过自动选片当前的 30 秒范围。文案和配音已保留，请缩短文案后生成新一版。');
  let identity=j.selection;
  if(!identity){
   await this.jobs.update(jobId,leaseId,current=>{current.message='正在按文案查找画面';});
   const plan=await this.jsonSource(j,'/v1/plans',{signal,body:{operation_id:jobId,text:j.text,target_frames:total,durations_frames:frames}});
   if(!/^[a-f0-9-]{36}$/i.test(plan.plan_id)||!Number.isSafeInteger(plan.revision)||plan.revision<1)throw Error('素材库计划身份无效');
   identity={planId:plan.plan_id,revision:plan.revision};await this.jobs.update(jobId,leaseId,current=>{current.selection=identity;});
  }
  const manifest=await this.jsonSource(j,'/v1/plans/'+identity.planId+'/export?revision='+identity.revision,{signal});
  validateManifest(manifest,j,frames,identity);
  if(j.manifest&&JSON.stringify(j.manifest)!==JSON.stringify(manifest))throw Error('原选片清单已变化，请恢复原计划后继续');
  await this.jobs.update(jobId,leaseId,current=>{current.manifest=manifest;current.message='正在登记选中的画面';});
  if(manifest.sentences.some(s=>!s.selected||s.gap_frames))throw new CreationQuestion('当前素材中有句子缺少足够画面。文案和配音已保留；补充素材后可生成新一版，或先调整对应句子。');
  return {assets:manifest.assets};
 }).catch(async e=>{if(e.question)await this.jobs.fail(jobId,leaseId,e.message,e.question).catch(()=>{});throw e;});}
 async asset(jobId,leaseId,assetId,signal){
  const j=this.jobs.checked(this.store.state,jobId,leaseId),item=j.manifest?.assets.find(a=>a.asset_id===assetId);
  if(!item)throw Error('素材不属于当前生成任务');
  const response=await this.source(j,'/v1/plans/'+j.selection.planId+'/export/assets/'+encodeURIComponent(assetId)+'?revision='+j.selection.revision,{signal});
  // 浏览器同样按清单限制大小；登记端重算 SHA，绝不信任下载名称。
  return new Response(response.body,{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store'}});
 }
 async complete(jobId,leaseId){return this.single(jobId+':commit',null,async signal=>{
  const j=this.jobs.checked(this.store.state,jobId,leaseId),manifest=j.manifest;
  if(!manifest)throw Error('选片尚未完成');
  const current=await this.jsonSource(j,'/v1/plans/'+j.selection.planId+'/export?revision='+j.selection.revision,{signal});
  if(JSON.stringify(current)!==JSON.stringify(manifest))throw Error('素材库计划或授权已变化');
  await this.jobs.update(jobId,leaseId,current=>{current.message='正在加载时间线';});
  const assets=new Map(),get=(key,kind)=>{const a=this.store.state.assets.find(a=>a.assetId===j.steps[key]);if(!a||a.kind!==kind)throw Error('生成媒体尚未准备完成');assets.set(a.assetId,ref(a));return a;};
  const clips=[],voices=[],warnings=[];
  for(const [i,s]of manifest.sentences.entries()){
   if(!s.selected||s.gap_frames)throw Error('当前仍有画面缺口');
   const a=get('asset:video:'+s.selected.asset_id,'video'),clipId='clip-'+i;
   const mapped=await this.drafts.mapSource({workspaceId:this.store.workspaceId,assetId:a.assetId,sha256:a.sha256,bytes:a.bytes,startUs:s.selected.start_us,endUs:s.selected.end_us,frames:s.frames});
   clips.push({clipId,assetId:a.assetId,inUs:mapped.inUs,outUs:mapped.outUs,sourceVolume:j.settings.sourceVolume});
   const details=[];for(const c of s.selected.name_conflicts||[])details.push('文案 '+c.requested+'，素材标注 '+c.annotated.join('、'));
   if(s.selected.unmatched_subjects?.length)details.push('描述未覆盖：'+s.selected.unmatched_subjects.join('、'));
   if(details.length)warnings.push({clipId,message:details.join('；').slice(0,1000)});
   if(j.settings.narration){const voice=get('asset:voice:'+i,'audio');voices.push({voiceId:'voice-'+i,assetId:voice.assetId,text:s.text,inUs:0,outUs:voice.durationUs,startFrame:s.timeline_start_frame,volume:1});}
  }
  const image=get('asset:sticker:0','image'),music=[];
  if(j.settings.musicAssetId){const a=this.store.state.assets.find(a=>a.assetId===j.settings.musicAssetId&&a.kind==='audio');if(!a)throw Error('背景音乐已不可用');assets.set(a.assetId,ref(a));music.push({musicId:'music',assetId:a.assetId,startFrame:0,endFrame:null,offsetSamples:0,volume:j.settings.musicVolume});}
  const plan={schemaVersion:1,draftId:j.jobId,revision:1,requiredCapabilities:['draft.atomic.v1','tracks.four.v1','source.pts.v1','source.mapping.v1'],canvas:{width:1080,height:1920,fps:{numerator:30,denominator:1}},text:j.text,assets:[...assets.values()],clips,voices,music,warnings,gaps:[],stickers:[{stickerId:'title',assetId:image.assetId,text:j.sentences[0].trim(),color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:230,width:1080,startFrame:0,endFrame:null}]};
  const request={workspaceId:this.store.workspaceId,operationId:jobId},ticket=await this.drafts.prepare({...request,plan});
  const guard=s=>this.jobs.checked(s,jobId,leaseId),afterCommit=(s,r)=>this.jobs.finish(this.jobs.row(jobId,s),s,r);
  if(ticket.status==='committed')throw Error('该工程已提交，请重新读取任务状态');
  await this.drafts.commit({...request,ticketId:ticket.ticketId,planHash:ticket.planHash},{guard,afterCommit});
  // 成功后缓存只是已登记音频的第二份，逐个回收本服务拥有的文件。
  for(let i=0;i<j.sentences.length;i++)await fs.rm(path.join(this.cache,jobId+'-'+i+'.wav'),{force:true}).catch(()=>{});
  return this.jobs.public(this.jobs.row(jobId));
 });}
 async response(request){
  const u=new URL(request.url),jobId=u.searchParams.get('jobId'),leaseId=u.searchParams.get('leaseId');
  try{
   if(u.pathname.endsWith('/speech')&&request.method==='POST'){const response=await this.speech(jobId,leaseId,Number(u.searchParams.get('index')),request.signal);if(!response)throw Error('配音未返回');return response;}
   if(u.pathname.endsWith('/asset')&&request.method==='GET')return await this.asset(jobId,leaseId,u.searchParams.get('assetId'),request.signal);
   return new Response(null,{status:404});
  }catch(e){if(e.question)await this.jobs.fail(jobId,leaseId,e.message,e.question).catch(()=>{});return Response.json({ok:false,error:e.message},{status:409,headers:{'Cache-Control':'no-store'}});}
 }
}
function validateManifest(m,j,frames,identity){
 if(m.plan_id!==identity.planId||m.revision!==identity.revision||m.text!==j.text||m.fps!==30||m.target_frames!==frames.reduce((a,b)=>a+b,0)||!Array.isArray(m.sentences)||m.sentences.length!==j.sentences.length||!Array.isArray(m.assets)||m.assets.length>32)throw Error('素材库正文或时长不匹配');
 let cursor=0;const ids=new Set();
 for(const [i,s]of m.sentences.entries()){if(s.text!==j.sentences[i]||s.frames!==frames[i]||s.timeline_start_frame!==cursor||!Number.isInteger(s.gap_frames)||s.gap_frames<0||s.gap_frames>s.frames)throw Error('素材库逐句范围无效');cursor+=s.frames;}
 for(const a of m.assets){if(!/^[-\w]{1,80}$/.test(a.asset_id)||ids.has(a.asset_id)||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>512*1024**2||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('素材库媒体身份无效');ids.add(a.asset_id);}
 if(m.assets.reduce((n,a)=>n+a.bytes,0)>2*1024**3)throw Error('本次素材超过 2 GiB 导入上限');
 for(const s of m.sentences)if(s.selected&&!ids.has(s.selected.asset_id))throw Error('选中画面不在素材清单中');
}
