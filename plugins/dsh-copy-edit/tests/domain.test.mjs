import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frameToUs,selectPts,getProject,summary} from '../src/domain.mjs';
test('有理数帧率，无累计浮点误差',()=>{
  assert.equal(frameToUs(30),1000000);assert.equal(frameToUs(30000,30000,1001),1001000000);
  assert.equal(frameToUs(1),33333);assert.equal(frameToUs(1799),59966666);
  for(const value of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>frameToUs(value));
  assert.throws(()=>frameToUs(1,0));assert.throws(()=>frameToUs(Number.MAX_SAFE_INTEGER));
});
test('VFR 半开帧区间、末帧、无效 PTS',()=>{
  const pts=[0,16667,50000,100000];
  assert.equal(selectPts(pts,49999),1);assert.equal(selectPts(pts,50000),2);assert.equal(selectPts(pts,100000),3);
  assert.throws(()=>selectPts([10,5],10));assert.throws(()=>selectPts([10,10],10));assert.throws(()=>selectPts([10],0));
});
test('RPC 与工具共享身份，返回对象不污染模板',()=>{
  const a=getProject('copy-edit-example');a.sticker.lines[0]='modified';
  assert.equal(getProject(a.projectId).sticker.lines[0],'慢一点');
  assert.deepEqual(summary(a.projectId),{projectId:a.projectId,revision:1,title:a.title,schemaVersion:1});
  assert.throws(()=>getProject('../../secret'));assert.equal(a.media.local1080pExport,false);
});
