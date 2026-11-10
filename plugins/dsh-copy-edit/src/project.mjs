// 工程真相与媒体执行分离。这里不引用浏览器、Android 或本机路径。
import {createHash, randomUUID} from 'node:crypto';
import {projectStickers,stickerRange} from './sticker-timing.mjs';
import {clipWindow,windowClip,trimmedClip,timelineClips,resolvedStickers,independentVoices,timelineLength} from './timeline.mjs';
import {voiceFrames,projectMusic,musicSamples,musicPhaseAt,mergeMusic} from './audio-timing.mjs';
export const TRACK_ORDER = ['sticker','subtitle','overlay','video','voice','bgm'];
export const id = () => randomUUID();
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function integer(value, min, max, label='数值') {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(label+'超出范围');
  return value;
}
export function string(value, max, label='文字') {
  if (typeof value !== 'string' || value.length > max) throw Error(label+'不符合要求');
  return value;
}
export function newProject(projectId=id(), title='未命名文案') {
  return {schemaVersion:2,projectId,revision:1,title,text:'',versions:[],updatedAt:new Date().toISOString(),
    canvas:{width:1080,height:1920,fps:{numerator:30,denominator:1}},
    trackOrder:[...TRACK_ORDER],clips:[],sticker:null,audio:{voice:null,bgm:null}};
}
export function assetOf(assets, assetId, kind) {
  const asset=assets.find(a=>a.assetId===assetId);
  if (!asset || (kind && asset.kind!==kind)) throw Error('素材不存在或类型不匹配');
  return asset;
}
export function validateClip(clip, assets) {
  const a=assetOf(assets,clip.assetId,'video');
  integer(clip.inFrame,0,a.ptsUs.length-1,'入点');
  integer(clip.outFrame,clip.inFrame+1,a.ptsUs.length,'出点');
  if(clip.window){const w=clip.window;integer(w.inFrame,0,a.ptsUs.length-1,'解码入点');integer(w.outFrame,w.inFrame+1,a.ptsUs.length,'解码出点');const length=outputFrames((w.outFrame===a.ptsUs.length?a.endUs:a.ptsUs[w.outFrame])-a.ptsUs[w.inFrame]);integer(w.offset,0,length-1,'分段起点');integer(w.frames,1,length-w.offset,'分段长度');}
  return a;
}
export function sourceInterval(clip, asset) {
  return {startUs:asset.ptsUs[clip.inFrame],endUs:clip.outFrame===asset.ptsUs.length?asset.endUs:asset.ptsUs[clip.outFrame]};
}
export function outputFrames(durationUs) {
  integer(durationUs,1,600000000,'镜头时长');
  // 整数微秒保存 PTS 的量化误差至多 1us，不能把 33334us 误算成两帧。
  return Math.max(1,Number((BigInt(durationUs)*30n-30n+999999n)/1000000n));
}
export function stickerTransform(s) {
  const width=integer(s.width??1080,216,1080,'贴片宽度'),height=400*width/1080;
  return {width,x:integer(s.x??0,Math.ceil(-width/2),Math.floor(1080-width/2),'贴片横向位置'),
    y:integer(s.y,Math.ceil(-height/2),Math.floor(1920-height/2),'贴片纵向位置')};
}
function stickerContent(s,assets){
  assetOf(assets,s.assetId,'image');string(s.text,500,'贴片文字');
  for(const k of ['color','stroke','background'])if(!/^#[\da-f]{6}$/i.test(s[k]))throw Error('贴片颜色不符合要求');
  return {assetId:s.assetId,text:s.text,color:s.color,stroke:s.stroke,background:s.background,transparent:s.transparent===true,...stickerTransform(s)};
}
function validateStickerTime(s){integer(s.startFrame,0,1799,'贴片开始帧');if(s.endFrame!==null)integer(s.endFrame,s.startFrame+1,1800,'贴片结束帧');}
function writableStickers(p){if(p.stickers===undefined){p.stickers=structuredClone(projectStickers(p));p.sticker=null;}return p.stickers;}
function findSticker(p,stickerId){const s=writableStickers(p).find(s=>s.stickerId===stickerId);if(!s)throw Error('文字贴片不存在');return s;}
function preserveVoices(p,assets){if(p.audio.voiceMode==='independent')return;p.voiceClips=structuredClone(independentVoices(p,assets));p.audio.voiceMode='independent';}
function preserveMusic(p){if(p.audio.bgmMode==='segments')return;p.musicClips=structuredClone(projectMusic(p));p.audio.bgmMode='segments';}
function bindingCheck(b,p){if(!p.clips.some(c=>c.clipId===b.clipId))throw Error('绑定镜头不存在');integer(b.startFrame,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'镜头内开始帧');if(b.endFrame!==null)integer(b.endFrame,b.startFrame+1,Number.MAX_SAFE_INTEGER,'镜头内结束帧');}
function timingChange(p,clipId,headRemoved){for(const s of p.stickers||[])if(s.binding?.clipId===clipId){s.binding.startFrame-=headRemoved;if(s.binding.endFrame!==null)s.binding.endFrame-=headRemoved;}}
export function validateNarration(n,project,assets) {
  string(n.text,2000,'句子');if(!n.text.trim())throw Error('请填写绑定句子');
  if(n.copyVersion!=null&&!project.versions.some(v=>v.version===n.copyVersion))throw Error('文案版本不存在');
  if(n.voice) {
    const a=assetOf(assets,n.voice.assetId,'audio');
    integer(n.voice.inUs,0,a.durationUs-1,'配音起点');integer(n.voice.outUs,n.voice.inUs+1,a.durationUs,'配音终点');
    if(!Number.isFinite(n.voice.volume)||n.voice.volume<0||n.voice.volume>1)throw Error('配音音量超出范围');
  }
}
export function compilePlan(project, assets, profile='export') {
  if(project.draftImport?.pendingGaps?.length)throw Error('工程仍有待补素材，请先完成草案选片');
  if (project.schemaVersion!==2 || !['preview','export'].includes(profile)) throw Error('不支持的工程或输出格式');
  if (!project.clips.length) throw Error('请先添加视频镜头');
  integer(project.clips.length,1,120,'镜头数量');
  const voiceMode=project.audio.voiceMode??'global';if(!['global','clips','independent'].includes(voiceMode))throw Error('配音方式不支持');
  let offset=0;const voices=[];
  const clips=project.clips.map(clip=>{
    const asset=validateClip(clip,assets),range=sourceInterval(clip,asset);
    const frames=clipWindow(clip,asset).frames;
    if(clip.narration){validateNarration(clip.narration,project,assets);const v=clip.narration.voice;
    }
    const result={...clip,...range,sha256:asset.sha256,startFrame:offset,frames};offset+=frames;
    return result;
  });
  const videoFrames=offset;
  if(voiceMode==='clips')for(const v of independentVoices(project,assets))voices.push({...v,clipId:v.clipIds[0]});
  if(voiceMode==='independent'){
    integer((project.voiceClips||[]).length,0,120,'配音片段数量');const ids=new Set();
    for(const v of project.voiceClips||[]){if(typeof v.voiceId!=='string'||ids.has(v.voiceId))throw Error('配音标识无效');ids.add(v.voiceId);integer(v.startFrame,0,1799,'配音开始帧');validateNarration({text:v.text,copyVersion:v.copyVersion,voice:v},project,assets);voices.push({...v});}
  }
  offset=Math.max(offset,...voices.map(v=>v.startFrame+voiceFrames(v)));
  if(offset>1800) throw Error('当前版本支持画面和配音总长不超过 60 秒');
  const refs=[...clips.map(c=>c.assetId)];
  const allStickers=projectStickers(project),seen=new Set();integer(allStickers.length,0,120,'贴片数量');
  for(const s of allStickers)if(s.binding)bindingCheck(s.binding,project);
  const resolved=resolvedStickers(project,clips);
  const stickers=allStickers.map(s=>{
    if(typeof s.stickerId!=='string'||!/^[-\w]{1,80}$/.test(s.stickerId)||seen.has(s.stickerId))throw Error('贴片标识无效或重复');seen.add(s.stickerId);
    if(!s.binding)validateStickerTime(s);const content=stickerContent(s,assets),range=stickerRange(resolved.find(x=>x.stickerId===s.stickerId),offset);
    return {...content,stickerId:s.stickerId,startFrame:range.startFrame,endFrame:Math.min(range.endFrame,offset)};
  }).filter(s=>s.startFrame<s.endFrame);
  for(const s of stickers)refs.push(s.assetId);
  for(const v of voices)refs.push(v.assetId);
  const music=[];if(project.audio.bgmMode==='segments'){
    integer((project.musicClips||[]).length,0,120,'音乐片段数量');const ids=new Set();
    for(const m of project.musicClips||[]){const a=assetOf(assets,m.assetId,'audio');if(typeof m.musicId!=='string'||!/^[-\w]{1,80}$/.test(m.musicId)||ids.has(m.musicId))throw Error('音乐标识无效');ids.add(m.musicId);integer(m.startFrame,0,1799,'音乐开始帧');if(m.endFrame!==null)integer(m.endFrame,m.startFrame+1,1800,'音乐结束帧');integer(m.offsetSamples,0,musicSamples(a)-1,'音乐源位置');if(!Number.isFinite(m.volume)||m.volume<0||m.volume>1)throw Error('音乐音量超出范围');const endFrame=Math.min(m.endFrame??offset,offset);if(m.startFrame<endFrame)music.push({...m,endFrame});}
    for(const m of music)refs.push(m.assetId);
  }
  const activeAudio={voice:voiceMode==='global'?project.audio.voice:null,bgm:project.audio.bgmMode==='segments'?null:project.audio.bgm};
  for(const role of ['voice','bgm']) if(activeAudio[role]) {
    const audio=project.audio[role];assetOf(assets,audio.assetId,'audio');refs.push(audio.assetId);
    if(!Number.isFinite(audio.volume)||audio.volume<0||audio.volume>1)throw Error('音量超出范围');
  }
  const plan={schemaVersion:project.audio.timelineVersion===2?2:1,projectId:project.projectId,revision:project.revision,
    canvas:structuredClone(project.canvas),clips,stickers,sticker:project.stickers===undefined&&project.sticker?{...structuredClone(project.sticker),...stickerTransform(project.sticker)}:null,
    audio:structuredClone(activeAudio),voices,...(project.audio.bgmMode==='segments'?{music:mergeMusic(music,assets)}:{}),videoFrames,totalFrames:offset,
    assets:[...new Set(refs)].map(ref=>{const a=assetOf(assets,ref);return {assetId:ref,sha256:a.sha256,kind:a.kind}})};
  return {...plan,planHash:digest(plan),profile};
}
export function editProject(original, command, assets) {
  const p=structuredClone(original);
  if(['trimClip','splitClip','replaceClip','removeClip','moveClip'].includes(command.type)&&command.preserveVoice!==false&&independentVoices(p,assets).length)preserveVoices(p,assets);
  switch(command.type) {
    case 'saveCopy': {
      p.title=string(command.title,120,'标题').trim()||'未命名文案';
      p.text=string(command.text,20000,'文案');
      if(p.versions.length>=200)throw Error('当前工程已保存 200 个版本，请新建工程');
      p.versions.push({version:p.versions.length+1,title:p.title,text:p.text,savedAt:new Date().toISOString()});
      break;
    }
    case 'addClip': {
      const a=assetOf(assets,command.assetId,'video');
      if(p.clips.length>=120)throw Error('最多 120 个镜头');
      // 长素材默认只取前 4 秒，所有边界仍来自源 PTS。
      const stop=a.ptsUs.findIndex(t=>t>=4000000);
      p.clips.push({clipId:id(),assetId:a.assetId,inFrame:0,outFrame:stop>0?stop:a.ptsUs.length});break;
    }
    case 'trimClip': {
      const c=p.clips.find(c=>c.clipId===command.clipId);if(!c)throw Error('镜头不存在');
      const a=validateClip(c,assets);integer(command.inFrame,0,a.ptsUs.length-1,'入点');integer(command.outFrame,command.inFrame+1,a.ptsUs.length,'出点');const old=clipWindow(c,a),next=trimmedClip(c,a,command.inFrame,command.outFrame);validateClip(next,assets);
      const shifted=next.window?next.window.offset-old.offset:Math.round((a.ptsUs[next.inFrame]-a.ptsUs[c.inFrame])*30/1e6);
      timingChange(p,c.clipId,shifted);Object.assign(c,next);if(!next.window)delete c.window;break;
    }
    case 'splitClip': {
      const index=p.clips.findIndex(c=>c.clipId===command.clipId);if(index<0)throw Error('镜头不存在');if(p.clips.length>=120)throw Error('最多 120 个镜头');
      const c=p.clips[index],a=validateClip(c,assets),w=clipWindow(c,a),cut=integer(command.offsetFrame,1,w.frames-1,'分割点'),rightId=id();
      const left=windowClip(c,a,{...w,frames:cut}),right=windowClip({...c,clipId:rightId},a,{...w,offset:w.offset+cut,frames:w.frames-cut});
      p.clips.splice(index,1,left,right);
      for(const v of p.voiceClips||[])if(v.clipIds?.includes(c.clipId))v.clipIds.push(rightId);
      const splitStickers=[];for(const s of p.stickers||[]){splitStickers.push(s);if(s.binding?.clipId!==c.clipId)continue;const b=s.binding,end=b.endFrame??w.frames;
        if(b.startFrame>=cut){s.binding={...b,clipId:rightId,startFrame:b.startFrame-cut,endFrame:b.endFrame===null?null:end-cut};}
        else if(end>cut){splitStickers.push({...structuredClone(s),stickerId:id(),binding:{clipId:rightId,startFrame:0,endFrame:b.endFrame===null?null:end-cut}});s.binding.endFrame=cut;}
      }
      if(p.stickers)p.stickers=splitStickers;break;
    }
    case 'replaceClip': {
      const c=p.clips.find(c=>c.clipId===command.clipId);if(!c)throw Error('镜头不存在');
      const old=validateClip(c,assets),range=sourceInterval(c,old);
      const budget=clipWindow(c,old).frames;
      const a=assetOf(assets,command.assetId,'video');
      // 帧号只属于其源素材。按原镜头的输出时长选择新源出点，避免裁切入点
      // 或不同帧率让替换后的镜头突然变长；不足时使用新源的完整长度。
      const length=n=>outputFrames((n===a.ptsUs.length?a.endUs:a.ptsUs[n])-a.ptsUs[0]);
      const frames=Math.min(budget,length(a.ptsUs.length));
      let lo=1,hi=a.ptsUs.length;
      while(lo<hi){const mid=Math.floor((lo+hi)/2),us=(mid===a.ptsUs.length?a.endUs:a.ptsUs[mid])-a.ptsUs[0];if(us>=frames*1e6/30-1)hi=mid;else lo=mid+1;}
      c.assetId=a.assetId;c.inFrame=0;c.outFrame=lo;delete c.window;
      if(length(lo)!==frames)Object.assign(c,windowClip(c,a,{inFrame:0,outFrame:lo,offset:0,frames}));break;
    }
    case 'removeClip': {
      if(!p.clips.some(c=>c.clipId===command.clipId))throw Error('镜头不存在');p.clips=p.clips.filter(c=>c.clipId!==command.clipId);
      if(p.stickers)p.stickers=p.stickers.filter(s=>s.binding?.clipId!==command.clipId);
      for(const v of p.voiceClips||[])v.clipIds=(v.clipIds||[]).filter(id=>id!==command.clipId);break;
    }
    case 'moveClip': {
      const from=p.clips.findIndex(c=>c.clipId===command.clipId);if(from<0)throw Error('镜头不存在');
      const to=integer(command.to,0,p.clips.length-1,'镜头位置');p.clips.splice(to,0,p.clips.splice(from,1)[0]);break;
    }
    case 'setSticker': {
      if(p.stickers!==undefined)throw Error('当前工程包含独立文字贴片，请按贴片标识编辑');
      if(command.sticker===null) {p.sticker=null;break;}
      p.sticker=stickerContent(command.sticker,assets);break;
    }
    case 'moveSticker': {
      if(command.stickerId){Object.assign(findSticker(p,command.stickerId),stickerTransform(command));break;}
      if(p.stickers!==undefined)throw Error('请选择需要调整的文字贴片');
      if(!p.sticker)throw Error('请先添加文字贴片');
      p.sticker={...p.sticker,...stickerTransform(command)};break;
    }
    case 'addSticker': {
      const list=writableStickers(p);if(list.length>=120)throw Error('最多支持 120 个文字贴片');
      const s=command.sticker;validateStickerTime(s);if(s.binding)bindingCheck(s.binding,p);list.push({...stickerContent(s,assets),stickerId:id(),startFrame:s.startFrame,endFrame:s.endFrame,...(s.binding?{binding:structuredClone(s.binding)}:{})});break;
    }
    case 'updateSticker': {Object.assign(findSticker(p,command.stickerId),stickerContent(command.sticker,assets));break;}
    case 'trimSticker': {
      const s=findSticker(p,command.stickerId),range={startFrame:command.startFrame,endFrame:command.endFrame};validateStickerTime(range);
      if(s.binding){const c=timelineClips(p,assets).find(c=>c.clipId===s.binding.clipId);if(range.startFrame<c.startFrame||range.endFrame===null||range.endFrame>c.startFrame+c.frames)throw Error('绑定文字的时间需在对应镜头内；可先取消绑定再跨镜头显示');s.binding={clipId:c.clipId,startFrame:range.startFrame-c.startFrame,endFrame:range.endFrame-c.startFrame};}
      else Object.assign(s,range);break;
    }
    case 'bindSticker': {
      const s=findSticker(p,command.stickerId),clips=timelineClips(p,assets),r=resolvedStickers(p,clips).find(x=>x.stickerId===s.stickerId);
      if(command.clipId===null){s.startFrame=Math.max(0,r.startFrame);s.endFrame=Math.max(s.startFrame+1,r.endFrame??clips.reduce((n,c)=>n+c.frames,0));delete s.binding;}
      else {const c=clips.find(c=>c.clipId===command.clipId);if(!c)throw Error('镜头不存在');const start=Math.max(0,r.startFrame-c.startFrame),end=Math.min(c.frames,(r.endFrame??c.startFrame+c.frames)-c.startFrame);s.binding={clipId:c.clipId,startFrame:!command.cover&&end>start?start:0,endFrame:!command.cover&&end>start?end:null};}break;
    }
    case 'removeSticker': {
      findSticker(p,command.stickerId);p.stickers=p.stickers.filter(s=>s.stickerId!==command.stickerId);break;
    }
    case 'splitSticker': {
      const list=writableStickers(p),s=findSticker(p,command.stickerId);if(list.length>=120)throw Error('最多支持 120 个文字贴片');
      const clips=timelineClips(p,assets),total=timelineLength(p,assets).totalFrames,r=stickerRange(resolvedStickers(p,clips).find(x=>x.stickerId===s.stickerId),total),cut=integer(command.frame,r.startFrame+1,Math.min(r.endFrame,total)-1,'分割点'),right={...structuredClone(s),stickerId:id()};
      if(s.binding){const c=clips.find(c=>c.clipId===s.binding.clipId),local=cut-c.startFrame;right.binding.startFrame=local;s.binding.endFrame=local;}else{right.startFrame=cut;s.endFrame=cut;}
      list.splice(list.indexOf(s)+1,0,right);break;
    }
    case 'splitVoice': {
      const global=!p.audio.voiceMode||p.audio.voiceMode==='global',limit=timelineLength(p,assets).totalFrames;preserveVoices(p,assets);if(global)for(const voice of p.voiceClips)voice.outUs=Math.min(voice.outUs,Math.round(limit*1e6/30));const v=p.voiceClips.find(v=>v.voiceId===command.voiceId);if(!v)throw Error('配音不存在');if(p.voiceClips.length>=120)throw Error('最多 120 个配音片段');
      const cut=integer(command.frame,v.startFrame+1,v.startFrame+voiceFrames(v)-1,'分割点'),at=v.inUs+Math.round((cut-v.startFrame)*1e6/30);integer(at,v.inUs+1,v.outUs-1,'配音分割点');
      const right={...structuredClone(v),voiceId:id(),startFrame:cut,inUs:at,clipIds:[]};v.outUs=at;v.clipIds=[];p.voiceClips.splice(p.voiceClips.indexOf(v)+1,0,right);p.audio.timelineVersion=2;break;
    }
    case 'splitMusic': {
      preserveMusic(p);const m=p.musicClips.find(m=>m.musicId===command.musicId);if(!m)throw Error('音乐片段不存在');if(p.musicClips.length>=120)throw Error('最多 120 个音乐片段');const clips=timelineClips(p,assets),total=timelineLength(p,assets).totalFrames;
      const cut=integer(command.frame,m.startFrame+1,Math.min(m.endFrame??total,total)-1,'分割点'),right={...m,musicId:id(),startFrame:cut,offsetSamples:musicPhaseAt(m,cut,assetOf(assets,m.assetId,'audio'))};m.endFrame=cut;p.musicClips.splice(p.musicClips.indexOf(m)+1,0,right);p.audio.timelineVersion=2;break;
    }
    case 'removeMusic': {preserveMusic(p);if(!p.musicClips.some(m=>m.musicId===command.musicId))throw Error('音乐片段不存在');p.musicClips=p.musicClips.filter(m=>m.musicId!==command.musicId);p.audio.timelineVersion=2;break;}
    case 'editMusic': {preserveMusic(p);const m=p.musicClips.find(m=>m.musicId===command.musicId);if(!m)throw Error('音乐片段不存在');integer(command.startFrame,0,1799,'音乐开始帧');integer(command.endFrame,command.startFrame+1,1800,'音乐结束帧');if(!Number.isFinite(command.volume)||command.volume<0||command.volume>1)throw Error('音乐音量超出范围');Object.assign(m,{startFrame:command.startFrame,endFrame:command.endFrame,volume:command.volume});p.audio.timelineVersion=2;break;}
    case 'setVoiceMode': {
      if(!['global','clips','independent'].includes(command.mode))throw Error('配音方式不支持');
      if(command.mode==='independent')preserveVoices(p,assets);
      p.audio.voiceMode=command.mode;break;
    }
    case 'setNarration': {
      const c=p.clips.find(c=>c.clipId===command.clipId);if(!c)throw Error('镜头不存在');
      if(command.narration===null){delete c.narration;if(p.audio.voiceMode==='independent')for(const v of p.voiceClips||[])v.clipIds=(v.clipIds||[]).filter(id=>id!==c.clipId);break;}
      validateNarration(command.narration,p,assets);const n=command.narration;
      c.narration={text:n.text,copyVersion:n.copyVersion??null,voice:n.voice?{assetId:n.voice.assetId,inUs:n.voice.inUs,outUs:n.voice.outUs,volume:n.voice.volume}:null};
      if(p.audio.voiceMode==='independent'){
        p.voiceClips??=[];const v=p.voiceClips.find(v=>v.clipIds?.includes(c.clipId));
        if(n.voice){const next={...n.voice,text:n.text,copyVersion:n.copyVersion??null};if(v){Object.assign(v,next);for(const other of p.clips)if(v.clipIds.includes(other.clipId))other.narration=structuredClone(c.narration);}else p.voiceClips.push({...next,voiceId:id(),clipIds:[c.clipId],startFrame:timelineClips(p,assets).find(x=>x.clipId===c.clipId).startFrame});}
        else if(v)v.clipIds=v.clipIds.filter(id=>id!==c.clipId);
      }break;
    }
    case 'editVoice': {preserveVoices(p,assets);const v=p.voiceClips.find(v=>v.voiceId===command.voiceId);if(!v)throw Error('配音不存在');integer(command.startFrame,0,1799,'配音开始帧');const next={...v,startFrame:command.startFrame,inUs:command.inUs,outUs:command.outUs,volume:command.volume};validateNarration({text:v.text,copyVersion:v.copyVersion,voice:next},p,assets);Object.assign(v,next);for(const c of p.clips)if(v.clipIds.includes(c.clipId)&&c.narration)c.narration.voice={assetId:v.assetId,inUs:v.inUs,outUs:v.outUs,volume:v.volume};break;}
    case 'removeVoice': {preserveVoices(p,assets);const v=p.voiceClips.find(v=>v.voiceId===command.voiceId);if(!v)throw Error('配音不存在');p.voiceClips=p.voiceClips.filter(x=>x!==v);for(const c of p.clips)if(v.clipIds.includes(c.clipId)&&c.narration)c.narration.voice=null;break;}
    case 'setAudio': {
      if(!['voice','bgm'].includes(command.role))throw Error('音轨不存在');
      if(command.role==='bgm'){delete p.musicClips;delete p.audio.bgmMode;}
      if(command.assetId===null) {p.audio[command.role]=null;break;}
      assetOf(assets,command.assetId,'audio');
      if(!Number.isFinite(command.volume)||command.volume<0||command.volume>1)throw Error('音量超出范围');
      p.audio[command.role]={assetId:command.assetId,volume:command.volume};break;
    }
    default: throw Error('不支持的编辑操作');
  }
  p.revision++;
  if(p.clips.length)compilePlan(p,assets);
  p.updatedAt=new Date().toISOString();
  return p;
}
