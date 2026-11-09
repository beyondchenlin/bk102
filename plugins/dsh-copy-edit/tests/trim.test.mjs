import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compilePlan,newProject,editProject} from '../src/project.mjs';
const {dragTrim,trimBounds,durationFrames}=createRequire(import.meta.url)('../src/trim.cjs');
const a={assetId:'cfr',kind:'video',sha256:'a'.repeat(64),ptsUs:Array.from({length:120},(_,i)=>Math.round(i*1e6/30)),endUs:4000000};
const clip={inFrame:30,outFrame:90};
test('左右裁切取最近源边界，始终保留至少一帧且不能越过素材',()=>{
  assert.deepEqual(dragTrim(a,clip,'in',.5),{inFrame:45,outFrame:90,limited:false,frames:45});
  assert.equal(dragTrim(a,clip,'out',-.5).outFrame,75);
  assert.equal(dragTrim(a,clip,'in',-100).inFrame,0);
  assert.equal(dragTrim(a,clip,'out',100).outFrame,120);
  assert.equal(dragTrim(a,clip,'in',100).inFrame,89);
  assert.equal(dragTrim(a,clip,'out',-100).outFrame,31);
  assert.equal(dragTrim(a,clip,'out',100).limited,true);
  assert.deepEqual(clip,{inFrame:30,outFrame:90});
});
test('可变帧率拖动按实际 PTS 吸附，末尾使用真实素材结束时间',()=>{
  const vfr={ptsUs:[0,16667,50000,116667],endUs:150000},c={inFrame:0,outFrame:4};
  assert.equal(dragTrim(vfr,c,'in',.04).inFrame,2);
  assert.equal(dragTrim(vfr,c,'out',-.03).outFrame,3);
  assert.equal(dragTrim(vfr,c,'out',10).outFrame,4);
  assert.equal(durationFrames(vfr,2,3),2);
  for(const delta of [-100,-.07,0,.04,100]){
    for(const edge of ['in','out']){const t=dragTrim(vfr,c,edge,delta);assert(t.outFrame>t.inFrame);assert(t.inFrame>=0&&t.outFrame<=4);}
  }
});
test('长工程扩展受剩余 30fps 帧预算限制，不因拖动生成不可导出工程',()=>{
  assert.deepEqual(trimBounds(a,clip,'in',75),{min:15,max:89});
  assert.deepEqual(trimBounds(a,clip,'out',75),{min:31,max:105});
  assert.equal(dragTrim(a,clip,'in',-10,75).frames,75);
  assert.equal(dragTrim(a,clip,'out',10,75).frames,75);
  assert.throws(()=>dragTrim(a,clip,'out',NaN));
});
test('拖动结果经过同一工程命令，后续镜头无缝接续且预览/导出同计划',()=>{
  let p=editProject(newProject(),{type:'addClip',assetId:a.assetId},[a]);
  p=editProject(p,{type:'addClip',assetId:a.assetId},[a]);
  const first=p.clips[0];
  const draft=dragTrim(a,first,'out',-1.5);
  p=editProject(p,{type:'trimClip',clipId:first.clipId,...draft},[a]);
  const preview=compilePlan(p,[a],'preview'),exported=compilePlan(p,[a],'export');
  assert.equal(preview.clips[0].frames,75);assert.equal(preview.clips[1].startFrame,75);
  assert.equal(preview.totalFrames,195);assert.equal(preview.planHash,exported.planHash);
});
