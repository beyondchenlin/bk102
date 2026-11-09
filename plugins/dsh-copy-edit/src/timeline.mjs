// 浏览器和宿主共享工程时间映射。分割保留同一个源解码窗口，避免独立取整多出帧。
export function framesFor(us){return Math.max(1,Math.ceil((us-1)*30/1000000));}
export function atUs(a,n){return n===a.ptsUs.length?a.endUs:a.ptsUs[n];}
export function clipWindow(c,a){return c.window||{inFrame:c.inFrame,outFrame:c.outFrame,offset:0,frames:framesFor(atUs(a,c.outFrame)-atUs(a,c.inFrame))};}
export function sourceFrameAt(c,a,offset){const w=clipWindow(c,a),us=atUs(a,w.inFrame)+(w.offset+offset)*1e6/30;let lo=w.inFrame,hi=w.outFrame-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(a.ptsUs[m]<=us+1)lo=m;else hi=m-1;}return lo;}
export function windowClip(c,a,w){return {...c,window:w,inFrame:sourceFrameAt({...c,window:w},a,0),outFrame:Math.min(a.ptsUs.length,sourceFrameAt({...c,window:w},a,w.frames-1)+1)};}
export function trimmedClip(c,a,start,end){
  if(!c.window)return {...c,inFrame:start,outFrame:end};
  const w=c.window;
  if(start<w.inFrame||end>w.outFrame){const next={...c,inFrame:start,outFrame:end};delete next.window;return next;}
  const offset=start===c.inFrame?w.offset:Math.max(0,Math.ceil((atUs(a,start)-atUs(a,w.inFrame))*30/1e6-.00003));
  const stop=end===c.outFrame?w.offset+w.frames:Math.ceil((atUs(a,end)-atUs(a,w.inFrame))*30/1e6-.00003);
  return windowClip(c,a,{...w,offset,frames:Math.max(1,stop-offset)});
}
export function timelineClips(p,assets){let offset=0;return p.clips.map(c=>{const a=assets.find(a=>a.assetId===c.assetId),w=clipWindow(c,a),r={...c,asset:a,startFrame:offset,start:offset/30,frames:w.frames,duration:w.frames/30};offset+=w.frames;return r;});}
export function independentVoices(p,assets){
  if(p.audio.voiceMode==='independent')return p.voiceClips||[];
  if(p.audio.voiceMode==='clips'){const seen=new Set();return timelineClips(p,assets).filter(c=>c.narration?.voice).flatMap(c=>{const linked=(p.voiceClips||[]).find(v=>v.clipIds?.includes(c.clipId)),key=linked?.voiceId||'voice-'+c.clipId;if(seen.has(key))return [];seen.add(key);return [{...c.narration.voice,voiceId:key,clipIds:linked?.clipIds||[c.clipId],text:c.narration.text,copyVersion:c.narration.copyVersion,startFrame:c.startFrame}];});}
  const v=p.audio.voice,a=v&&assets.find(a=>a.assetId===v.assetId);return a?[{...v,voiceId:'voice-global',clipIds:[],text:'整段配音',copyVersion:null,inUs:0,outUs:a.durationUs,startFrame:0}]:[];
}
export function timelineLength(p,assets){const clips=timelineClips(p,assets),videoFrames=clips.reduce((n,c)=>n+c.frames,0);const voices=p.audio.voiceMode==='independent'?p.voiceClips||[]:p.audio.voiceMode==='clips'?independentVoices(p,assets):[];return {videoFrames,totalFrames:Math.max(videoFrames,...voices.map(v=>v.startFrame+framesFor(v.outUs-v.inUs)))};}
export function resolvedStickers(p,clips){
  const list=p.stickers??(p.sticker?[{...p.sticker,stickerId:'legacy-sticker',startFrame:0,endFrame:null}]:[]);
  return list.map(s=>{if(!s.binding)return s;const c=clips.find(c=>c.clipId===s.binding.clipId);if(!c)return {...s,startFrame:0,endFrame:0};return {...s,startFrame:c.startFrame+Math.max(0,s.binding.startFrame),endFrame:c.startFrame+Math.min(c.frames,s.binding.endFrame??c.frames)};});
}
