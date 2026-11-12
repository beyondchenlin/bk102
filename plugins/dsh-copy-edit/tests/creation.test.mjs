import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';
import {DraftImports} from '../src/draft-import.mjs';
import {CreationService} from '../src/creation-service.mjs';
import {creationSentences} from '../src/creation-jobs.mjs';
import {CreationConnections} from '../src/creation-connections.mjs';
import {runCreation} from '../src/creation-runner.mjs';
import {compilePlan} from '../src/project.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
function wave(samples){const b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;}
async function fixture(run){
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'creation-'));
 const f={root,config:{version:1,material:{origin:'https://library.example',token:'private-material-token'},speech:{endpoint:'https://voice.example/speech',model:'voice-model',voice:'voice-default',token:'private-voice-token'},defaults:{musicAssetId:'music'}},speechCalls:[],plans:new Map(),planPosts:0,video:Buffer.from('video-unit-fixture'),speechFailure:false};
 let store,service;
 f.saveConfig=()=>fs.writeFile(path.join(root,'connections.json'),JSON.stringify(f.config));
 f.open=async()=>{store=f.store=await new ProjectStore(root).init();service=f.service=new CreationService(store,new DraftImports(store),{fetcher:f.fetcher});};
 f.fetcher=async(url,options)=>{
  assert.equal(options.redirect,'error');
  if(url.startsWith('https://voice.example')){
   assert.equal(options.headers.Authorization,'Bearer private-voice-token');f.speechCalls.push({body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});
   if(f.speechFailure)throw Error('lost provider response');return new Response(wave(f.speechCalls.at(-1).body.input.includes('第二')?48000:24000));
  }
  assert.equal(options.headers.Authorization,'Bearer private-material-token');const u=new URL(url);
  if(options.method==='POST'){
   f.planPosts++;const body=JSON.parse(options.body);let manifest=f.plans.get(body.operation_id);
   if(!manifest){let cursor=0;manifest={plan_id:randomUUID(),revision:1,text:body.text,target_frames:body.target_frames,fps:30,assets:[{asset_id:'video-source',bytes:f.video.length,sha256:hash(f.video)}],sentences:creationSentences(body.text).map((text,i)=>{const s={sentence_id:'sentence-'+i,text,frames:body.durations_frames[i],timeline_start_frame:cursor,gap_frames:0,selected:{asset_id:'video-source',start_us:0,end_us:3000000,name_conflicts:[],unmatched_subjects:[]}};cursor+=s.frames;return s;})};f.plans.set(body.operation_id,manifest);}
   return Response.json({plan_id:manifest.plan_id,revision:1});
  }
  if(u.pathname.includes('/assets/'))return new Response(f.video);
  const manifest=[...f.plans.values()].find(p=>u.pathname.includes(p.plan_id));assert.ok(manifest);return Response.json(f.badManifest?{...manifest,text:'被替换'}:manifest);
 };
 f.upload=async file=>{
  const bytes=Buffer.from(await file.arrayBuffer()),sha256=hash(bytes),kind=file.type.startsWith('audio')?'audio':file.type.startsWith('video')?'video':'image';
  const a={assetId:sha256.slice(0,32),sha256,bytes:bytes.length,kind,name:file.name,...(kind==='audio'?{durationUs:(bytes.length-44)/2/24000*1e6}:kind==='video'?{ptsUs:Array.from({length:90},(_,i)=>Math.round(i*1e6/30)),endUs:3000000}:{width:1080,height:400,mime:'image/png'})};
  await fs.writeFile(path.join(root,'assets',sha256),bytes);await store.write(s=>{if(!s.assets.some(x=>x.assetId===a.assetId))s.assets.push(a);});return a;
 };
 f.rpc=async(name,args={})=>{const {jobId,leaseId}=args;switch(name){
  case 'creationCheckpoint':return service.jobs.checkpoint(jobId,leaseId,args.key,args.assetId);
  case 'creationSelection':return service.selection(jobId,leaseId);
  case 'creationComplete':return service.complete(jobId,leaseId);
  default:throw Error(name);
 }};
 f.run=job=>runCreation(job,{rpc:f.rpc,fetcher:(url,options)=>service.response(new Request('https://bk.example'+url,options)),uploadFile:f.upload,stickerFile:async text=>new File([text],'title.png',{type:'image/png'})});
 f.confirm=(extra={})=>service.confirm({operationId:randomUUID(),intent:'video',text:'第一句。第二句。',...extra});
 try{await f.open();await f.saveConfig();const music=await f.upload(new File([wave(12000)],'音乐.wav',{type:'audio/wav'}));f.config.defaults.musicAssetId=music.assetId;await f.saveConfig();await run(f);}
 finally{await service?.close();await store?.close();await fs.rm(root,{recursive:true,force:true});}
}

