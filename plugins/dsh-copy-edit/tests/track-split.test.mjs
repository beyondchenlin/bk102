import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {newProject,editProject,compilePlan} from '../src/project.mjs';import {ProjectStore} from '../src/store.mjs';import {musicPhaseAt,voiceFrames} from '../src/audio-timing.mjs';
const assets=[{assetId:'video',kind:'video',sha256:'a'.repeat(64),ptsUs:Array.from({length:90},(_,n)=>Math.round(n*1e6/30)),endUs:3e6},{assetId:'voice',kind:'audio',sha256:'b'.repeat(64),durationUs:5e6},{assetId:'music',kind:'audio',sha256:'c'.repeat(64),durationUs:370000},{assetId:'image',kind:'image',sha256:'d'.repeat(64)}];
const edit=(p,c)=>editProject(p,c,assets);
function setup(){let p=newProject('track-split');p=edit(p,{type:'addClip',assetId:'video'});for(const role of ['voice','bgm'])p=edit(p,{type:'setAudio',role,assetId:role==='voice'?'voice':'music',volume:.2});p=edit(p,{type:'addSticker',sticker:{assetId:'image',text:'文字',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,y:200,startFrame:0,endFrame:null}});return p;}
test('四类分割保持工程时长；音轨边界、循环进度和贴片样式不变',()=>{
 let p=setup(),s=p.stickers[0],cut=37;p=edit(p,{type:'splitSticker',stickerId:s.stickerId,frame:cut});assert.deepEqual(p.stickers.map(x=>[x.startFrame,x.endFrame]),[[0,cut],[cut,null]]);assert.equal(p.stickers[1].assetId,s.assetId);
 p=edit(p,{type:'splitVoice',voiceId:'voice-global',frame:cut});assert.equal(compilePlan(p,assets).totalFrames,90);assert.deepEqual(p.voiceClips.map(v=>[v.startFrame,voiceFrames(v)]),[[0,37],[37,53]]);assert.equal(p.voiceClips[0].outUs,p.voiceClips[1].inUs);assert.equal(p.voiceClips[1].outUs,3e6);
 p=edit(p,{type:'splitVoice',voiceId:p.voiceClips[1].voiceId,frame:38});assert.equal(compilePlan(p,assets).totalFrames,90);assert.deepEqual(p.voiceClips.map(voiceFrames),[37,1,52]);
 p=edit(p,{type:'splitMusic',musicId:'music-global',frame:cut});const right=p.musicClips[1];assert.equal(right.offsetSamples,(cut*1600)%(370000*48/1000));assert.equal(compilePlan(p,assets).music.length,1);
 p=edit(p,{type:'splitMusic',musicId:right.musicId,frame:82});assert.equal(musicPhaseAt(p.musicClips[2],85,assets[2]),(85*1600)%(370000*48/1000));assert.equal(compilePlan(p,assets).music.length,1);
 p=edit(p,{type:'removeMusic',musicId:p.musicClips[1].musicId});assert.deepEqual(compilePlan(p,assets).music.map(m=>[m.startFrame,m.endFrame]),[[0,37],[82,90]]);assert.equal(compilePlan(p,assets).schemaVersion,2);
});
test('绑定贴片分割保持镜头局部绑定；边缘、越界和伪造标识拒绝且不改原件',()=>{
 let p=setup();p=edit(p,{type:'bindSticker',stickerId:p.stickers[0].stickerId,clipId:p.clips[0].clipId,cover:true});const original=JSON.stringify(p),id=p.stickers[0].stickerId;
 for(const frame of [0,90,-1,1.5,NaN])for(const command of [{type:'splitSticker',stickerId:id},{type:'splitVoice',voiceId:'voice-global'},{type:'splitMusic',musicId:'music-global'}])assert.throws(()=>edit(p,{...command,frame}));assert.equal(JSON.stringify(p),original);
 p=edit(p,{type:'splitSticker',stickerId:id,frame:31});assert.deepEqual(p.stickers.map(s=>s.binding),[{clipId:p.clips[0].clipId,startFrame:0,endFrame:31},{clipId:p.clips[0].clipId,startFrame:31,endFrame:null}]);
 assert.throws(()=>edit(p,{type:'splitMusic',musicId:'missing',frame:30}));
});
test('分割三个轨道撤销、重做、重开后快照一致',async()=>{
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'track-split-'));let store;
 try{store=await new ProjectStore(root).init();await store.write(s=>{s.assets=assets;});let p=store.project('copy-edit-workspace');const mutate=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});
 await mutate({type:'addClip',assetId:'video'});await mutate({type:'setAudio',role:'voice',assetId:'voice',volume:.2});await mutate({type:'setAudio',role:'bgm',assetId:'music',volume:.2});
 await mutate({type:'addSticker',sticker:{assetId:'image',text:'文字',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,y:200,startFrame:0,endFrame:null}});
 for(const command of [{type:'splitVoice',voiceId:'voice-global',frame:37},{type:'splitMusic',musicId:'music-global',frame:37},{type:'splitSticker',stickerId:p.stickers[0].stickerId,frame:37}]){const before=structuredClone(p);await mutate(command);const after=structuredClone(p);await mutate({type:'undo'});for(const key of ['audio','musicClips','voiceClips','stickers'])assert.deepEqual(p[key],before[key]);await mutate({type:'redo'});for(const key of ['audio','musicClips','voiceClips','stickers'])assert.deepEqual(p[key],after[key]);}
 const frozen=compilePlan(p,assets);await store.close();store=await new ProjectStore(root).init();assert.deepEqual(compilePlan(store.project(p.projectId),assets),frozen);
 }finally{if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
});
