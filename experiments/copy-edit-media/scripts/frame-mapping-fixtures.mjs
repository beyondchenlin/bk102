// 小型自制条码素材；计划由真实插件编译，预期选帧由共享工程时间规则生成。
import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {newProject,compilePlan} from '../../../plugins/dsh-copy-edit/src/project.mjs';
import {freezeNativePlan} from '../../../plugins/dsh-copy-edit/src/native-media.mjs';
import {clipWindow,windowClip,sourceFrameAt} from '../../../plugins/dsh-copy-edit/src/timeline.mjs';
const dir=path.resolve(import.meta.dirname,'../app/src/main/assets/fixtures');
for(const [name,rate] of [['24fps.mp4','24'],['2997fps.mp4','30000/1001']]){
 const filters=['drawbox=x=24:y=24:w=212:h=50:color=black:t=fill',...Array.from({length:8},(_,bit)=>`drawbox=x=${32+bit*24}:y=32:w=16:h=32:color=white:t=fill:enable='mod(floor(n/${2**bit}),2)'`)];
 execFileSync('E:/ffmpeg/bin/ffmpeg.exe',['-v','error','-y','-f','lavfi','-i',`color=c=0x28384a:s=360x640:r=${rate}:d=3`,'-vf',filters.join(','),'-c:v','libx264','-preset','fast','-g','90','-bf','3','-pix_fmt','yuv420p','-an',path.join(dir,name)]);
}
const names=['vfr.mp4','60fps.mp4','24fps.mp4','2997fps.mp4','bframes.mp4','bgm.wav'],assets=[];
for(const name of names){const file=path.join(dir,name),video=name.endsWith('.mp4'),probe=JSON.parse(execFileSync('E:/ffmpeg/bin/ffprobe.exe',['-v','error','-show_format','-show_streams',...(video?['-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time']:[]),'-of','json',file]));const durationUs=Math.round(Number(probe.format.duration)*1e6);
 assets.push({assetId:name,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),kind:video?'video':'audio',...(video?{ptsUs:probe.frames.map(f=>Math.round(Number(f.best_effort_timestamp_time)*1e6)),endUs:durationUs}:{durationUs})});
}
const clip=(assetId,inFrame,outFrame)=>({clipId:assetId.replace('.','-'),assetId,inFrame,outFrame});
const cases=[['vfr',[clip('vfr.mp4',51,89)]],['60fps',[clip('60fps.mp4',17,137)]],['24fps',[clip('24fps.mp4',7,60)]],['2997fps',[clip('2997fps.mp4',7,60)]],['bframes',[clip('bframes.mp4',17,77)]]];
for(const [id,clips] of cases.slice(0,3)){const c=clips[0],a=assets.find(a=>a.assetId===c.assetId),w=clipWindow(c,a),split=17;
 cases.push([id+'-split',[windowClip(c,a,{...w,frames:split}),{...windowClip(c,a,{...w,offset:split,frames:w.frames-split}),clipId:c.clipId+'-right'}]]);
}
cases.push(['mixed',[clip('24fps.mp4',7,31),clip('60fps.mp4',17,77),clip('vfr.mp4',55,85)]]);
const evidence=[];
for(const [name,clips] of cases){const p=newProject('native-fixture-project','帧率映射验收');p.clips=clips;p.audio={voiceMode:'independent',voice:null,bgm:{assetId:'bgm.wav',volume:.2}};
 const plan=compilePlan(p,assets,'preview'),expected=[];
 for(const c of clips){const a=assets.find(a=>a.assetId===c.assetId),w=clipWindow(c,a);for(let n=0;n<w.frames;n++){const index=sourceFrameAt(c,a,n);expected.push(c.assetId==='vfr.mp4'&&index>=60?60+(index-60)*2:index);}}
 await fs.writeFile(path.join(dir,`native-mapping-${name}.json`),JSON.stringify(freezeNativePlan(plan)));
 evidence.push({name,expectedFrames:expected.length,barcodes:expected,profiles:['preview',...(['vfr','60fps','24fps','mixed'].includes(name)?['export']:[])]});
}
await fs.writeFile(path.join(dir,'native-mapping-expectations.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence.map(({barcodes,...x})=>x)));
