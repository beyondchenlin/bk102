// 30fps / 48kHz：每帧1600个采样。分割只改变区间，不重置循环音乐相位。
export function voiceFrames(v){return Math.max(1,Math.ceil(((v.outUs-v.inUs)-1)*30/1e6));}
export function musicSamples(asset){return Math.max(1,Math.round(asset.durationUs*48000/1e6));}
export function projectMusic(p){return p.audio.bgmMode==='segments'?(p.musicClips||[]):p.audio.bgm?[{...p.audio.bgm,musicId:'music-global',startFrame:0,endFrame:null,offsetSamples:0}]:[];}
export function musicPhaseAt(m,frame,asset){return (m.offsetSamples+(frame-m.startFrame)*1600)%musicSamples(asset);}
export function mergeMusic(list,assets){
  const result=[];
  for(const m of [...list].sort((a,b)=>a.startFrame-b.startFrame)){
    const previous=result.at(-1),asset=assets.find(a=>a.assetId===m.assetId);
    if(previous&&previous.assetId===m.assetId&&previous.volume===m.volume&&previous.endFrame===m.startFrame&&musicPhaseAt(previous,m.startFrame,asset)===m.offsetSamples)previous.endFrame=m.endFrame;
    else result.push({...m});
  }
  return result;
}
