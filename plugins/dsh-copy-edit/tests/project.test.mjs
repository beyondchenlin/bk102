import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {newProject,compilePlan,editProject,outputFrames} from '../src/project.mjs';
import {ProjectStore} from '../src/store.mjs';

const assets=[{assetId:'vfr',kind:'video',sha256:'a'.repeat(64),ptsUs:[0,16667,50000,116667],endUs:150000},
  {assetId:'other',kind:'video',sha256:'b'.repeat(64),ptsUs:[0,33333],endUs:66667}];
test('旧工程编辑才获得更新时间，显示元数据不改变媒体计划',()=>{
  const old=newProject();delete old.updatedAt;
  const p=editProject(old,{type:'addClip',assetId:'vfr'},assets);
  assert.equal(old.updatedAt,undefined);assert(Number.isFinite(Date.parse(p.updatedAt)));
  const plan=compilePlan(p,assets);p.updatedAt='2000-01-01T00:00:00.000Z';
  assert.equal(compilePlan(p,assets).planHash,plan.planHash);
  assert.throws(()=>editProject(old,{type:'addClip',assetId:'missing'},assets));assert.equal(old.updatedAt,undefined);
});
test('新建工程独立持久化，重复请求不会产生副本或修改旧工程',async()=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'create-'));let s;
  try{
    s=await new ProjectStore(root).init();const old=s.view(),request={title:'真实素材',operationId:'create-project-001'};
    const p=await s.create(request);assert.deepEqual(await s.create(request),p);assert.equal(s.view().projects.length,2);
    assert.deepEqual(s.project(old.projects[0].projectId),old.projects[0]);assert.equal(p.clips.length,0);assert.equal(p.versions.length,0);
    await assert.rejects(s.create({...request,title:'另一项目'}),/操作标识/);
    assert.throws(()=>s.create({title:'x'.repeat(121),operationId:'create-project-002'}),/标题/);
    await s.close();s=await new ProjectStore(root).init();assert.deepEqual(s.project(p.projectId),p);
  }finally{if(s)await s.close();await fs.rm(root,{recursive:true,force:true});}
});
test('微秒量化不能让单帧或两帧裁切多出一帧',()=>{
  for(const t of [33333,33334])assert.equal(outputFrames(t),1);
  for(const t of [66666,66667])assert.equal(outputFrames(t),2);
  assert.equal(outputFrames(100000),3);assert.equal(outputFrames(33336),2);
});
test('VFR 裁切取真实 PTS，输出帧数独立，替换不会遗留旧源',()=>{
  let p=editProject(newProject(),{type:'addClip',assetId:'vfr'},assets);
  const clipId=p.clips[0].clipId;
  p=editProject(p,{type:'trimClip',clipId,inFrame:1,outFrame:3},assets);
  const plan=compilePlan(p,assets);assert.equal(plan.clips[0].startUs,16667);assert.equal(plan.clips[0].endUs,116667);assert.equal(plan.totalFrames,3);
  const replaced=editProject(p,{type:'replaceClip',clipId,assetId:'other'},assets);
  assert.equal(replaced.clips[0].outFrame,2);assert.equal(replaced.clips[0].assetId,'other');assert.equal(p.clips[0].assetId,'vfr');
  assert.throws(()=>editProject(p,{type:'trimClip',clipId,inFrame:3,outFrame:3},assets));
});
test('预览和导出的计划相同，冻结后不受编辑影响',()=>{
  const p=editProject(newProject(),{type:'addClip',assetId:'vfr'},assets);
  const a=compilePlan(p,assets,'preview'),b=compilePlan(p,assets,'export');assert.equal(a.planHash,b.planHash);
  p.clips[0].outFrame=1;assert.equal(a.clips[0].outFrame,4);assert.notEqual(compilePlan(p,assets).planHash,a.planHash);
});

test('替换裁切后的素材按时长换算，不沿用旧入点或旧帧号',()=>{
  const source=(assetId,fps,count)=>({assetId,kind:'video',sha256:'c'.repeat(64),ptsUs:Array.from({length:count},(_,n)=>Math.round(n*1e6/fps)),endUs:Math.round(count*1e6/fps)});
  const media=[source('30fps',30,450),source('25fps',25,200),source('60fps',60,900),source('short',30,30)];
  let p=editProject(newProject(),{type:'addClip',assetId:'30fps'},media);const clipId=p.clips[0].clipId;
  p=editProject(p,{type:'trimClip',clipId,inFrame:24,outFrame:105},media);
  assert.equal(compilePlan(p,media).totalFrames,81);
  for(const [assetId,outFrame,frames]of [['30fps',81,81],['25fps',67,81],['60fps',162,81],['short',30,30]]){
    const q=editProject(p,{type:'replaceClip',clipId,assetId},media);
    assert.deepEqual({clipId:q.clips[0].clipId,assetId:q.clips[0].assetId,inFrame:q.clips[0].inFrame,outFrame:q.clips[0].outFrame},{clipId,assetId,inFrame:0,outFrame});assert.equal(compilePlan(q,media).totalFrames,frames);
  }
  assert.equal(p.clips[0].inFrame,24);assert.equal(p.clips[0].outFrame,105);
});

test('VFR 替换保留输出窗口，小于源帧时长的片段也可替换',()=>{
  const media=[...assets,{assetId:'slow',kind:'video',sha256:'d'.repeat(64),ptsUs:[0,200000],endUs:400000}];
  let p=editProject(newProject(),{type:'addClip',assetId:'other'},media);const clipId=p.clips[0].clipId;
  const q=editProject(p,{type:'replaceClip',clipId,assetId:'vfr'},media);
  assert.equal(compilePlan(q,media).totalFrames,2);
  const copy=structuredClone(p),slow=editProject(p,{type:'replaceClip',clipId,assetId:'slow'},media);assert.equal(compilePlan(slow,media).totalFrames,2);assert.equal(slow.clips[0].window.frames,2);assert.deepEqual(p,copy);
});
test('版本持久化、并发冲突、重放保护和独占写入',async()=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'store-'));let s;
  try {
    s=await new ProjectStore(root).init();const r={projectId:'copy-edit-workspace',expectedRevision:1,operationId:'operation-001',command:{type:'saveCopy',title:'第一版',text:'正文一'}};
    const a=await s.mutate(r);assert.equal(a.versions.length,1);assert.deepEqual(await s.mutate(r),a);
    await assert.rejects(s.mutate({...r,command:{...r.command,text:'偷换'}}),/操作标识/);
    const results=await Promise.allSettled([2,3].map(n=>s.mutate({...r,expectedRevision:2,operationId:'operation-00'+n,command:{type:'saveCopy',title:'第二版',text:'正文'+n}})));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.project(r.projectId).versions[0].text,'正文一');
    await assert.rejects(new ProjectStore(root).init(),/占用/);await s.close();s=await new ProjectStore(root).init();
    assert.equal(s.project(r.projectId).versions.length,2);assert.equal(s.project(r.projectId).revision,3);
  } finally {if(s)await s.close();await fs.rm(root,{recursive:true,force:true});}
});
