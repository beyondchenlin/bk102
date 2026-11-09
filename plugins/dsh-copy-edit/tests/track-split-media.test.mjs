import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createReadStream} from 'node:fs';import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';import {DesktopMedia} from '../src/desktop-media.mjs';
test('真实音频：配音和循环BGM分割保持逐采样一致，删除音乐左段后右段相位保持',{skip:process.platform!=='win32'},async()=>{
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'track-audio-'));let store,media;
 try{store=await new ProjectStore(root).init();media=await new DesktopMedia(store).init();assert(media.available);
 const files={video:['color=black:s=108x192:r=30:d=2.4','mp4'],voice:['sine=frequency=457:sample_rate=48000:duration=2.4','wav'],bgm:['aevalsrc=0.1*sin(2*PI*217*t)|0.1*sin(2*PI*329*t):s=48000:d=0.37','wav']},assets={};
 for(const [key,[input,ext]]of Object.entries(files)){const file=path.join(root,key+'.'+ext);await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i',input,...(ext==='mp4'?['-c:v','libx264','-threads','2']:[]),file]);assets[key]=await media.importStream(createReadStream(file),key+'.'+ext);}
 let p=store.project('copy-edit-workspace');const edit=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});await edit({type:'addClip',assetId:assets.video.assetId});for(const role of ['voice','bgm'])await edit({type:'setAudio',role,assetId:assets[role].assetId,volume:.2});
 async function pcm(profile){const j=media.start(p.projectId,p.revision,profile);await media.jobs.get(j.jobId).done;const r=media.job(j.jobId);assert.equal(r.status,'complete',r.error);assert.equal(r.totalFrames,72);return media.run(media.ffmpeg,['-v','error','-i',path.join(root,'jobs',j.jobId,'output.mp4'),'-map','0:a','-f','f32le','-c:a','pcm_f32le','pipe:1']);}
 const baseline=await pcm('preview');await edit({type:'splitVoice',voiceId:'voice-global',frame:37});await edit({type:'splitMusic',musicId:'music-global',frame:37});assert.deepEqual(await pcm('preview'),baseline);
 // 仅留下音乐右段，检查前段静音、恢复时的左右声道和循环相位。
 for(const v of [...p.voiceClips])await edit({type:'removeVoice',voiceId:v.voiceId});await edit({type:'removeMusic',musicId:p.musicClips[0].musicId});const cut=await pcm('preview'),exported=await pcm('export');assert.deepEqual(cut,exported);
 const samples=new Float32Array(cut.buffer,cut.byteOffset,cut.length/4);let quiet=0;for(let n=0;n<48000;n++)quiet=Math.max(quiet,Math.abs(samples[n*2]));assert(quiet<.0001,quiet);
 for(const [channel,hz]of [[0,217],[1,329]]){let dot=0,x2=0,y2=0;for(let n=65000;n<100000;n++){const t=(n%17760)/48000,expected=.02*Math.sin(2*Math.PI*hz*t),actual=samples[n*2+channel];dot+=expected*actual;x2+=expected**2;y2+=actual**2;}assert(dot/Math.sqrt(x2*y2)>.99,JSON.stringify({channel,correlation:dot/Math.sqrt(x2*y2)}));}
 }finally{if(media)await media.close();if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
});
