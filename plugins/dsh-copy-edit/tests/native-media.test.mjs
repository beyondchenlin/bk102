import test from 'node:test';import assert from 'node:assert/strict';
import {newProject,compilePlan} from '../src/project.mjs';import {freezeNativePlan,nativeMediaCapability} from '../src/native-media.mjs';
test('原生请求冻结真实compilePlan字节、修订和输出配置，改动摘要后拒绝',()=>{
 const p=newProject('native-test');p.clips=[{clipId:'clip',assetId:'asset',inFrame:0,outFrame:3}];const assets=[{assetId:'asset',kind:'video',sha256:'a'.repeat(64),ptsUs:[0,33333,66667],endUs:100000}];
 const plan=compilePlan(p,assets),request=freezeNativePlan(plan);assert.equal(request.projectId,p.projectId);assert.equal(JSON.parse(request.planJson).clips[0].frames,3);assert.equal(Object.isFrozen(request),true);
 plan.clips[0].frames=2;assert.throws(()=>freezeNativePlan(plan),/摘要/);assert.equal(JSON.parse(request.planJson).clips[0].frames,3);
});
test('原生能力缺失或不明确本地执行时保持降级',()=>{
 for(const p of [undefined,{}, {protocol:1,available:true}, {protocol:2,available:true,executionLocation:'android-local'}])assert.equal(nativeMediaCapability(p),false);
 assert.equal(nativeMediaCapability({protocol:1,available:true,executionLocation:'android-local'}),true);
});
