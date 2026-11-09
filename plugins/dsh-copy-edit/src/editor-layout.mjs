// 只计算工作区尺寸；浏览器偏好不进入工程、编辑历史或媒体计划。
const size=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const bound=(n,min,max)=>Math.max(min,Math.min(max,n));
export function fitEditorLayout(width,height,preferences={}){
  const w=Math.max(0,size(width,0)),h=Math.max(0,size(height,0)),gap=8;
  const sideMin={left:200,right:220},centerMin=Math.min(240,Math.max(0,w-gap*2-sideMin.left-sideMin.right));
  const defaults={left:w>=2000?360:w<=1050?220:bound(w*.22,250,340),right:w>=2000?340:w<=1050?220:bound(w*.20,240,310),timeline:w>=2000?418:366};
  const prefs=preferences&&typeof preferences==='object'?preferences:{};
  let left=Math.max(sideMin.left,size(prefs.left,defaults.left)),right=Math.max(sideMin.right,size(prefs.right,defaults.right));
  const available=Math.max(sideMin.left+sideMin.right,w-gap*2-centerMin),extra=left+right-available;
  if(extra>0){const room=left-sideMin.left+right-sideMin.right;left-=extra*(left-sideMin.left)/(room||1);right-=extra*(right-sideMin.right)/(room||1);}
  const usable=Math.max(0,h-gap),upperMin=Math.min(240,usable*.55),timelineMin=Math.min(160,usable*.45),timelineMax=Math.max(timelineMin,usable-upperMin);
  const timeline=bound(size(prefs.timeline,defaults.timeline),timelineMin,timelineMax);
  return {left,right,timeline,defaults,limits:{left:[sideMin.left,w-gap*2-centerMin-right],right:[sideMin.right,w-gap*2-centerMin-left],timeline:[timelineMin,timelineMax]}};
}
export function dragEditorLayout(layout,edge,delta){
  if(!['left','right','timeline'].includes(edge)||!Number.isFinite(delta))throw Error('布局拖动参数无效');
  const [min,max]=layout.limits[edge];return {left:layout.left,right:layout.right,timeline:layout.timeline,[edge]:bound(layout[edge]+(edge==='left'?delta:-delta),min,max)};
}
