import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {id,assetOf,integer,compilePlan,newProject,editProject} from './project.mjs';

const FORMATS='mov,matroska,webm,wav,mp3,png_pipe';
const SAFE=['-protocol_whitelist','file,pipe','-format_whitelist',FORMATS];
// 渲染语义改变时升级此标识。旧文件保留，但不能作为新引擎的预览缓存。
const RENDER_VERSION='desktop-ffmpeg-av7-source-audio';
export async function hashFile(file) {const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export class DesktopMedia {
  constructor(store, options={}) {
    this.store=store;this.ffmpeg=options.ffmpeg||process.env.COPY_EDIT_FFMPEG||'ffmpeg';
    this.ffprobe=options.ffprobe||process.env.COPY_EDIT_FFPROBE||'ffprobe';
    this.jobs=new Map();this.life=new AbortController();this.children=new Set();this.frameCount=0;this.imports=0;
  }
  async init() {
    this.available=false;
    if(process.platform!=='win32')return this;
    try {await this.run(this.ffmpeg,['-version']);await this.run(this.ffprobe,['-version']);this.available=true;}catch{}
    return this;
  }
  capabilities() {return {contractVersion:1,provider:'desktop-ffmpeg',executionLocation:'dsh-host',platform:process.platform,
    surfaceMode:'rendered-file',available:this.available,frameStep:this.available,continuousPreview:this.available,
    local1080pExport:this.available,maxDurationUs:600000000,maxImportBytes:512*1024*1024,androidNative:false,renderVersion:RENDER_VERSION};}
  assertAvailable(){if(!this.available||this.life.signal.aborted)throw Error('当前宿主未配置桌面媒体引擎');}
  run(binary,args,signal,limit=16*1024*1024,timeout=180000) {
    const combined=AbortSignal.any([this.life.signal,...(signal?[signal]:[]),AbortSignal.timeout(timeout)]);
    combined.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const child=spawn(binary,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],signal:combined});
      this.children.add(child);let chunks=[],size=0,stderr='',failure;
      child.stdout.on('data',b=>{size+=b.length;if(size>limit){failure=Error('媒体输出超过限制');child.kill();}else chunks.push(b);});
      child.stderr.on('data',b=>{stderr=(stderr+b).slice(-20000);});
      child.on('error',e=>{failure=e;});
      child.on('close',code=>{this.children.delete(child);if(failure)reject(failure);else if(code!==0)reject(Error('媒体处理失败：'+stderr.slice(-1500)));else resolve(Buffer.concat(chunks));});
    });
  }
  fileFor(assetId) {const a=assetOf(this.store.state.assets,assetId);if(!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('素材摘要无效');return path.join(this.store.root,'assets',a.sha256);}
  async probe(file,signal) {
    const info=JSON.parse((await this.run(this.ffprobe,['-v','error',...SAFE,'-show_streams','-show_format','-of','json',file],signal)).toString());
    const video=info.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
    if(video) {
      if(video.width>4096||video.height>4096||video.width<2||video.height<2)throw Error('素材尺寸需在 2–4096 像素之间');
      if(video.color_transfer==='smpte2084'||video.color_transfer==='arib-std-b67')throw Error('当前版本仅支持 SDR 素材');
      if(info.format.format_name==='png_pipe') {
        if(video.width!==1080||video.height!==400)throw Error('贴片 PNG 尺寸应为 1080×400');
        return {kind:'image',width:video.width,height:video.height,mime:'image/png'};
      }
      const duration=Number(info.format.duration||video.duration);
      if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('导入视频需在 10 分钟以内');
      const data=JSON.parse((await this.run(this.ffprobe,['-v','error',...SAFE,'-select_streams','v:0','-show_frames',
        '-show_entries','frame=best_effort_timestamp_time,duration_time,pkt_duration_time','-of','json',file],signal)).toString());
      if(!data.frames?.length||data.frames.length>72000)throw Error('视频帧索引超过限制');
      const raw=data.frames.map(f=>Math.round(Number(f.best_effort_timestamp_time)*1000000));
      const originUs=raw[0],ptsUs=raw.map(t=>t-originUs);
      for(let i=0;i<ptsUs.length;i++)if(!Number.isSafeInteger(ptsUs[i])||ptsUs[i]<0||(i&&ptsUs[i]<=ptsUs[i-1]))throw Error('视频时间戳不连续');
      const last=data.frames.at(-1),tail=Math.round(Number(last.duration_time||last.pkt_duration_time||0)*1000000);
      // 末帧真实时长不可得时，明确以容器时长收尾；不拿平均帧率伪造所有源帧。
      const endUs=tail>0?ptsUs.at(-1)+tail:Math.round(duration*1000000);
      if(endUs<=ptsUs.at(-1))throw Error('无法确定末帧边界');
      return {kind:'video',width:video.width,height:video.height,mime:'video/mp4',ptsUs,endUs,originUs,codec:video.codec_name,hasAudio:info.streams.some(s=>s.codec_type==='audio')};
    }
    const audio=info.streams.find(s=>s.codec_type==='audio'),durationUs=Math.round(Number(info.format.duration||audio?.duration)*1000000);
    if(!audio||!Number.isFinite(durationUs)||durationUs<=0||durationUs>600000000)throw Error('音频需在 10 分钟以内');
    return {kind:'audio',durationUs,mime:info.format.format_name==='wav'?'audio/wav':'audio/mpeg'};
  }
  async importStream(body,name,signal) {
    this.assertAvailable();if(this.imports>=2)throw Error('请等待当前素材导入完成');this.imports++;
    const temp=path.join(this.store.root,'incoming',id()+'.part');let file;
    try {
      const space=await fs.statfs(this.store.root);if(space.bavail*space.bsize<1024**3)throw Error('磁盘至少需要 1 GiB 可用空间');
      file=await fs.open(temp,'wx');const hash=createHash('sha256');let bytes=0;
      if(!body)throw Error('文件为空');
      const sig=AbortSignal.any([this.life.signal,signal||new AbortController().signal]);
      for await(const chunk of body) {sig.throwIfAborted();bytes+=chunk.length;if(bytes>512*1024*1024)throw Error('单个素材不能超过 512 MiB');hash.update(chunk);await file.writeFile(chunk);}
      await file.close();file=null;if(!bytes)throw Error('文件为空');
      const sha256=hash.digest('hex'),existing=this.store.state.assets.find(a=>a.sha256===sha256);
      if(existing)return structuredClone(existing);
      const info=await this.probe(temp,sig);sig.throwIfAborted();
      const asset={assetId:id(),sha256,bytes,name:String(name||'素材').replace(/[\u0000-\u001f/\\]/g,'_').slice(0,120),...info};
      return await this.store.write(async s=>{
        const duplicate=s.assets.find(a=>a.sha256===sha256);if(duplicate)return duplicate;
        if(s.assets.length>=200)throw Error('当前素材库上限为 200 个文件');
        await fs.rename(temp,path.join(this.store.root,'assets',sha256));s.assets.push(asset);return asset;
      });
    } finally {if(file)await file.close();await fs.rm(temp,{force:true});this.imports--;}
  }
  async frame(assetId,frame,signal,thumbnail=false) {
    this.assertAvailable();const a=assetOf(this.store.state.assets,assetId,'video');integer(frame,0,a.ptsUs.length-1,'帧号');
    if(this.frameCount>=2)throw Error('请等待当前帧');this.frameCount++;
    try {return await this.run(this.ffmpeg,['-v','error','-threads','2',...SAFE,'-i',this.fileFor(assetId),'-an',
      '-vf',`select=eq(n\\,${frame}),scale=${thumbnail?'256:144':'540:960'}:force_original_aspect_ratio=decrease`,
      '-fps_mode','passthrough','-frames:v','1','-f','image2pipe','-c:v','png','pipe:1'],signal,8*1024*1024);
    }finally{this.frameCount--;}
  }
  async example(sticker) {
    this.assertAvailable();if(this.exampleBusy)throw Error('示例正在准备');this.exampleBusy=true;
    const dir=path.join(this.store.root,'incoming',id());await fs.mkdir(dir);
    try {
      const clips=[];
      for(const [n,color] of ['0xd8a877','0x7494b5'].entries()) {
        const file=path.join(dir,n+'.mp4');
        await this.run(this.ffmpeg,['-v','error','-f','lavfi','-i',`color=c=${color}:s=360x640:r=30:d=2`,
          '-vf',`drawbox=x=50+${n*100}:y=200:w=110:h=220:color=white@0.8:t=fill`,'-c:v','libx264','-threads','2','-pix_fmt','yuv420p',file]);
        clips.push(await this.importStream(createReadStream(file),'示例镜头'+(n+1)+'.mp4'));
      }
      const file=path.join(dir,'rhythm.wav');
      await this.run(this.ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-af','volume=0.1',file]);
      const music=await this.importStream(createReadStream(file),'示例提示音.wav');
      return await this.store.write(s=>{
        if(s.projects.length>=100)throw Error('当前库最多支持 100 个工程');
        let p=newProject(id(),'色块剪辑示例');
        for(const command of [{type:'saveCopy',title:p.title,text:'暖色开场。\n冷色收尾。'},
          ...clips.map(a=>({type:'addClip',assetId:a.assetId})),{type:'setAudio',role:'bgm',assetId:music.assetId,volume:0.2},
          {type:'setSticker',sticker}])p=editProject(p,command,s.assets);
        s.projects.push(p);return p;
      });
    }finally{await fs.rm(dir,{recursive:true,force:true});this.exampleBusy=false;}
  }
  start(projectId,revision,profile) {
    this.assertAvailable();const project=this.store.project(projectId);
    if(project.revision!==revision)throw Error('工程已更新，请重新提交');
    const plan=compilePlan(project,this.store.state.assets,profile);
    if([...this.jobs.values()].some(j=>j.status==='running'))throw Error('请等待当前渲染完成，或先取消');
    const job={jobId:id(),projectId,revision,planHash:plan.planHash,profile,status:'running',totalFrames:plan.totalFrames,renderVersion:RENDER_VERSION,
      executionLocation:'dsh-host',startedAt:new Date().toISOString(),controller:new AbortController()};
    this.jobs.set(job.jobId,job);
    // 有界内存；已完成结果以持久清单为准。
    for(const [key,j] of this.jobs)if(this.jobs.size>32&&j.status!=='running')this.jobs.delete(key);
    job.done=this.render(job,plan).catch(e=>{
      job.status=job.controller.signal.aborted||this.life.signal.aborted?'cancelled':'failed';
      job.error=job.status==='failed'?e.message:'已取消';
    });
    return this.job(job.jobId);
  }
  job(jobId) {
    if(typeof jobId!=='string'||!/^[-\w]{1,80}$/.test(jobId))throw Error('任务标识无效');
    const job=this.jobs.get(jobId)||this.store.state.results.find(r=>r.jobId===jobId);
    if(!job)return {jobId,status:'retired',reasonCode:'JOB_NOT_RETAINED',executionLocation:'dsh-host',error:'此任务已失效，未重新提交。工程与草稿已保留，可手动重新预览或导出。'};
    const {controller,done,...answer}=job;return structuredClone(answer);
  }
  async cancel(jobId) {const job=this.jobs.get(jobId);if(job?.status==='running'){job.controller.abort();await job.done;}return this.job(jobId);}
  async render(job,plan) {
    const dir=path.join(this.store.root,'jobs',job.jobId);await fs.mkdir(dir);
    const temp=path.join(dir,'output.part.mp4'),out=path.join(dir,'output.mp4');
    const signal=AbortSignal.any([job.controller.signal,this.life.signal]);
    try {
      for(const asset of plan.assets)if(await hashFile(this.fileFor(asset.assetId))!==asset.sha256)throw Error('素材内容已变化，请重新导入');
      const args=['-v','error','-nostdin','-y','-filter_complex_threads','1'];
      const w=job.profile==='preview'?360:1080,h=job.profile==='preview'?640:1920;
      const filters=[],audio=[];const seconds=plan.totalFrames/30;let input=0;
      for(const clip of plan.clips) {
        args.push('-threads','2',...SAFE,'-i',this.fileFor(clip.assetId));
        const source=clip.window||{inFrame:clip.inFrame,outFrame:clip.outFrame,offset:0};
        const asset=assetOf(this.store.state.assets,clip.assetId),volume=clip.sourceVolume??1;
        // 旧库可能没有hasAudio；从已核验摘要的实际文件确认，不猜测音轨存在。
        const hasAudio=volume>0&&(asset.hasAudio??JSON.parse((await this.run(this.ffprobe,['-v','error',...SAFE,'-show_entries','stream=codec_type','-of','json',this.fileFor(clip.assetId)],signal)).toString()).streams.some(s=>s.codec_type==='audio'));
        if(hasAudio){
          const start=(asset.originUs||0)+asset.ptsUs[source.inFrame]+Math.round(source.offset*1e6/30),end=Math.min((asset.originUs||0)+(source.outFrame===asset.ptsUs.length?asset.endUs:asset.ptsUs[source.outFrame]),start+Math.round(clip.frames*1e6/30));
          filters.push(`[${input}:a:0]atrim=start=${start/1e6}:end=${end/1e6},asetpts=PTS-${start}/1000000/TB,aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume},apad,atrim=end_sample=${clip.frames*1600},adelay=${clip.startFrame*1600}S:all=1,asetpts=N/SR/TB,apad,atrim=end_sample=${plan.totalFrames*1600}[source${input}]`);
          audio.push(`[source${input}]`);
        }
        filters.push(`[${input}:v:0]trim=start_frame=${source.inFrame}:end_frame=${source.outFrame},setpts=PTS-STARTPTS,fps=30:start_time=0:round=up,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=start_frame=${source.offset}:end_frame=${source.offset+clip.frames},setpts=N/(30*TB)[c${input}]`);input++;
      }
      filters.push(plan.clips.map((_,i)=>`[c${i}]`).join('')+`concat=n=${plan.clips.length}:v=1:a=0[base]`);
      let video='base';
      if(plan.totalFrames>plan.videoFrames){filters.push(`[base]fps=30,tpad=stop_mode=add:color=black:stop=${plan.totalFrames-plan.videoFrames},trim=end_frame=${plan.totalFrames},setpts=N/(30*TB)[extended]`);video='extended';}
      for(const [i,s]of plan.stickers.entries()) {
        args.push('-loop','1',...SAFE,'-i',this.fileFor(s.assetId));
        const sw=Math.round(s.width*w/1080),sh=Math.round(400*s.width*w/1080/1080);
        filters.push(`[${input}:v]scale=${sw}:${sh}[png${i}]`);
        // concat 时间基以微秒量化；1us 容差只处理帧边界，不能多显示一帧。
        filters.push(`[${video}][png${i}]overlay=${Math.round(s.x*w/1080)}:${Math.round(s.y*w/1080)}:shortest=1:enable='gte(t,${s.startFrame/30-0.000001})*lt(t,${s.endFrame/30-0.000001})'[v${i}]`);video='v'+i;input++;
      }
      for(const role of ['voice','bgm'])if(plan.audio[role]) {
        if(role==='bgm')args.push('-stream_loop','-1');
        args.push(...SAFE,'-i',this.fileFor(plan.audio[role].assetId));
        // 先统一声道布局，避免 amix 继承单声道配音而丢失 BGM 的立体声。
        filters.push(`[${input}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${plan.audio[role].volume},apad,atrim=duration=${seconds}[${role}]`);
        audio.push(`[${role}]`);input++;
      }
      for(const [i,v]of plan.voices.entries()) {
        args.push(...SAFE,'-i',this.fileFor(v.assetId));
        // 30fps 的每一输出帧正好对应 1600 个 48kHz 样本，重排不累计舍入误差。
        // 延迟后按实际样本重新建立时间戳，再补齐/截尾，避免旧 FFmpeg
        // 在 adelay + apad + 时间裁切组合中丢掉前置静音。
        filters.push(`[${input}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start_sample=${Math.round(v.inUs*48000/1e6)}:end_sample=${Math.round(v.outUs*48000/1e6)},asetpts=N/SR/TB,volume=${v.volume},adelay=${v.startFrame*1600}S:all=1,asetpts=N/SR/TB,apad,atrim=end_sample=${plan.totalFrames*1600}[voice${i}]`);
        audio.push(`[voice${i}]`);input++;
      }
      // 补偿前瞻限幅器的内部延迟；不能让所有声音相对工程时间线后移。
      for(const [i,m]of (plan.music||[]).entries()){
        args.push('-stream_loop','-1',...SAFE,'-i',this.fileFor(m.assetId));
        filters.push(`[${input}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start_sample=${m.offsetSamples}:end_sample=${m.offsetSamples+(m.endFrame-m.startFrame)*1600},asetpts=N/SR/TB,volume=${m.volume},adelay=${m.startFrame*1600}S:all=1,asetpts=N/SR/TB,apad,atrim=end_sample=${plan.totalFrames*1600}[music${i}]`);
        audio.push(`[music${i}]`);input++;
      }
      if(audio.length)filters.push(audio.join('')+`amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[a]`);
      await fs.writeFile(path.join(dir,'filters.txt'),filters.join(';'));args.push('-filter_complex_script',path.join(dir,'filters.txt'),'-map',`[${video}]`);
      if(audio.length)args.push('-map','[a]','-c:a','aac','-b:a','192k');else args.push('-an');
      args.push('-c:v','libx264','-threads','2','-preset','veryfast','-crf',job.profile==='preview'?'24':'20',
        '-pix_fmt','yuv420p','-r','30','-frames:v',String(plan.totalFrames),'-t',String(seconds),'-movie_timescale','48000','-movflags','+faststart',temp);
      await this.run(this.ffmpeg,args,signal,16*1024*1024,Math.max(180000,seconds*3000));signal.throwIfAborted();
      const probe=JSON.parse((await this.run(this.ffprobe,['-v','error','-count_frames','-show_streams','-of','json',temp],signal)).toString());
      const v=probe.streams.find(s=>s.codec_type==='video');
      if(v?.width!==w||v?.height!==h||Number(v.nb_read_frames)!==plan.totalFrames)throw Error(`成片尺寸或帧数未通过校验：${v?.width}×${v?.height} / ${v?.nb_read_frames}，预期 ${w}×${h} / ${plan.totalFrames}`);
      const sha256=await hashFile(temp),bytes=(await fs.stat(temp)).size;signal.throwIfAborted();
      await fs.rename(temp,out);
      const result={...this.job(job.jobId),status:'complete',width:w,height:h,sha256,bytes,durationUs:Math.round(seconds*1000000),
        completedAt:new Date().toISOString(),url:'/api/copy-edit/media?jobId='+job.jobId};
      await this.store.write(s=>{signal.throwIfAborted();if(s.results.length>=100)throw Error('当前库已保留 100 个成片，请新建库或管理既有结果');s.results.push(result);return result;});
      Object.assign(job,result);
    } finally {
      await fs.rm(temp,{force:true});
      await fs.rm(path.join(dir,'filters.txt'),{force:true});
      if(job.status!=='complete') {await fs.rm(out,{force:true});await fs.rmdir(dir).catch(()=>{});}
    }
  }
  async mediaResponse(request) {
    const u=new URL(request.url);let file,mime,sha;
    if(u.searchParams.has('jobId')) {
      const r=this.store.state.results.find(r=>r.jobId===u.searchParams.get('jobId'));if(!r||r.status!=='complete'||!/^[-\w]+$/.test(r.jobId))return new Response(null,{status:404});
      file=path.join(this.store.root,'jobs',r.jobId,'output.mp4');mime='video/mp4';sha=r.sha256;
    } else {const a=assetOf(this.store.state.assets,u.searchParams.get('assetId'));file=this.fileFor(a.assetId);mime=a.mime;sha=a.sha256;}
    const size=(await fs.stat(file)).size;let start=0,end=size-1,status=200;
    const range=request.headers.get('range');
    if(range) {
      const m=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));end=m[1]&&m[2]?Math.min(Number(m[2]),size-1):size-1;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;
    }
    const headers={'Content-Type':mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600',ETag:'"'+sha+'"','X-Content-Type-Options':'nosniff'};
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
    if(u.searchParams.has('download'))headers['Content-Disposition']='attachment; filename="copy-edit.mp4"';
    if(request.method==='HEAD')return new Response(null,{status,headers});
    const stream=createReadStream(file,{start,end,signal:request.signal});
    return new Response(Readable.toWeb(stream),{status,headers});
  }
  async close() {this.life.abort();await Promise.all([...this.jobs.values()].map(j=>j.done));
    for(let i=0;i<100&&(this.children.size||this.imports);i++)await new Promise(r=>setTimeout(r,25));}
}
