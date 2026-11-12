import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {newProject,editProject,compilePlan,stickerTransform} from '../src/project.mjs';import {ProjectStore} from '../src/store.mjs';import trim from '../src/trim.cjs';
const source=(assetId,fps,sec)=>({assetId,kind:'video',sha256:'a'.repeat(64),ptsUs:Array.from({length:fps*sec},(_,n)=>Math.round(n*1e6/fps)),endUs:sec*1e6});
const assets=[source('v30',30,10),source('v25',25,10),source('short',30,1),{assetId:'voice',kind:'audio',durationUs:10e6,sha256:'b'.repeat(64)},{assetId:'bgm',kind:'audio',durationUs:2e6,sha256:'c'.repeat(64)},{assetId:'png',kind:'image',width:1080,height:400,sha256:'d'.repeat(64)}];
const edit=(p,c)=>editProject(p,{preserveVoice:false,...c},assets);
function setup(){let p=newProject();p=edit(p,{type:'saveCopy',title:'绑定验收',text:'第一句。第二句。'});for(let i=0;i<2;i++){p=edit(p,{type:'addClip',assetId:'v30'});p=edit(p,{type:'trimClip',clipId:p.clips.at(-1).clipId,inFrame:0,outFrame:120});}p=edit(p,{type:'setVoiceMode',mode:'clips'});for(const [i,c]of p.clips.entries())p=edit(p,{type:'setNarration',clipId:c.clipId,narration:{text:i?'第二句。':'第一句。',copyVersion:1,voice:{assetId:'voice',inUs:i*3e6,outUs:i*3e6+2e6,volume:1}}});return p;}
test('裁切前镜头后绑定一起前移，换源和重排不改变句子/配音源范围',()=>{
  let p=setup(),first=p.clips[0].clipId,second=p.clips[1].clipId;const binding=structuredClone(p.clips[0].narration);
  p=edit(p,{type:'trimClip',clipId:first,inFrame:30,outFrame:120});assert.deepEqual(compilePlan(p,assets).voices.map(v=>v.startFrame),[0,90]);
  p=edit(p,{type:'replaceClip',clipId:first,assetId:'v25'});assert.equal(p.clips[0].outFrame,75);assert.deepEqual(p.clips[0].narration,binding);
  p=edit(p,{type:'moveClip',clipId:first,to:1});const plan=compilePlan(p,assets);assert.deepEqual(plan.voices.map(v=>[v.clipId,v.startFrame,v.inUs,v.outUs]),[[second,0,3e6,5e6],[first,120,0,2e6]]);
  p=edit(p,{type:'saveCopy',title:'新版本',text:'新文案'});assert.deepEqual(p.clips[1].narration,binding);assert.equal(p.versions.length,2);
  p=edit(p,{type:'removeClip',clipId:second});assert.equal(compilePlan(p,assets).voices.length,1);assert.equal(p.clips[0].narration.text,'第一句。');
});
test('视频可短于配音，声音尾部仍在计划内',()=>{const p=setup(),clipId=p.clips[0].clipId;for(const c of [{type:'trimClip',clipId,inFrame:0,outFrame:1},{type:'replaceClip',clipId,assetId:'short'}]){const q=edit(p,c),plan=compilePlan(q,assets);assert(plan.clips[0].frames<60);assert.equal(plan.voices[0].outUs,2e6);}});
test('旧工程默认整段配音，模式不混播，重新启用逐镜头模式再次校验',()=>{
  let p=setup();p=edit(p,{type:'setAudio',role:'voice',assetId:'voice',volume:1});p=edit(p,{type:'setAudio',role:'bgm',assetId:'bgm',volume:.2});
  let plan=compilePlan(p,assets);assert.equal(plan.audio.voice,null);assert.equal(plan.voices.length,2);assert.equal(plan.audio.bgm.assetId,'bgm');
  p=edit(p,{type:'setVoiceMode',mode:'global'});plan=compilePlan(p,assets);assert.equal(plan.voices.length,0);assert.equal(plan.audio.voice.assetId,'voice');assert(p.clips[0].narration);
  delete p.audio.voiceMode;assert.equal(compilePlan(p,assets).audio.voice.assetId,'voice');
  p=edit(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:30});assert.equal(compilePlan(edit(p,{type:'setVoiceMode',mode:'clips'}),assets).voices.length,2);
});
test('绑定校验拒绝越界音频、伪造版本和非有限音量，允许只有文字',()=>{
  const p=setup(),clipId=p.clips[0].clipId,n=p.clips[0].narration;
  for(const voice of [{...n.voice,inUs:-1},{...n.voice,outUs:11e6},{...n.voice,inUs:2e6},{...n.voice,volume:NaN},{...n.voice,assetId:'v30'}])assert.throws(()=>edit(p,{type:'setNarration',clipId,narration:{...n,voice}}));
  assert.throws(()=>edit(p,{type:'setNarration',clipId,narration:{...n,copyVersion:90}}));
  assert.equal(compilePlan(edit(p,{type:'setNarration',clipId,narration:{text:'手写句子',copyVersion:null,voice:null}}),assets).voices.length,1);
});
test('拖拽边界支持通用最短长度，视频调用使用一帧',()=>{
  for(const a of [assets[0],assets[1],{...assets[0],ptsUs:[0,20000,80000,120000,180000],endUs:220000}]){
    const c={inFrame:0,outFrame:a.ptsUs.length},minFrames=Math.min(60,trim.durationFrames(a,0,c.outFrame));
    for(const edge of ['in','out']){const q=trim.dragTrim(a,c,edge,edge==='in'?999:-999,1800,minFrames);assert(q.frames>=minFrames);assert(q.limited);}
  }
});
test('贴片兼容旧位置，新变换进入冻结计划，非有限/越界值拒绝',()=>{
  let p=setup();const s={assetId:'png',text:'多行\n透明文字',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,y:230};
  p.sticker=s;const old=JSON.stringify(p);assert.deepEqual(stickerTransform(s),{width:1080,x:0,y:230});assert.equal(compilePlan(p,assets).sticker.x,0);assert.equal(JSON.stringify(p),old);
  const q=edit(p,{type:'moveSticker',x:270,y:900,width:540});const plan=compilePlan(q,assets);assert.equal(plan.sticker.x,270);assert.equal(plan.sticker.y,900);assert.equal(plan.sticker.width,540);assert.equal(plan.sticker.text,s.text);assert.notEqual(plan.planHash,compilePlan(p,assets).planHash);
  for(const c of [{x:Infinity,y:230,width:1080},{x:0,y:1920,width:1080},{x:0,y:230,width:10}])assert.throws(()=>edit(p,{type:'moveSticker',...c}));
});
test('绑定和贴片重开持久化，失败裁切不修改修订或磁盘',async()=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'binding-'));let s;
  try{s=await new ProjectStore(root).init();const p=setup();await s.write(state=>{state.assets=assets;state.projects=[p];});
    const before=await fs.readFile(path.join(root,'state.json'));await assert.rejects(s.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'replaceClip',clipId:p.clips[0].clipId,assetId:'missing'}}),/不存在/);assert.deepEqual(await fs.readFile(path.join(root,'state.json')),before);
    await s.close();s=await new ProjectStore(root).init();assert.deepEqual(s.project(p.projectId),p);assert.equal(compilePlan(s.project(p.projectId),s.state.assets).voices.length,2);
  }finally{if(s)await s.close();await fs.rm(root,{recursive:true,force:true});}
});
