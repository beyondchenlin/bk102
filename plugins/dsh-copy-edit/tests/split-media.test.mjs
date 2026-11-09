import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createReadStream} from 'node:fs';import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';import {DesktopMedia} from '../src/desktop-media.mjs';
test('真实 25fps：两处分割不添丢帧，删中段保留完整声音，预览和1080P一致',{skip:process.platform!=='win32'},async()=>{
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'split-media-'));let store,media;
 try{
  store=await new ProjectStore(root).init();media=await new DesktopMedia(store).init();assert(media.available);
  const file=path.join(root,'ramp.mp4');await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i','color=black:s=108x192:r=25:d=1','-vf','geq=lum=20+N*8:cb=128:cr=128','-c:v','libx264','-crf','0','-threads','2',file]);
  const a=await media.importStream(createReadStream(file),'ramp.mp4'),audio=path.join(root,'voice.wav');await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.2',audio]);const v=await media.importStream(createReadStream(audio),'voice.wav');
  let p=store.project('copy-edit-workspace');const edit=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});
  await edit({type:'addClip',assetId:a.assetId});await edit({type:'setVoiceMode',mode:'clips'});await edit({type:'setNarration',clipId:p.clips[0].clipId,narration:{text:'完整配音',copyVersion:null,voice:{assetId:v.assetId,inUs:0,outUs:1200000,volume:1}}});
  async function render(profile){const j=media.start(p.projectId,p.revision,profile);await media.jobs.get(j.jobId).done;const r=media.job(j.jobId);assert.equal(r.status,'complete',r.error);assert.equal(r.totalFrames,36);const out=path.join(root,'jobs',j.jobId,'output.mp4');return {r,pixels:await media.run(media.ffmpeg,['-v','error','-i',out,'-vf','scale=1:1,format=gray','-f','rawvideo','-an','pipe:1']),pcm:await media.run(media.ffmpeg,['-v','error','-i',out,'-map','0:a','-f','f32le','-c:a','pcm_f32le','pipe:1'])};}
  const baseline=await render('preview');assert.equal(baseline.pixels.length,36);
  await edit({type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:7});await edit({type:'splitClip',clipId:p.clips[1].clipId,offsetFrame:11});const split=await render('preview');
  for(let i=0;i<36;i++)assert(Math.abs(baseline.pixels[i]-split.pixels[i])<=2,JSON.stringify({i,before:baseline.pixels[i],after:split.pixels[i]}));assert.deepEqual(baseline.pcm,split.pcm);
  await edit({type:'removeClip',clipId:p.clips[1].clipId});const expected=[...baseline.pixels.subarray(0,7),...baseline.pixels.subarray(18,30),...Array(17).fill(0)];
  for(const profile of ['preview','export']){const cut=await render(profile);assert.equal(cut.pixels.length,36);for(let i=0;i<36;i++)assert(Math.abs(expected[i]-cut.pixels[i])<=3,JSON.stringify({profile,i,expected:expected[i],actual:cut.pixels[i]}));assert.deepEqual(baseline.pcm,cut.pcm);if(profile==='export')assert.equal(cut.r.width,1080);}
 }finally{if(media)await media.close();if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
});
