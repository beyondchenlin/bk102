import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {newProject,editProject,compilePlan} from '../../../plugins/dsh-copy-edit/src/project.mjs';
import {freezeNativePlan} from '../../../plugins/dsh-copy-edit/src/native-media.mjs';
const dir=path.resolve(import.meta.dirname,'../app/src/main/assets/fixtures'),ffmpeg='E:/ffmpeg/bin/ffmpeg.exe',ffprobe='E:/ffmpeg/bin/ffprobe.exe';
execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=s=180x320:r=30:d=97.1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=97.1','-c:v','libx264','-threads','2','-preset','fast','-crf','28','-bf','3','-c:a','aac','-b:a','96k','-shortest',path.join(dir,'long-audio.mp4')]);
execFileSync(ffmpeg,['-v','error','-y','-i',path.join(dir,'vfr.mp4'),'-f','lavfi','-i','aevalsrc=0.25*sin(2*PI*(220*t+110*t*t)):s=48000:d=6','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',path.join(dir,'vfr-audio.mp4')]);
const assets=[];
for(const name of ['long-audio.mp4','vfr-audio.mp4','bgm.wav']){
 const file=path.join(dir,name),video=name.endsWith('.mp4'),info=JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams',...(video?['-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time']:[]),'-of','json',file]));
 assets.push({assetId:name,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),kind:video?'video':'audio',...(video?{ptsUs:info.frames.map(f=>Math.round(Number(f.best_effort_timestamp_time)*1e6)),endUs:Math.round(Number(info.streams[0].duration)*1e6),hasAudio:true}:{durationUs:Math.round(Number(info.format.duration)*1e6)})});
}
const start=id=>editProject(newProject('native-fixture-project'),{type:'addClip',assetId:id},assets),cases=[];
cases.push(['long',start('long-audio.mp4'),['preview']]);
let p=start('long-audio.mp4');p=editProject(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:120},assets);p=editProject(p,{type:'setSourceVolume',clipId:p.clips[0].clipId,volume:0},assets);cases.push(['muted',p,['preview']]);
p=start('vfr-audio.mp4');p=editProject(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:51,outFrame:89},assets);cases.push(['vfr',p,['preview','export']]);
p=editProject(p,{type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:17},assets);cases.push(['vfr-split',p,['preview']]);
p=editProject(p,{type:'setAudio',role:'bgm',assetId:'bgm.wav',volume:.2},assets);cases.push(['mix',p,['preview']]);
const expected=[];
for(const [name,project,profiles] of cases){project.revision=1;const plan=compilePlan(project,assets,'preview');await fs.writeFile(path.join(dir,`native-source-${name}.json`),JSON.stringify(freezeNativePlan(plan)));expected.push({name,profiles,frames:plan.totalFrames,audio:name!=='muted'});}
await fs.writeFile(path.join(dir,'native-source-expectations.json'),JSON.stringify(expected,null,2));console.log(JSON.stringify(expected));
