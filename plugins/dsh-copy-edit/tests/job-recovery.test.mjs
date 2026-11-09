import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DesktopMedia} from '../src/desktop-media.mjs';
test('宿主重启/热更新后旧任务明确退休，查询和取消均不重新渲染',async()=>{
 const state={results:[]},old=new DesktopMedia({state}),controller=new AbortController();
 old.jobs.set('pending',{jobId:'pending',status:'running',controller});assert.equal(old.job('pending').status,'running');
 const restarted=new DesktopMedia({state});restarted.render=()=>{throw Error('不能重发');};
 const result=restarted.job('pending');assert.equal(result.status,'retired');assert.equal(result.reasonCode,'JOB_NOT_RETAINED');assert.deepEqual(await restarted.cancel('pending'),result);
 assert.equal(old.job('pending').status,'running');assert.equal(controller.signal.aborted,false);
});
test('正在进行的任务继续查询/取消，已落盘成功结果仍可恢复',async()=>{
 const success={jobId:'complete',status:'complete',sha256:'abc'},m=new DesktopMedia({state:{results:[success]}}),controller=new AbortController();
 const j={jobId:'running',status:'running',controller};j.done=new Promise(resolve=>controller.signal.addEventListener('abort',()=>{j.status='cancelled';resolve();}));m.jobs.set(j.jobId,j);
 assert.equal(m.job(j.jobId).status,'running');assert.equal((await m.cancel(j.jobId)).status,'cancelled');assert.deepEqual(m.job(success.jobId),success);assert.deepEqual(await m.cancel(success.jobId),success);
});
