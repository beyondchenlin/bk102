import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,editProject,compilePlan} from '../src/project.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {createReadStream} from 'node:fs';import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';import {DesktopMedia} from '../src/desktop-media.mjs';
const video={assetId:'long',kind:'video',sha256:'a'.repeat(64),ptsUs:Array.from({length:2913},(_,i)=>Math.round(i*1e6/30)),endUs:97100000,hasAudio:true};
test('2913帧视频完整加入，旧裁切与VFR分割可显式恢复，原声音量随分割保留',()=>{
 let p=editProject(newProject(),{type:'addClip',assetId:video.assetId},[video]);const id=p.clips[0].clipId;
 assert.equal(compilePlan(p,[video]).totalFrames,2913);assert.equal(p.clips[0].outFrame,2913);
 p=editProject(p,{type:'setSourceVolume',clipId:id,volume:.5},[video]);
 p=editProject(p,{type:'trimClip',clipId:id,inFrame:30,outFrame:150},[video]);
 assert.equal(compilePlan(p,[video]).totalFrames,120);
 p=editProject(p,{type:'restoreClip',clipId:id},[video]);assert.equal(compilePlan(p,[video]).totalFrames,2913);
 p=editProject(p,{type:'splitClip',clipId:id,offsetFrame:71},[video]);assert.equal(compilePlan(p,[video]).totalFrames,2913);assert(p.clips.every(c=>c.sourceVolume===.5));
 p=editProject(p,{type:'removeClip',clipId:p.clips[1].clipId},[video]);p=editProject(p,{type:'restoreClip',clipId:id},[video]);assert.equal(compilePlan(p,[video]).totalFrames,2913);assert.equal(p.clips[0].window,undefined);
 const old=structuredClone(p);delete old.clips[0].sourceVolume;assert.doesNotThrow(()=>compilePlan(old,[video]));
 for(const volume of [-1,1.01,NaN,null,'1'])assert.throws(()=>editProject(p,{type:'setSourceVolume',clipId:id,volume},[video]));
 p=editProject(p,{type:'setSourceVolume',clipId:id,volume:0},[video]);assert.equal(compilePlan(p,[video]).clips[0].sourceVolume,0);
});
test('完整导入仍保留十分钟总时长边界',()=>{
 const a={...video,ptsUs:Array.from({length:18000},(_,i)=>Math.round(i*1e6/30)),endUs:600000000};
 const p=editProject(newProject(),{type:'addClip',assetId:a.assetId},[a]);assert.equal(compilePlan(p,[a]).totalFrames,18000);
 assert.throws(()=>editProject(p,{type:'addClip',assetId:a.assetId},[a]),/10 分钟/);
});
test('真实原声在裁切、VFR分割和导出后保留，静音仅移除所选镜头原声',{skip:process.platform!=='win32'},async()=>{
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'source-audio-'));let store,media;
 try{
  store=await new ProjectStore(root).init();media=await new DesktopMedia(store).init();assert(media.available);
  const input=path.join(root,'source.mp4');await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=180x320:r=30:d=4','-f','lavfi','-i','aevalsrc=0.25*sin(2*PI*(220*t+110*t*t)):s=48000:d=4','-vf',"select='lt(n,60)+gte(n,60)*not(mod(n,2))'",'-fps_mode','vfr','-c:v','libx264','-threads','2','-c:a','aac','-shortest',input]);
  const asset=await media.importStream(createReadStream(input),'source.mp4');assert.equal(asset.hasAudio,true);let p=store.project('copy-edit-workspace');
  const edit=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});
  await edit({type:'addClip',assetId:asset.assetId});assert.equal(p.clips[0].outFrame,90);
  await edit({type:'trimClip',clipId:p.clips[0].clipId,inFrame:51,outFrame:89});
  async function render(profile='preview',sound=true){const j=media.start(p.projectId,p.revision,profile);await media.jobs.get(j.jobId).done;const r=media.job(j.jobId);assert.equal(r.status,'complete',r.error);const file=path.join(root,'jobs',j.jobId,'output.mp4');const probe=JSON.parse((await media.run(media.ffprobe,['-v','error','-show_streams','-of','json',file])).toString());const a=probe.streams.find(s=>s.codec_type==='audio');assert.equal(!!a,sound);if(!sound)return;assert(Math.abs(Number(a.duration)-67/30)<1/48000,JSON.stringify({duration:a.duration,frames:r.totalFrames}));const b=await media.run(media.ffmpeg,['-v','error','-i',file,'-map','0:a:0','-ac','1','-ar','48000','-f','f32le','pipe:1']);const pcm=new Float32Array(b.buffer,b.byteOffset,b.length/4);let energy=0;for(const x of pcm)energy+=x*x;assert(energy/pcm.length>.005);return pcm;}
  const original=await render();await edit({type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:17});
  for(const profile of ['preview','export']){const split=await render(profile);let diff=0,energy=0;for(let i=0;i<Math.min(original.length,split.length);i++){diff+=(original[i]-split[i])**2;energy+=original[i]**2;}assert(diff/energy<.002,{profile,ratio:diff/energy});}
  for(const c of p.clips)await edit({type:'setSourceVolume',clipId:c.clipId,volume:0});await render('preview',false);
 }finally{await media?.close();await store?.close();await fs.rm(root,{recursive:true,force:true});}
});
