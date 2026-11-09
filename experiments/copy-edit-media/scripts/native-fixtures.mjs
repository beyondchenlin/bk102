// 只使用仓库自制媒体，真实调用插件compilePlan，不复制第二份工程编译规则。
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {newProject,compilePlan} from '../../../plugins/dsh-copy-edit/src/project.mjs';
import {freezeNativePlan} from '../../../plugins/dsh-copy-edit/src/native-media.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'app/src/main/assets/fixtures');
const sha=b=>createHash('sha256').update(b).digest('hex'),assets=[];
for(const name of ['a.mp4','b.mp4','voice.wav','bgm.wav','native-sticker.png','native-sticker-alt.png']){
 const file=path.join(dir,name),image=name.endsWith('.png'),video=name.endsWith('.mp4');
 const probe=JSON.parse(execFileSync('E:/ffmpeg/bin/ffprobe.exe',['-v','error','-show_streams','-show_format',...(video?['-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time']:[]),'-of','json',file]));
 const durationUs=Math.round(Number(probe.format.duration||0)*1e6);
 assets.push({assetId:name,sha256:sha(await fs.readFile(file)),kind:image?'image':video?'video':'audio',...(video?{ptsUs:probe.frames.map(f=>Math.round(Number(f.best_effort_timestamp_time)*1e6)),endUs:durationUs}:{durationUs})});
}
for(const full of [false,true])for(const alternate of [false,true]){
 const p=newProject('native-fixture-project','手机原生冻结计划');p.revision=alternate?2:1;p.audio={voiceMode:'independent',voice:null,bgm:{assetId:'bgm.wav',volume:.18}};
 p.voiceClips=[{voiceId:'narration',assetId:'voice.wav',text:'自制提示音',copyVersion:null,inUs:0,outUs:(full?60:4)*1e6,startFrame:0,volume:.7}];
 for(let i=0;i<(full?15:1);i++)p.clips.push({clipId:'a-'+i,assetId:'a.mp4',inFrame:17,outFrame:77},{clipId:'b-'+i,assetId:'b.mp4',inFrame:23,outFrame:83});
 const sticker={assetId:alternate?'native-sticker-alt.png':'native-sticker.png',text:alternate?'慢一点\n再出发':'慢一点\n也很好',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,width:760,x:160,y:1300};
 // 两个独立PNG区间：接缝帧60从第一份切到第二份；两者位置不同，读回可定位。
 p.stickers=[{...sticker,stickerId:'first',startFrame:0,endFrame:60},{...sticker,stickerId:'second',x:240,width:600,y:1000,startFrame:60,endFrame:full?1800:120}];
 const plan=compilePlan(p,assets,'export');await fs.writeFile(path.join(dir,`native-plan-${full?60:4}-${alternate?2:1}.json`),JSON.stringify(freezeNativePlan(plan)));
 if(!full&&!alternate){const tail=structuredClone(p);tail.voiceClips[0].startFrame=30;tail.voiceClips[0].outUs=5_000_000;await fs.writeFile(path.join(dir,'native-plan-tail.json'),JSON.stringify(freezeNativePlan(compilePlan(tail,assets,'preview'))));}
}
await fs.writeFile(path.join(dir,'native-assets.json'),JSON.stringify(assets.map(({assetId,sha256,kind})=>({assetId,sha256,kind})),null,2));
console.log('已生成4份插件冻结计划及自制素材摘要清单');
