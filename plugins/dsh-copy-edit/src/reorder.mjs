// 以其他镜头的中点决定插入位置；不改变素材边界或音轨时间。
export function clipDropTarget(clips,clipId,seconds){
  const from=clips.findIndex(c=>c.clipId===clipId);if(from<0||!Number.isFinite(seconds))throw Error('无效镜头拖动位置');
  const others=clips.filter(c=>c.clipId!==clipId);let to=0;
  while(to<others.length&&seconds>=others[to].start+others[to].duration/2)to++;
  return {from,to,marker:to===from?clips[from].start:(others[to]?.start??(others.at(-1)?others.at(-1).start+others.at(-1).duration:0))};
}
