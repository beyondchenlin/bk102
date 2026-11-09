// 浏览器与 Node 测试使用同一份源帧边界算法，不假定恒定帧率。
function boundaryUs(asset,index){return index===asset.ptsUs.length?asset.endUs:asset.ptsUs[index];}
function durationFrames(asset,start,end){return Math.max(1,Math.ceil((boundaryUs(asset,end)-boundaryUs(asset,start)-1)*30/1000000));}
function nearestBoundary(asset,target,min,max){
  let lo=min,hi=max;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(boundaryUs(asset,mid)<target)lo=mid+1;else hi=mid;}
  if(lo>min&&target-boundaryUs(asset,lo-1)<=boundaryUs(asset,lo)-target)return lo-1;
  return lo;
}
function trimBounds(asset,clip,edge,maxFrames=1800,minFrames=1){
  if(!['in','out'].includes(edge)||!Number.isSafeInteger(maxFrames)||maxFrames<1)throw Error('无效裁切边界');
  if(edge==='in'){
    let lo=0,hi=clip.outFrame-1;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(durationFrames(asset,mid,clip.outFrame)>maxFrames)lo=mid+1;else hi=mid;}
    const min=lo;lo=min;hi=clip.outFrame-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(durationFrames(asset,mid,clip.outFrame)<minFrames)hi=mid-1;else lo=mid;}
    return {min,max:lo};
  }
  let lo=clip.inFrame+1,hi=asset.ptsUs.length;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(durationFrames(asset,clip.inFrame,mid)>maxFrames)hi=mid-1;else lo=mid;}
  const max=lo;lo=clip.inFrame+1;hi=max;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(durationFrames(asset,clip.inFrame,mid)<minFrames)lo=mid+1;else hi=mid;}
  return {min:lo,max};
}
function dragTrim(asset,clip,edge,deltaSeconds,maxFrames=1800,minFrames=1){
  if(!Number.isFinite(deltaSeconds))throw Error('无效拖动距离');
  const bounds=trimBounds(asset,clip,edge,maxFrames,minFrames),initial=edge==='in'?clip.inFrame:clip.outFrame;
  const target=boundaryUs(asset,initial)+deltaSeconds*1000000;
  const index=nearestBoundary(asset,target,bounds.min,bounds.max);
  const next={inFrame:clip.inFrame,outFrame:clip.outFrame};next[edge==='in'?'inFrame':'outFrame']=index;
  return {...next,limited:target<boundaryUs(asset,bounds.min)||target>boundaryUs(asset,bounds.max),frames:durationFrames(asset,next.inFrame,next.outFrame)};
}
module.exports={boundaryUs,durationFrames,nearestBoundary,trimBounds,dragTrim};
