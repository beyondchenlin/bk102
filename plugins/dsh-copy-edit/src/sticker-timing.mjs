// 纯工程时间逻辑：浏览器与宿主共用；所有区间为 30fps、左闭右开。
export function projectStickers(project) {
  if(project.stickers!==undefined){if(!Array.isArray(project.stickers))throw Error('贴片列表无效');return project.stickers;}
  return project.sticker?[{...project.sticker,stickerId:'legacy-sticker',startFrame:0,endFrame:null}]:[];
}
export function stickerRange(sticker,totalFrames){return {startFrame:sticker.startFrame,endFrame:sticker.endFrame??totalFrames};}
export function stickerVisible(sticker,frame,totalFrames){const r=stickerRange(sticker,totalFrames);return frame>=r.startFrame&&frame<Math.min(totalFrames,r.endFrame);}
export function trimStickerRange(range,edge,target,totalFrames){
  if(!Number.isFinite(target)||!Number.isSafeInteger(totalFrames)||totalFrames<1||!['in','out'].includes(edge))throw Error('贴片时间无效');
  const end=Math.max(1,Math.min(totalFrames,range.endFrame)),start=Math.max(0,Math.min(end-1,range.startFrame));
  const value=Math.round(target);
  return edge==='in'?{startFrame:Math.max(0,Math.min(end-1,value)),endFrame:end}:{startFrame:start,endFrame:Math.max(start+1,Math.min(totalFrames,value))};
}
export function stickerRows(stickers,totalFrames){
  const ends=[],rows=new Map();
  // 邻接区间可共用一行；合成层级仍按原数组顺序，与时间轴分行独立。
  for(const s of [...stickers].sort((a,b)=>a.startFrame-b.startFrame)){
    const r=stickerRange(s,totalFrames);if(r.startFrame>=totalFrames)continue;
    let row=ends.findIndex(e=>e<=r.startFrame);if(row<0)row=ends.length;
    ends[row]=Math.min(totalFrames,r.endFrame);rows.set(s.stickerId,row);
  }
  return {rows,count:Math.max(1,ends.length)};
}
