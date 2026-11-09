import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {newProject,editProject,compilePlan} from '../src/project.mjs';import {ProjectStore} from '../src/store.mjs';import {timelineClips,resolvedStickers,sourceFrameAt} from '../src/timeline.mjs';
const assets=[{assetId:'v',kind:'video',sha256:'a'.repeat(64),ptsUs:Array.from({length:250},(_,i)=>i*40000),endUs:10e6},{assetId:'short',kind:'video',sha256:'b'.repeat(64),ptsUs:[0,40000,80000],endUs:120000},{assetId:'voice',kind:'audio',sha256:'c'.repeat(64),durationUs:10e6},{assetId:'png',kind:'image',width:1080,height:400,sha256:'d'.repeat(64)}];
const content={assetId:'png',text:'文字',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:230,width:1080};
const edit=(p,c)=>editProject(p,c,assets);
function setup(){let p=edit(newProject(),{type:'addClip',assetId:'v'});p=edit(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:250});p=edit(p,{type:'setVoiceMode',mode:'clips'});p=edit(p,{type:'setNarration',clipId:p.clips[0].clipId,narration:{text:'完整一句',copyVersion:null,voice:{assetId:'voice',inUs:0,outUs:10e6,volume:1}}});return p;}
function sticker(p,start,end){return edit(p,{type:'addSticker',sticker:{...content,startFrame:start,endFrame:end,binding:{clipId:p.clips[0].clipId,startFrame:start,endFrame:end}}});}
const ranges=p=>compilePlan(p,assets).stickers.map(s=>[s.startFrame,s.endFrame]);
test('25fps 连续分割保持 300 帧，删除中间只删除对应窗口且独立配音不重复',()=>{
 let p=setup(),first=p.clips[0].clipId;const original=Array.from({length:300},(_,i)=>sourceFrameAt(p.clips[0],assets[0],i));
 p=edit(p,{type:'splitClip',clipId:first,offsetFrame:91});p=edit(p,{type:'splitClip',clipId:p.clips[1].clipId,offsetFrame:89});
 assert.deepEqual(p.clips.map(c=>c.window.frames),[91,89,120]);assert.deepEqual(p.clips.flatMap(c=>Array.from({length:c.window.frames},(_,i)=>sourceFrameAt(c,assets[0],i))),original);
 assert.equal(p.voiceClips.length,1);assert.equal(p.voiceClips[0].clipIds.length,3);assert.equal(compilePlan(p,assets).totalFrames,300);
 p=edit(p,{type:'removeClip',clipId:p.clips[1].clipId});const plan=compilePlan(p,assets);assert.equal(plan.videoFrames,211);assert.equal(plan.totalFrames,300);assert.equal(plan.voices[0].outUs,10e6);assert.equal(plan.voices[0].startFrame,0);assert.equal(p.voiceClips[0].clipIds.length,2);
 assert.deepEqual(p.clips.flatMap(c=>Array.from({length:c.window.frames},(_,i)=>sourceFrameAt(c,assets[0],i))),[...original.slice(0,91),...original.slice(180)]);
});
test('边界不能分割空片段；单帧裁切与短素材替换均不受配音长度限制',()=>{
 const p=setup(),clipId=p.clips[0].clipId,before=JSON.stringify(p);for(const offsetFrame of [0,300,-1,NaN,1.5])assert.throws(()=>edit(p,{type:'splitClip',clipId,offsetFrame}));assert.equal(JSON.stringify(p),before);
 for(const command of [{type:'trimClip',clipId,inFrame:0,outFrame:1},{type:'replaceClip',clipId,assetId:'short'}]){const q=edit(p,command),plan=compilePlan(q,assets);assert(plan.videoFrames<=4);assert.equal(plan.totalFrames,300);assert.equal(plan.voices.length,1);assert.equal(plan.voices[0].outUs,10e6);}
});
test('文字跨分割点拆为两段，不重复显示；删中段与镜头重排同步',()=>{
 let p=sticker(setup(),60,240),first=p.clips[0].clipId;p=edit(p,{type:'splitClip',clipId:first,offsetFrame:90});p=edit(p,{type:'splitClip',clipId:p.clips[1].clipId,offsetFrame:90});assert.deepEqual(ranges(p),[[60,90],[90,180],[180,240]]);
 const middle=p.clips[1].clipId;p=edit(p,{type:'removeClip',clipId:middle});assert.deepEqual(ranges(p),[[60,90],[90,150]]);
 p=edit(p,{type:'moveClip',clipId:p.clips[1].clipId,to:0});assert.deepEqual(ranges(p),[[180,210],[0,60]]);assert.equal(p.voiceClips[0].startFrame,0);
});
test('绑定文字按源头裁切移动局部时间，替换保留，解除绑定后可手动跨镜头',()=>{
 let p=sticker(setup(),60,240),clipId=p.clips[0].clipId,id=p.stickers[0].stickerId;p=edit(p,{type:'trimClip',clipId,inFrame:25,outFrame:200});assert.deepEqual(ranges(p),[[30,210]]);
 p=edit(p,{type:'trimSticker',stickerId:id,startFrame:15,endFrame:90});assert.deepEqual(ranges(p),[[15,90]]);
 p=edit(p,{type:'replaceClip',clipId,assetId:'short'});assert.deepEqual(ranges(p),[]);assert.equal(p.stickers.length,1);
 p=edit(p,{type:'bindSticker',stickerId:id,clipId,cover:true});assert.deepEqual(ranges(p),[[0,4]]);
 assert.throws(()=>edit(p,{type:'trimSticker',stickerId:id,startFrame:0,endFrame:10}),/对应镜头内/);
 p=edit(p,{type:'bindSticker',stickerId:id,clipId:null});p=edit(p,{type:'trimSticker',stickerId:id,startFrame:0,endFrame:60});assert.deepEqual(ranges(p),[[0,60]]);
});
test('配音时间可独立编辑并明确删除，BGM 不受视频分割影响',()=>{
 let p=setup();p=edit(p,{type:'setAudio',role:'bgm',assetId:'voice',volume:.2});p=edit(p,{type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:90});const id=p.voiceClips[0].voiceId;
 p=edit(p,{type:'editVoice',voiceId:id,startFrame:30,inUs:2e6,outUs:8e6,volume:.8});assert(p.clips.every(c=>c.narration.voice.inUs===2e6));assert.equal(compilePlan(p,assets).voices.length,1);assert.equal(p.audio.bgm.volume,.2);
 p=edit(p,{type:'removeVoice',voiceId:id});assert.equal(compilePlan(p,assets).voices.length,0);assert(p.clips.every(c=>c.narration.voice===null));
});
test('重叠文字分割后保持原有上下层顺序',()=>{let p=sticker(setup(),0,300);p=edit(p,{type:'addSticker',sticker:{...content,text:'顶层',startFrame:0,endFrame:300}});p=edit(p,{type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:90});const ss=compilePlan(p,assets).stickers;for(const frame of [0,89,90,299])assert.deepEqual(ss.filter(s=>s.startFrame<=frame&&frame<s.endFrame).map(s=>s.text),['文字','顶层']);});
test('分割后切回随镜头配音仍只播同一句一次',()=>{let p=setup();p=edit(p,{type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:90});p=edit(p,{type:'setVoiceMode',mode:'clips'});assert.equal(compilePlan(p,assets).voices.length,1);p=edit(p,{type:'moveClip',clipId:p.clips[0].clipId,to:1});assert.equal(p.voiceClips.length,1);assert.equal(p.voiceClips[0].clipIds.length,2);});
test('长素材跳到远处裁切不被已隐藏的绑定文字阻止',()=>{const a={...assets[0],assetId:'long',ptsUs:Array.from({length:4000},(_,i)=>i*40000),endUs:160e6},all=[...assets,a];let p=editProject(newProject(),{type:'addClip',assetId:'long'},all);p=editProject(p,{type:'addSticker',sticker:{...content,startFrame:0,endFrame:120,binding:{clipId:p.clips[0].clipId,startFrame:0,endFrame:120}}},all);p=editProject(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:3000,outFrame:3100},all);assert.equal(compilePlan(p,all).videoFrames,120);assert.equal(compilePlan(p,all).stickers.length,0);});
test('分割、删除、联动一起撤销重做，重开持久化；文案新版本不被撤销',async()=>{
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'history-'));let store,p=sticker(setup(),60,240);
 try{store=await new ProjectStore(root).init();await store.write(s=>{s.assets=assets;s.projects=[p];});const change=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});
 await change({type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:90});await change({type:'splitClip',clipId:p.clips[1].clipId,offsetFrame:90});const split=structuredClone(p);await change({type:'removeClip',clipId:p.clips[1].clipId});const deleted=structuredClone(p);
 await change({type:'saveCopy',title:'文案版本',text:'保留版本'});await change({type:'undo'});for(const k of ['clips','stickers','audio','voiceClips'])assert.deepEqual(p[k],split[k]);assert.equal(p.versions.length,1);assert(p.revision>deleted.revision);
 await store.close();store=await new ProjectStore(root).init();assert(store.view().history[p.projectId].canRedo);await change({type:'redo'});for(const k of ['clips','stickers','audio','voiceClips'])assert.deepEqual(p[k],deleted[k]);
 const before=await fs.readFile(path.join(root,'state.json'));await assert.rejects(change({type:'splitClip',clipId:p.clips[0].clipId,offsetFrame:0}));assert.deepEqual(await fs.readFile(path.join(root,'state.json')),before);
 await change({type:'undo'});await change({type:'moveClip',clipId:p.clips[0].clipId,to:2});assert.equal(store.view().history[p.projectId].canRedo,false);
 const request={projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'undo'}};p=await store.mutate(request);assert.deepEqual(await store.mutate(request),p);
 }finally{if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
});
