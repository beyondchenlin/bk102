import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {newProject,editProject,compilePlan} from '../src/project.mjs';import {projectStickers,stickerVisible,stickerRange,trimStickerRange,stickerRows} from '../src/sticker-timing.mjs';import {ProjectStore} from '../src/store.mjs';
const assets=[{assetId:'v',kind:'video',sha256:'a'.repeat(64),ptsUs:Array.from({length:300},(_,n)=>Math.round(n*1e6/30)),endUs:10e6},{assetId:'png',kind:'image',width:1080,height:400,sha256:'b'.repeat(64)},{assetId:'voice',kind:'audio',durationUs:2e6,sha256:'c'.repeat(64)}];
const content={assetId:'png',text:'文字一',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:230,width:1080};
const edit=(p,c)=>editProject(p,c,assets);
const setup=()=>edit(newProject(),{type:'addClip',assetId:'v'});
test('旧单贴片读取不迁移，第一次按标识修改才原子转为多贴片',()=>{
  let p=edit(setup(),{type:'setSticker',sticker:content});const before=JSON.stringify(p),s=projectStickers(p)[0];
  assert.equal(s.stickerId,'legacy-sticker');assert.equal(s.endFrame,null);assert.equal(compilePlan(p,assets).stickers[0].endFrame,120);assert.equal(JSON.stringify(p),before);
  const q=edit(p,{type:'addSticker',sticker:{...content,text:'第二个',startFrame:30,endFrame:60}});assert.equal(q.sticker,null);assert.equal(q.stickers.length,2);assert.equal(q.stickers[0].stickerId,s.stickerId);assert.equal(q.stickers[0].endFrame,null);assert.equal(JSON.stringify(p),before);
  assert.throws(()=>edit(q,{type:'setSticker',sticker:null}),/独立文字/);
});
test('单项内容、位置、时间与删除不影响相邻贴片或配音绑定',()=>{
  let p=setup();p=edit(p,{type:'setVoiceMode',mode:'clips'});p=edit(p,{type:'setNarration',clipId:p.clips[0].clipId,narration:{text:'声音',copyVersion:null,voice:{assetId:'voice',inUs:0,outUs:2e6,volume:1}}});
  for(let i=0;i<2;i++)p=edit(p,{type:'addSticker',sticker:{...content,text:'文字'+i,startFrame:i*30,endFrame:i*30+30}});
  const first=structuredClone(p.stickers[0]),voice=structuredClone(compilePlan(p,assets).voices),id=p.stickers[1].stickerId;
  p=edit(p,{type:'updateSticker',stickerId:id,sticker:{...content,text:'修改内容'}});p=edit(p,{type:'moveSticker',stickerId:id,x:200,y:900,width:600});p=edit(p,{type:'trimSticker',stickerId:id,startFrame:25,endFrame:80});
  assert.deepEqual(p.stickers[0],first);assert.equal(p.stickers[1].text,'修改内容');assert.equal(p.stickers[1].x,200);assert.deepEqual(compilePlan(p,assets).voices,voice);
  const q=edit(p,{type:'removeSticker',stickerId:id});assert.deepEqual(q.stickers,[first]);assert.deepEqual(compilePlan(q,assets).voices,voice);
});
test('半开帧区间只显示指定帧，支持一帧与重叠层级',()=>{
  let p=setup();for(const [startFrame,endFrame]of [[0,30],[30,31],[15,45]])p=edit(p,{type:'addSticker',sticker:{...content,startFrame,endFrame}});
  assert.deepEqual(p.stickers.map(s=>stickerVisible(s,29,120)),[true,false,true]);assert.deepEqual(p.stickers.map(s=>stickerVisible(s,30,120)),[false,true,true]);assert.equal(stickerVisible(p.stickers[1],31,120),false);
  const plan=compilePlan(p,assets);assert.deepEqual(plan.stickers.map(s=>s.stickerId),p.stickers.map(s=>s.stickerId));assert.equal(stickerRows(p.stickers,120).count,2);
});
test('工程缩短只裁显示范围，不删除后方贴片，恢复长度后可见',()=>{
  let p=setup();p=edit(p,{type:'addSticker',sticker:{...content,startFrame:100,endFrame:150}});p=edit(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:90});assert.equal(compilePlan(p,assets).stickers.length,0);assert.equal(p.stickers[0].endFrame,150);
  p=edit(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:180});assert.equal(compilePlan(p,assets).stickers[0].endFrame,150);
});
test('非法区间、重复标识和超额贴片拒绝且保留原件',()=>{
  let p=setup();const before=JSON.stringify(p);for(const [startFrame,endFrame]of [[-1,30],[0,0],[30,29],[0,1801],[.5,30],[NaN,30],[0,undefined]])assert.throws(()=>edit(p,{type:'addSticker',sticker:{...content,startFrame,endFrame}}));assert.equal(JSON.stringify(p),before);
  for(let i=0;i<120;i++)p=edit(p,{type:'addSticker',sticker:{...content,startFrame:0,endFrame:1}});assert.throws(()=>edit(p,{type:'addSticker',sticker:{...content,startFrame:0,endFrame:1}}),/120/);
  const copy=structuredClone(p);copy.stickers[1].stickerId=copy.stickers[0].stickerId;assert.throws(()=>compilePlan(copy,assets),/重复/);assert.throws(()=>edit(p,{type:'removeSticker',stickerId:'missing'}),/不存在/);
});
test('时间手柄吸附工程帧并限制两端，拖拽不会生成零长度区间',()=>{
  const r={startFrame:30,endFrame:90};assert.deepEqual(trimStickerRange(r,'in',49.6,120),{startFrame:50,endFrame:90});assert.deepEqual(trimStickerRange(r,'out',49.4,120),{startFrame:30,endFrame:49});
  assert.deepEqual(trimStickerRange(r,'in',999,120),{startFrame:89,endFrame:90});assert.deepEqual(trimStickerRange(r,'out',-999,120),{startFrame:30,endFrame:31});assert.deepEqual(trimStickerRange(r,'out',999,120),{startFrame:30,endFrame:120});assert.throws(()=>trimStickerRange(r,'in',Infinity,120));
});
test('全片旧贴片跟随片尾，单独裁切后固定为新显示区间',()=>{
  let p=edit(setup(),{type:'setSticker',sticker:content});p=edit(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:180});assert.equal(stickerRange(projectStickers(p)[0],180).endFrame,180);
  p=edit(p,{type:'trimSticker',stickerId:'legacy-sticker',startFrame:30,endFrame:90});p=edit(p,{type:'trimClip',clipId:p.clips[0].clipId,inFrame:0,outFrame:150});assert.equal(compilePlan(p,assets).stickers[0].endFrame,90);
});
test('多贴片持久化与旧客户端写入拒绝保持磁盘一致',async()=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'stickers-'));let store;
  try{store=await new ProjectStore(root).init();let p=edit(setup(),{type:'addSticker',sticker:{...content,startFrame:10,endFrame:80}});await store.write(s=>{s.assets=assets;s.projects=[p];});const before=await fs.readFile(path.join(root,'state.json'));
    await assert.rejects(store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'moveSticker',x:0,y:200,width:900}}),/请选择/);assert.deepEqual(await fs.readFile(path.join(root,'state.json')),before);
    await store.close();store=await new ProjectStore(root).init();assert.deepEqual(store.project(p.projectId),p);
  }finally{if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
});
