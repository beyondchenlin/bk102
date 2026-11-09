// 自制既有素材，只读输入；所有新产物位于独立桌面验收目录。
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/store.mjs';
import {DesktopMedia} from '../src/desktop-media.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),base=path.join(root,'build/copy-edit-desktop');
await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'media-'));
const store=await new ProjectStore(dir).init();const media=await new DesktopMedia(store,{ffmpeg:'E:/ffmpeg/bin/ffmpeg.exe',ffprobe:'E:/ffmpeg/bin/ffprobe.exe'}).init();
const report={directory:dir,checks:[]};let seq=0;
const edit=command=>store.mutate({projectId:'copy-edit-workspace',expectedRevision:store.project('copy-edit-workspace').revision,operationId:'media-check-'+(++seq),command});
try {
  assert(media.available);
  const fixture=path.join(root,'experiments/copy-edit-media/app/src/main/assets/fixtures');
  const inputs=[];
  for(const name of ['bframes.mp4','b.mp4','vfr.mp4','voice.wav','bgm.wav'])inputs.push(await media.importStream(createReadStream(path.join(fixture,name)),name));
  const [a,b,vfr,voice,bgm]=inputs;
  await edit({type:'saveCopy',title:'桌面验证',text:'第一句。\n第二句。'});
  await edit({type:'addClip',assetId:a.assetId});await edit({type:'addClip',assetId:b.assetId});
  let p=store.project('copy-edit-workspace');
  await edit({type:'trimClip',clipId:p.clips[0].clipId,inFrame:7,outFrame:67});
  await edit({type:'trimClip',clipId:p.clips[1].clipId,inFrame:11,outFrame:71});
  await edit({type:'setAudio',role:'voice',assetId:voice.assetId,volume:1});await edit({type:'setAudio',role:'bgm',assetId:bgm.assetId,volume:0.2});
  const still=await media.frame(a.assetId,7);assert(still.length>100);await fs.writeFile(path.join(dir,'frame-7.png'),still);
  for(const profile of ['preview','export']) {
    p=store.project(p.projectId);const job=media.start(p.projectId,p.revision,profile);await media.jobs.get(job.jobId).done;
    const result=media.job(job.jobId);assert.equal(result.status,'complete',JSON.stringify(result));assert.equal(result.totalFrames,120);report.checks.push(result);
  }
  const previous=report.checks.at(-1);
  await edit({type:'replaceClip',clipId:p.clips[0].clipId,assetId:vfr.assetId});
  p=store.project(p.projectId);const cancelled=media.start(p.projectId,p.revision,'export');await media.cancel(cancelled.jobId);
  assert.equal(media.job(cancelled.jobId).status,'cancelled');assert.equal(store.state.results.at(-1).sha256,previous.sha256);
  assert.equal((await fs.readdir(path.join(dir,'jobs',cancelled.jobId)).catch(()=>[])).length,0);
  report.cancel='PASS';report.status='PASS';
  // 真正跑单帧、VFR 与一分钟上界，不能只验证时间算式。
  await edit({type:'removeClip',clipId:p.clips[1].clipId});
  await edit({type:'replaceClip',clipId:p.clips[0].clipId,assetId:a.assetId});
  for(const [first,last] of [[0,1],[1,2],[2,3],[1,3]]) {
    await edit({type:'trimClip',clipId:p.clips[0].clipId,inFrame:first,outFrame:last});p=store.project(p.projectId);
    const j=media.start(p.projectId,p.revision,'preview');await media.jobs.get(j.jobId).done;
    assert.equal(media.job(j.jobId).status,'complete',JSON.stringify(media.job(j.jobId)));assert.equal(j.totalFrames,last-first);
    report.checks.push({case:'single-or-two-frames',first,last,...media.job(j.jobId)});
  }
  await edit({type:'replaceClip',clipId:p.clips[0].clipId,assetId:vfr.assetId});
  await edit({type:'trimClip',clipId:p.clips[0].clipId,inFrame:59,outFrame:64});p=store.project(p.projectId);
  const v=media.start(p.projectId,p.revision,'preview');await media.jobs.get(v.jobId).done;
  assert.equal(media.job(v.jobId).status,'complete',JSON.stringify(media.job(v.jobId)));assert.equal(v.totalFrames,9);report.checks.push({case:'vfr',...media.job(v.jobId)});
  await edit({type:'removeClip',clipId:p.clips[0].clipId});
  for(let i=0;i<15;i++)await edit({type:'addClip',assetId:b.assetId});
  p=store.project(p.projectId);const long=media.start(p.projectId,p.revision,'export');await media.jobs.get(long.jobId).done;
  assert.equal(media.job(long.jobId).status,'complete',JSON.stringify(media.job(long.jobId)));assert.equal(long.totalFrames,1800);report.checks.push({case:'60-seconds',...media.job(long.jobId)});
}catch(e){report.status='FAIL';report.error=e.stack;throw e;}
finally {await media.close();await store.close();await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
