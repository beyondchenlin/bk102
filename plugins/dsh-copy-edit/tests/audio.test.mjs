import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import{createReadStream}from'node:fs';import{randomUUID}from'node:crypto';
import{ProjectStore}from'../src/store.mjs';import{DesktopMedia}from'../src/desktop-media.mjs';

test('真实编码：裁切镜头的混音保留立体声、补偿延迟，预览与导出声音相同',{skip:process.platform!=='win32'},async()=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'audio-'));let store,media;
  try{
    store=await new ProjectStore(root).init();media=await new DesktopMedia(store).init();assert(media.available,'需设置 COPY_EDIT_FFMPEG/COPY_EDIT_FFPROBE 后执行真实媒体回归');
    const sr=48000,voice=new Float32Array(sr*2),bgm=new Float32Array(sr*2);
    for(let n=0;n<sr*2;n++)for(const p of [.5,1.5]){const t=n/sr-p;if(t>=0&&t<.06)voice[n]+=.5*Math.sin(2*Math.PI*1000*t)*Math.sin(Math.PI*t/.06)**2;}
    for(let n=0;n<sr;n++){bgm[2*n]=.12*Math.sin(2*Math.PI*220*n/sr);bgm[2*n+1]=.12*Math.sin(2*Math.PI*330*n/sr);}
    async function wav(name,data,channels){const raw=path.join(root,name+'.raw'),out=path.join(root,name+'.wav');await fs.writeFile(raw,Buffer.from(data.buffer));await media.run(media.ffmpeg,['-v','error','-f','f32le','-ar',String(sr),'-ac',String(channels),'-i',raw,'-c:a','pcm_s16le',out]);return media.importStream(createReadStream(out),name+'.wav');}
    const va=await wav('voice',voice,1),ba=await wav('bgm',bgm,2),video=path.join(root,'video.mp4');
    await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i','color=black:s=180x320:r=30:d=6','-vf',"drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n,75)+eq(n,105)'",'-c:v','libx264','-threads','2','-pix_fmt','yuv420p',video]);
    const a=await media.importStream(createReadStream(video),'video.mp4');let p=store.project('copy-edit-workspace');
    const edit=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});
    await edit({type:'addClip',assetId:a.assetId});await edit({type:'trimClip',clipId:p.clips[0].clipId,inFrame:60,outFrame:180});await edit({type:'setAudio',role:'voice',assetId:va.assetId,volume:1});await edit({type:'setAudio',role:'bgm',assetId:ba.assetId,volume:.2});
    const decoded=[];
    for(const profile of ['preview','export']){
      const job=media.start(p.projectId,p.revision,profile);await media.jobs.get(job.jobId).done;const result=media.job(job.jobId);assert.equal(result.status,'complete',result.error);assert.equal(result.renderVersion,media.capabilities().renderVersion);assert(result.renderVersion);
      const file=path.join(root,'jobs',job.jobId,'output.mp4'),probe=JSON.parse((await media.run(media.ffprobe,['-v','error','-show_streams','-of','json',file])).toString()),audio=probe.streams.find(s=>s.codec_type==='audio');
      assert.equal(audio.channels,2);assert.equal(audio.sample_rate,'48000');assert(Math.abs(Number(audio.duration)-4)<1/sr);assert.equal(Number(audio.start_time),0);
      const b=await media.run(media.ffmpeg,['-v','error','-i',file,'-map','0:a','-f','f32le','-c:a','pcm_f32le','pipe:1']);const pcm=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);decoded.push(b);
      // 直接对源采样求相关，既能抓出 5ms 固定延迟，也不会把播放器时间戳当成音频证据。
      for(const start of [.5,1.5]){let best={score:-1,lag:999};for(let lag=-300;lag<=300;lag++){let dot=0,x2=0,y2=0;for(let n=Math.round(start*sr);n<Math.round((start+.06)*sr);n+=4){const expected=voice[n]*Math.SQRT1_2+bgm[2*(n%sr)]*.2,actual=pcm[2*(n+lag)];dot+=expected*actual;x2+=expected**2;y2+=actual**2;}const score=dot/Math.sqrt(x2*y2);if(score>best.score)best={score,lag};}assert(Math.abs(best.lag)<=2,JSON.stringify(best));assert(best.score>.995,JSON.stringify(best));}
      // 配音结束后的背景音乐仍在，左右两个频率不能被折叠成相同样本。
      let diff=0,energy=0;for(let n=sr*3;n<sr*4;n++){diff+=(pcm[2*n]-pcm[2*n+1])**2;energy+=pcm[2*n]**2;}assert(diff/sr>0.0001);assert(energy/sr>0.0001);
      const pixels=await media.run(media.ffmpeg,['-v','error','-i',file,'-vf','scale=1:1,format=gray','-f','rawvideo','-an','pipe:1']);assert.equal(pixels.length,120);assert(pixels[15]>240&&pixels[14]<10&&pixels[16]<10);assert(pixels[45]>240);
    }
    assert.deepEqual(decoded[0],decoded[1]);
    // 同一真实管线验证逐镜头配音：视频裁切与替换后，第二句随分镜前移，BGM 不重启。
    await edit({type:'setVoiceMode',mode:'clips'});
    const first=p.clips[0].clipId;await edit({type:'trimClip',clipId:first,inFrame:60,outFrame:127});
    await edit({type:'setNarration',clipId:first,narration:{text:'第一句',copyVersion:null,voice:{assetId:va.assetId,inUs:0,outUs:1e6,volume:1}}});
    await edit({type:'replaceClip',clipId:first,assetId:a.assetId});
    await edit({type:'addClip',assetId:a.assetId});const second=p.clips[1].clipId;
    await edit({type:'trimClip',clipId:second,inFrame:30,outFrame:120});
    await edit({type:'setNarration',clipId:second,narration:{text:'第二句',copyVersion:null,voice:{assetId:va.assetId,inUs:1e6,outUs:2e6,volume:1}}});
    // 用透明 PNG 内红块验证坐标与缩放，没有以 CSS 截图代替实际合成结果。
    const png=path.join(root,'overlay.png');await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i','color=black@0:s=1080x400,format=rgba','-vf','drawbox=x=100:y=100:w=200:h=100:color=red@1:t=fill:replace=1','-frames:v','1',png]);
    const image=await media.importStream(createReadStream(png),'overlay.png');await edit({type:'setSticker',sticker:{assetId:image.assetId,text:'marker',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:270,y:900,width:540}});
    const bound=[];
    for(const profile of ['preview','export']){
      const job=media.start(p.projectId,p.revision,profile);await media.jobs.get(job.jobId).done;const r=media.job(job.jobId);assert.equal(r.status,'complete',r.error);assert.equal(r.totalFrames,157);
      const file=path.join(root,'jobs',job.jobId,'output.mp4');const b=await media.run(media.ffmpeg,['-v','error','-i',file,'-map','0:a','-f','f32le','-c:a','pcm_f32le','pipe:1']);bound.push(b);const pcm=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
      // 在 0.5s 与前移后的 2.5s 检测原波形，音轨起点按整数样本延迟。
      for(const [time,source]of [[.5,.5],[67/30+.5,1.5]]){let best={score:-1,lag:999};for(let lag=-300;lag<=300;lag++){let dot=0,x2=0,y2=0;for(let i=0;i<.06*sr;i+=4){const n=Math.round(time*sr)+i,expected=voice[Math.round(source*sr)+i]*Math.SQRT1_2+bgm[2*(n%sr)]*.2,actual=pcm[2*(n+lag)];dot+=expected*actual;x2+=expected**2;y2+=actual**2;}const score=dot/Math.sqrt(x2*y2);if(score>best.score)best={score,lag,gain:dot/x2,time,profile};}assert(Math.abs(best.lag)<=2,JSON.stringify(best));assert(best.score>.995,JSON.stringify(best));}
      const rgb=await media.run(media.ffmpeg,['-v','error','-i',file,'-frames:v','1','-vf','scale=108:192,format=rgb24','-f','rawvideo','-an','pipe:1']);
      const pixel=(x,y)=>Array.from(rgb.subarray((y*108+x)*3,(y*108+x)*3+3));const red=pixel(36,97);assert(red[0]>180&&red[1]<65&&red[2]<65,JSON.stringify({profile,red}));assert(pixel(10,10).every(c=>c<25));
      // 镜头交界前后仍匹配全局 BGM，右声道 330Hz 没有按镜头归零。
      let err=0,energy=0;for(let n=Math.round((67/30-.06)*sr);n<Math.round((67/30+.06)*sr);n++){const want=bgm[2*(n%sr)+1]*.2;err+=(pcm[n*2+1]-want)**2;energy+=want**2;}assert(err/energy<.03);
    }
    assert.deepEqual(bound[0],bound[1]);
    // 多贴片：交接、重叠覆盖与仅一帧出现，逐帧解码确认没有串字或残留。
    await edit({type:'trimSticker',stickerId:'legacy-sticker',startFrame:0,endFrame:61});
    const blueFile=path.join(root,'blue.png');await media.run(media.ffmpeg,['-v','error','-f','lavfi','-i','color=black@0:s=1080x400,format=rgba','-vf','drawbox=x=100:y=100:w=200:h=100:color=blue@1:t=fill:replace=1','-frames:v','1',blueFile]);
    const blue=await media.importStream(createReadStream(blueFile),'blue.png');
    const sticker={assetId:blue.assetId,text:'蓝色',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:270,y:900,width:540};
    await edit({type:'addSticker',sticker:{...sticker,startFrame:30,endFrame:90}});
    await edit({type:'addSticker',sticker:{...sticker,assetId:image.assetId,x:30,y:100,startFrame:90,endFrame:91}});
    for(const profile of ['preview','export']){
      const job=media.start(p.projectId,p.revision,profile);await media.jobs.get(job.jobId).done;const r=media.job(job.jobId);assert.equal(r.status,'complete',r.error);assert.equal(r.totalFrames,157);
      const file=path.join(root,'jobs',job.jobId,'output.mp4');const pcm=await media.run(media.ffmpeg,['-v','error','-i',file,'-map','0:a','-f','f32le','-c:a','pcm_f32le','pipe:1']);assert.deepEqual(pcm,bound[0]);
      const rgb=await media.run(media.ffmpeg,['-v','error','-i',file,'-vf','scale=108:192,format=rgb24','-f','rawvideo','-an','pipe:1']);assert.equal(rgb.length,108*192*3*157);
      const pixel=(f,x,y)=>Array.from(rgb.subarray((f*108*192+y*108+x)*3,(f*108*192+y*108+x)*3+3));
      for(const f of [0,28,29]){const c=pixel(f,36,97);assert(c[0]>180&&c[1]<65&&c[2]<65,JSON.stringify({profile,f,c}));}
      for(const f of [30,59,60,61,89]){const c=pixel(f,36,97);assert(c[2]>180&&c[0]<65&&c[1]<65,JSON.stringify({profile,f,c}));}
      for(const f of [90,91,100])assert(pixel(f,36,97).every(c=>c<25),JSON.stringify({profile,f,pixel:pixel(f,36,97)}));
      const one=pixel(90,13,17);assert(one[0]>180&&one[1]<65&&one[2]<65,JSON.stringify({profile,one}));for(const f of [89,91])assert(pixel(f,13,17).every(c=>c<25));
    }
  }finally{if(media)await media.close();if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
});
