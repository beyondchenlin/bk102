import fs from 'node:fs/promises';
import path from 'node:path';
import {selectionSourceOrigin} from './selection-import.mjs';
import {digest} from './project.mjs';

export class CreationQuestion extends Error {
 constructor(message){super(message);this.question=message;}
}
const boundedString=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
function speechEndpoint(v){
 const url=new URL(v);selectionSourceOrigin(url.origin);
 if(url.username||url.password||url.search||url.hash)throw Error('配音连接地址不能包含凭据或参数');
 return url.href;
}
/** 部署时连接一次。配置文件不进入 workspace、模型输入、工程或浏览器缓存。 */
export class CreationConnections {
 constructor(root,{file=process.env.DSH_COPY_EDIT_CONNECTIONS||path.join(root,'connections.json')}={}){this.file=file;}
 async read(){
  let raw;
  try{const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('连接配置无效');raw=JSON.parse(await fs.readFile(this.file,'utf8'));}
  catch(e){if(e.code==='ENOENT')return {};throw Error('生成连接配置不可读取，请检查连接设置');}
  if(!raw||raw.version!==1)throw Error('不支持的生成连接配置');
  const material=raw.material?{origin:selectionSourceOrigin(raw.material.origin),token:raw.material.token}:null;
  if(material&&!boundedString(material.token,4096))throw Error('素材库连接凭据无效');
  const speech=raw.speech?{endpoint:speechEndpoint(raw.speech.endpoint),token:raw.speech.token||'',model:raw.speech.model,voice:raw.speech.voice,idempotent:raw.speech.idempotent===true}:null;
  if(speech&&(!boundedString(speech.model,100)||!boundedString(speech.voice,120)||(speech.token&&!boundedString(speech.token,4096))))throw Error('配音连接配置无效');
  const defaults=raw.defaults||{};
  validateOptions(defaults);
  return {material,speech,defaults};
 }
 async resolve(job,state){
  const config=await this.read();
  if(job.settings){
   if(!config.material||digest(config.material.origin)!==job.settings.materialIdentity)throw new CreationQuestion('素材库连接已变化，请恢复原连接后继续本次生成');
   if(job.settings.narration&&(!config.speech||digest({endpoint:config.speech.endpoint,model:config.speech.model})!==job.settings.speechIdentity))throw new CreationQuestion('配音连接已变化，请恢复原连接后继续本次生成');
   return {config,settings:job.settings};
  }
  const p=state.projects.find(p=>p.projectId===job.sourceProjectId),defaults={...config.defaults,...state.creationDefaults},options=job.options;
  validateOptions(options);
  const settings={narration:options.narration??defaults.narration??true,targetFrames:options.targetFrames??defaults.targetFrames??300,sourceVolume:options.sourceVolume??(p?.clips.length?(p.clips[0].sourceVolume??1):defaults.sourceVolume??0),musicVolume:options.musicVolume??p?.audio.bgm?.volume??defaults.musicVolume??.2};
  const selection=state.voiceSettings?.selections[job.sourceProjectId],voiceId=options.voiceId??selection?.voiceId??defaults.voiceId;
  let provider=state.voiceSettings?.providers[selection?.source],voice=provider?.voices.find(v=>v.voiceId===voiceId);
  if(voiceId&&!voice){for(const value of Object.values(state.voiceSettings?.providers||{})){voice=value.voices.find(v=>v.voiceId===voiceId);if(voice){provider=value;break;}}if(!voice)throw new CreationQuestion('所选声音已不存在，请选择一个已保存的声音');}
  settings.voice=voice?.remoteId||config.speech?.voice;
  settings.speed=options.speed??selection?.rate??defaults.speed??1;
  settings.musicAssetId=options.musicAssetId!==undefined?options.musicAssetId:(p?.audio.bgm?.assetId??(p?.audio.bgmConfigured?null:defaults.musicAssetId));
  const missing=[];
  if(!config.material)missing.push('连接素材库');
  if(settings.narration&&(!config.speech||!settings.voice||voice?.referenceAssetId&&!voice.remoteId))missing.push('配置可用的旁白声音，或选择不加旁白');
  if(settings.narration&&voice&&config.speech&&((provider.endpoint&&provider.endpoint!==config.speech.endpoint)||(provider.model&&provider.model!==config.speech.model)))missing.push('连接所选声音所属的配音服务');
  if(settings.musicAssetId===undefined)missing.push('选择背景音乐，或选择不加音乐');
  if(settings.musicAssetId!==undefined&&settings.musicAssetId!==null&&!state.assets.some(a=>a.assetId===settings.musicAssetId&&a.kind==='audio'))missing.push('重新选择可用的背景音乐');
  if(missing.length)throw new CreationQuestion('文案已保存。还需要'+missing.join('；')+'。');
  settings.materialIdentity=digest(config.material.origin);
  if(settings.narration)settings.speechIdentity=digest({endpoint:config.speech.endpoint,model:config.speech.model});
  return {config,settings};
 }
}
export function validateOptions(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['narration','voiceId','speed','musicAssetId','musicVolume','sourceVolume','targetFrames'].includes(k)))throw Error('生成偏好无效');
 if(options.narration!==undefined&&typeof options.narration!=='boolean')throw Error('旁白设置无效');
 for(const k of ['voiceId','musicAssetId'])if(options[k]!==undefined&&!(k==='musicAssetId'&&options[k]===null)&&!/^[-\w]{1,80}$/.test(options[k]))throw Error('声音或音乐不存在');
 if(options.speed!==undefined&&![.75,1,1.25,1.5].includes(options.speed))throw Error('语速无效');
 for(const k of ['musicVolume','sourceVolume'])if(options[k]!==undefined&&(!Number.isFinite(options[k])||options[k]<0||options[k]>1))throw Error('音量无效');
 if(options.targetFrames!==undefined&&(!Number.isInteger(options.targetFrames)||options.targetFrames<1||options.targetFrames>900))throw Error('自动选片目前支持最多 30 秒');
}

export async function readBounded(response,max){
 if(!response.body)throw Error('服务没有返回媒体或清单');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('服务返回内容超过大小限制');}parts.push(value);}}
 finally{reader.releaseLock();}
 return Buffer.concat(parts,size);
}
export async function providerRequest(url,options,label,fetcher=fetch){
 let response;
 try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(180000)])});}
 catch{throw Error(label+'连接中断，任务和已完成内容已保留');}
 if(!response.ok){await response.body?.cancel();throw Error(label+'返回 '+response.status+'，请检查服务连接或授权');}
 return response;
}