test('只改文案仅保存，视频确认才入队；重复确认复用任务和版本',()=>fixture(async f=>{
 const copy=await f.confirm({intent:'copy'});assert.equal(copy.job,null);assert.equal(f.service.jobs.list().length,0);assert.equal(f.speechCalls.length,0);
 const request={operationId:randomUUID(),intent:'video',text:'第一句。第二句。',projectId:copy.sourceProjectId,expectedRevision:copy.revision};
 const created=await f.service.confirm(request);assert.equal(created.copyVersion,1);assert.equal(created.job.status,'queued');
 assert.deepEqual(await f.service.confirm(request),created);
 assert.equal((await f.confirm()).job.jobId,created.job.jobId);
 assert.notEqual((await f.confirm({variant:true})).job.jobId,created.job.jobId);
 await assert.rejects(f.service.confirm({...request,text:'另一个版本'}),/已经用于/);
}));
test('配音按真实时长驱动选片；四轨原子提交、保存重开、重复消息不覆盖人工编辑',()=>fixture(async f=>{
 const created=await f.confirm({categoryId:'preset-knowledge'}),job=await f.service.claim(created.job.jobId);
 const result=await f.run(job);assert.equal(result.status,'complete');assert.equal(f.speechCalls.length,2);assert.equal(f.planPosts,1);
 let p=f.store.project(result.projectId),plan=compilePlan(p,f.store.state.assets);assert.equal(plan.totalFrames,90);assert.equal(plan.voices[1].startFrame,30);assert.equal(plan.music.length,1);assert.equal(plan.stickers.length,1);assert.ok(plan.clips.every(c=>c.sourceVolume===0));
 assert.equal(p.creationSource.copyVersion,1);assert.equal(f.store.view().library.assignments.edit[p.projectId],'preset-knowledge');
 p=await f.store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'setSourceVolume',clipId:p.clips[0].clipId,volume:.3}});
 const repeat=await f.confirm();assert.equal(repeat.job.projectId,p.projectId);assert.equal(repeat.job.status,'complete');assert.deepEqual(f.store.project(p.projectId),p);
 await f.service.close();await f.store.close();await f.open();assert.deepEqual(f.store.project(p.projectId),p);assert.equal((await f.confirm()).job.projectId,p.projectId);assert.equal(f.speechCalls.length,2);
 assert.ok(!JSON.stringify(f.service.state()).includes('private-'));
}));
test('缺少默认配置集中询问，补充一次选择并记住后直接生成',()=>fixture(async f=>{
 delete f.config.defaults.musicAssetId;delete f.config.speech;await f.saveConfig();
 const created=await f.confirm();assert.equal(created.job.status,'needs_input');assert.match(created.job.question,/旁白/);assert.match(created.job.question,/背景音乐/);assert.equal(f.speechCalls.length,0);
 await f.service.control(created.job.jobId,'resume',{options:{narration:false,musicAssetId:null},remember:true});
 const job=await f.service.claim(created.job.jobId);assert.equal(job.settings.narration,false);assert.equal(job.settings.musicAssetId,null);
 assert.deepEqual(f.store.state.creationDefaults,{narration:false,musicAssetId:null});
 const other=await f.confirm({text:'新的文案。'});assert.equal(other.job.status,'queued');
}));
test('租约只准一个页面，暂停及过期代次不能登记或提交',()=>fixture(async f=>{
 const created=await f.confirm(),jobs=await Promise.all([f.service.claim(created.job.jobId),f.service.claim(created.job.jobId)]);assert.equal(jobs.filter(Boolean).length,1);
 const first=jobs.find(Boolean);await f.service.control(first.jobId,'pause');await assert.rejects(f.service.jobs.heartbeat(first.jobId,first.leaseId),/失效/);
 await f.service.control(first.jobId,'resume');const next=await f.service.claim(first.jobId);assert.notEqual(next.leaseId,first.leaseId);
 await assert.rejects(f.service.complete(first.jobId,first.leaseId),/失效/);assert.equal(f.store.state.draftReceipts?.length||0,0);
}));
test('完整配音已收到但登记响应丢失，重开后复用缓存不再次合成',()=>fixture(async f=>{
 const created=await f.confirm(),job=await f.service.claim(created.job.jobId);
 const first=await f.service.speech(job.jobId,job.leaseId,0);assert.ok(first.ok);assert.equal(f.speechCalls.length,1);
 await f.service.control(job.jobId,'pause');await f.service.close();await f.store.close();await f.open();
 await f.service.control(job.jobId,'resume');const resumed=await f.service.claim(job.jobId);await f.run(resumed);assert.equal(f.speechCalls.length,2);
 assert.equal(f.speechCalls.filter(c=>c.body.input==='第一句。').length,1);
}));
test('不确定的非幂等配音不得自动重复；明确重试才可再调用',()=>fixture(async f=>{
 const created=await f.confirm(),job=await f.service.claim(created.job.jobId);f.speechFailure=true;
 await assert.rejects(f.service.speech(job.jobId,job.leaseId,0),/连接中断/);assert.equal(f.speechCalls.length,1);
 f.speechFailure=false;await assert.rejects(f.service.speech(job.jobId,job.leaseId,0),/回执不确定/);assert.equal(f.speechCalls.length,1);
 await f.service.control(job.jobId,'pause');await f.service.control(job.jobId,'resume',{retrySpeech:true});const resumed=await f.service.claim(job.jobId);
 await f.service.speech(job.jobId,resumed.leaseId,0);assert.equal(f.speechCalls.length,2);
}));
test('有真实幂等合同的配音恢复使用相同请求身份',()=>fixture(async f=>{
 f.config.speech.idempotent=true;await f.saveConfig();const created=await f.confirm(),job=await f.service.claim(created.job.jobId);f.speechFailure=true;
 await assert.rejects(f.service.speech(job.jobId,job.leaseId,0));f.speechFailure=false;await f.service.speech(job.jobId,job.leaseId,0);
 assert.equal(f.speechCalls[0].key,f.speechCalls[1].key);assert.ok(f.speechCalls[0].key);
}));
test('文案确认后新修改不改变任务快照，变化的来源清单不能提交',()=>fixture(async f=>{
 const created=await f.confirm(),job=await f.service.claim(created.job.jobId);
 await f.store.mutate({projectId:created.sourceProjectId,expectedRevision:created.revision,operationId:randomUUID(),command:{type:'saveCopy',title:'新标题',text:'尚未确认的修改。'}});
 f.badManifest=true;await assert.rejects(f.run(job),/正文或时长不匹配/);assert.equal(f.store.state.draftReceipts?.length||0,0);assert.equal(f.speechCalls[0].body.input,'第一句。');
}));
test('分句保留引号、英文句点、换行和尾随空白，与素材库合同一致',()=>{
 const input='  第一句！？”\n第二句;第三句. Final.  \n';const parts=creationSentences(input);assert.equal(parts.join(''),input);assert.deepEqual(parts,['  第一句！？”','\n第二句;','第三句.',' Final.  \n']);
 assert.throws(()=>creationSentences('a'.repeat(201)),/200 字/);
});
test('连接配置拒绝凭据URL和远程明文 HTTP，不读取其他工作区',()=>fixture(async f=>{
 f.config.material.origin='http://remote.example';await f.saveConfig();await assert.rejects(new CreationConnections(f.root).read(),/HTTPS/);
 f.config.material.origin='https://user:secret@remote.example';await f.saveConfig();await assert.rejects(new CreationConnections(f.root).read());
}));
test('文案明确选择无音乐优先于默认，既有镜头原声音量保留',()=>fixture(async f=>{
 const saved=await f.confirm({intent:'copy'});let p=await f.store.mutate({projectId:saved.sourceProjectId,expectedRevision:saved.revision,operationId:randomUUID(),command:{type:'setAudio',role:'bgm',assetId:null}});
 const video=await f.upload(new File([f.video],'video.mp4',{type:'video/mp4'}));p=await f.store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'addClip',assetId:video.assetId}});
 const created=await f.confirm({projectId:p.projectId,expectedRevision:p.revision});const j=f.service.jobs.row(created.job.jobId);assert.equal(j.settings.musicAssetId,null);assert.equal(j.settings.sourceVolume,1);
}));
test('保存超过选片上限的长文案不会丢失正文，视频请求不开始调用提供方',()=>fixture(async f=>{
 const text='文'.repeat(6100),saved=await f.confirm({intent:'copy',text});assert.equal(saved.job,null);assert.equal(f.store.project(saved.sourceProjectId).text,text);
 const result=await f.confirm({text});assert.equal(result.job.status,'failed');assert.match(result.job.message,/6000/);assert.equal(f.speechCalls.length,0);
}));
test('已选声音属于另一服务时不错误地调用默认提供方',()=>fixture(async f=>{
 const saved=await f.confirm({intent:'copy'});await f.store.write(s=>{s.voiceSettings={revision:1,providers:{custom:{endpoint:'https://another.example/speech',model:'other-model',voices:[{voiceId:'custom-voice',remoteId:'custom-id'}]}},selections:{[saved.sourceProjectId]:{source:'custom',voiceId:'custom-voice',rate:1}},operations:[]};});
 const created=await f.confirm({projectId:saved.sourceProjectId,expectedRevision:saved.revision});assert.equal(created.job.status,'needs_input');assert.match(created.job.question,/所属/);assert.equal(f.speechCalls.length,0);
}));
