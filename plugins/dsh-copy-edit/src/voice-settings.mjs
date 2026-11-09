import {digest} from './project.mjs';

const sources=['company','custom'];
const empty=()=>({revision:0,providers:{company:{endpoint:'',model:'',voices:[]},custom:{endpoint:'',model:'',voices:[]}},selections:{},operations:[]});
export function voiceSettingsView(state){const {operations,...view}=state.voiceSettings||empty();return structuredClone(view);}
function string(value,max,label){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))throw Error(label+'不符合要求');return value.trim();}
function endpoint(value){const text=string(value,1024,'服务地址');if(!text)return '';let u;try{u=new URL(text);}catch{throw Error('请输入完整的 HTTP 或 HTTPS 服务地址');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('服务地址不能包含密钥、查询参数或片段');return u.href;}

// 仅配置入口；无网络请求、密钥收集或合成副作用，不进入工程撤销与渲染计划。
export function changeVoiceSettings(state,request){
  if(!request||typeof request.operationId!=='string'||!/^[-\w]{8,80}$/.test(request.operationId))throw Error('操作标识无效');
  const settings=structuredClone(state.voiceSettings||empty()),hash=digest(request),old=settings.operations.find(o=>o.id===request.operationId);
  if(old){if(old.hash!==hash)throw Error('操作标识已用于其他请求');return old.answer;}
  if(request.expectedRevision!==settings.revision)throw Error('配音设置已更新，请重新载入后保存');
  const c=request.command;if(!c||!sources.includes(c.source))throw Error('配音来源无效');
  const provider=settings.providers[c.source];
  if(c.type==='saveProvider'){
    if(Object.keys(c).some(k=>!['type','source','endpoint','model'].includes(k)))throw Error('当前配置不接收 API 密钥');
    provider.endpoint=endpoint(c.endpoint);provider.model=string(c.model,100,'模型');
  }else if(c.type==='saveVoice'){
    const v=c.voice;if(!v||Object.keys(v).some(k=>!['voiceId','name','remoteId','referenceAssetId'].includes(k)))throw Error('音色参数无效');
    if(typeof v.voiceId!=='string'||!/^[-\w]{8,80}$/.test(v.voiceId))throw Error('音色标识无效');
    const name=string(v.name,60,'音色名称'),remoteId=string(v.remoteId,120,'音色 ID');if(!name)throw Error('请输入音色名称');
    const referenceAssetId=v.referenceAssetId??null;
    if(referenceAssetId!==null){const a=state.assets.find(a=>a.assetId===referenceAssetId);if(!a||a.kind!=='audio'||a.durationUs>60000000||a.bytes>20*1024*1024)throw Error('参考音频需为不超过 60 秒、20 MiB 的音频');}
    if(!remoteId&&!referenceAssetId)throw Error('请填写服务音色 ID 或上传参考音频');
    if(provider.voices.some(x=>x.voiceId!==v.voiceId&&x.name===name))throw Error('音色名称已存在');
    const i=provider.voices.findIndex(x=>x.voiceId===v.voiceId),voice={voiceId:v.voiceId,name,remoteId,referenceAssetId};
    if(i<0){if(provider.voices.length>=40)throw Error('每个来源最多保存 40 个音色');provider.voices.push(voice);}else provider.voices[i]=voice;
  }else if(c.type==='deleteVoice'){
    if(!provider.voices.some(v=>v.voiceId===c.voiceId))throw Error('音色不存在');provider.voices=provider.voices.filter(v=>v.voiceId!==c.voiceId);
    for(const selection of Object.values(settings.selections))if(selection.source===c.source&&selection.voiceId===c.voiceId)selection.voiceId=null;
  }else if(c.type==='selectVoice'){
    if(!state.projects.some(p=>p.projectId===c.projectId))throw Error('文案不存在');
    if(c.voiceId!==null&&!provider.voices.some(v=>v.voiceId===c.voiceId))throw Error('请重新选择当前来源的音色');
    if(![.75,1,1.25,1.5].includes(c.rate))throw Error('语速无效');
    settings.selections[c.projectId]={source:c.source,voiceId:c.voiceId,rate:c.rate};
  }else throw Error('配音设置命令无效');
  settings.revision++;const answer=voiceSettingsView({voiceSettings:settings});settings.operations.push({id:request.operationId,hash,answer});if(settings.operations.length>20)settings.operations.shift();state.voiceSettings=settings;return answer;
}
