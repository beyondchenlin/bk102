import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';
import {DraftImports,sourceRange,mapSourceRange,draftHash} from '../src/draft-import.mjs';
import {compilePlan} from '../src/project.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(run){
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'draft-import-'));let store;
  try{
    store=await new ProjectStore(root).init();const assets=[];
    for(const [assetId,kind,meta] of [
      ['v','video',{ptsUs:[0,33333,90000,200000,300000],endUs:500000}],
      ['voice','audio',{durationUs:500000}],['bgm','audio',{durationUs:100000}],
      ['img','image',{width:1080,height:400,mime:'image/png'}]
    ]){const bytes=Buffer.from(assetId+'-unit-fixture'),sha256=hash(bytes);await fs.writeFile(path.join(root,'assets',sha256),bytes);assets.push({assetId:'local-'+assetId,kind,sha256,bytes:bytes.length,...meta});}
    await store.write(s=>{
      s.assets=assets;
      // 合成旧工程的六个轨道内容；字幕/叠加为未实现渲染的扩展字段，只验存储保真。
      Object.assign(s.projects[0],{
        text:'旧工程原文',clips:[{clipId:'old-video',assetId:'local-v',inFrame:0,outFrame:5}],
        sticker:{assetId:'local-img',text:'旧贴片',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,y:100},
        audio:{voice:{assetId:'local-voice',volume:1},bgm:{assetId:'local-bgm',volume:.1}},
        subtitles:[{id:'old-subtitle',startFrame:0,endFrame:15,text:'旧字幕',style:{fontSize:24}}],
        overlays:[{id:'old-overlay',assetId:'local-img',startFrame:0,endFrame:15,x:10,y:10}]
      });
    });
    const plan={schemaVersion:1,draftId:'draft-unit',revision:1,requiredCapabilities:['draft.atomic.v1','tracks.four.v1','source.pts.v1'],canvas:{width:1080,height:1920,fps:{numerator:30,denominator:1}},text:'测试第一句。\n第二句。',assets:assets.map(a=>({assetId:a.assetId.slice(6),sha256:a.sha256,bytes:a.bytes,kind:a.kind})),
      clips:[{clipId:'clip-1',assetId:'v',inUs:0,outUs:500000}],
      stickers:[{stickerId:'sticker-1',assetId:'img',text:'文字',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:200,width:1080,startFrame:0,endFrame:null}],
      voices:[{voiceId:'voice-1',assetId:'voice',text:'配音原文',inUs:0,outUs:500000,startFrame:0,volume:1}],
      music:[{musicId:'music-1',assetId:'bgm',startFrame:0,endFrame:null,offsetSamples:0,volume:.2}],warnings:[],gaps:[]};
    const f={root,store,assets,plan,imports:new DraftImports(store),request(){return {workspaceId:this.store.workspaceId,operationId:randomUUID(),plan:structuredClone(this.plan)};},async reopen(){await store.close();store=await new ProjectStore(root).init();this.store=store;this.imports=new DraftImports(store);}};
    await run(f);
  }finally{if(store)await store.close();await fs.rm(root,{recursive:true,force:true});}
}
const commitRequest=t=>({workspaceId:t.workspaceId,operationId:t.operationId,ticketId:t.ticketId,planHash:t.planHash});
const code=expected=>e=>e.code===expected;

test('整份四轨准备不发布工程；提交一次可编辑并保存重开，不改旧六轨副本',async()=>fixture(async f=>{
  const previous=f.store.view().projects,ticket=await f.imports.prepare(f.request());assert.equal(ticket.status,'prepared');assert.deepEqual(f.store.view().projects,previous);
  const receipt=await f.imports.commit(commitRequest(ticket));let p=f.store.project(receipt.projectId);
  assert.equal(p.clips[0].assetId,'local-v');assert.equal(p.clips[0].outFrame,5);assert.equal(compilePlan(p,f.assets).totalFrames,15);
  p=await f.store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'splitVoice',voiceId:'voice-1',frame:7}});
  const snapshot=structuredClone(p);await f.reopen();assert.deepEqual(f.store.project(p.projectId),snapshot);assert.deepEqual(f.store.view().projects.slice(0,previous.length),previous);
  assert.deepEqual(f.imports.receipt({workspaceId:ticket.workspaceId,operationId:ticket.operationId}),receipt);
}));

test('并发提交与丢回执重试只创建一个工程；编辑操作窗口轮换后仍幂等',async()=>fixture(async f=>{
  const request=f.request(),ticket=await f.imports.prepare(request),commit=commitRequest(ticket);
  const all=await Promise.all(Array.from({length:20},()=>f.imports.commit(commit)));for(const r of all)assert.deepEqual(r,all[0]);assert.equal(f.store.view().projects.length,2);
  for(let i=0;i<105;i++){const p=f.store.project(all[0].projectId);await f.store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'moveSticker',stickerId:'sticker-1',x:0,y:200,width:1080}});}
  await f.reopen();assert.deepEqual(await f.imports.commit(commit),all[0]);assert.equal(f.store.view().projects.length,2);
  assert.equal((await f.imports.prepare(request)).status,'committed');
  await assert.rejects(f.imports.prepare({...request,plan:{...request.plan,text:'另一个输入'}}),code('OPERATION_CONFLICT'));
}));

test('真实VFR范围精确映射；不以平均帧率猜测或接受非帧边界',()=>{
  const a={ptsUs:[0,16667,50000,116667],endUs:150000};
  assert.deepEqual(sourceRange(a,16667,116667),{inFrame:1,outFrame:3});
  assert.deepEqual(sourceRange(a,50000,150000),{inFrame:2,outFrame:4});
  for(const pair of [[1,116667],[0,150001],[50000,16667]])assert.throws(()=>sourceRange(a,...pair));
});

test('映射仅使用真实帧边界，保留用户时长；无解时明确失败',()=>{
  const a={ptsUs:[0,16667,50000,116667,150000,200000],endUs:250000};
  assert.deepEqual(mapSourceRange(a,10000,150000,3),{inUs:16667,outUs:116667,inFrame:1,outFrame:3,frames:3});
  assert.throws(()=>mapSourceRange(a,10000,90000,3),code('NO_EXACT_SOURCE_RANGE'));
  assert.deepEqual(mapSourceRange(a,0,250001,6),{inUs:0,outUs:200000,inFrame:0,outFrame:5,frames:6});
  assert.throws(()=>mapSourceRange({...a,ptsUs:[0,50000,50000]},0,150000,3),code('INVALID_ASSET_INDEX'));
});

test('映射检查库身份及已登记媒体字节，不接受调用者的帧索引',async()=>fixture(async f=>{
  const a=f.assets[0],request={workspaceId:f.store.workspaceId,assetId:a.assetId,sha256:a.sha256,bytes:a.bytes,startUs:0,endUs:500000,frames:15};
  assert.deepEqual(await f.imports.mapSource(request),{inUs:0,outUs:500000,inFrame:0,outFrame:5,frames:15});
  await assert.rejects(f.imports.mapSource({...request,workspaceId:'other'}),code('WORKSPACE_MISMATCH'));
  await assert.rejects(f.imports.mapSource({...request,ptsUs:[0,500000]}),code('UNKNOWN_FIELD'));
  await fs.writeFile(path.join(f.root,'assets',a.sha256),Buffer.alloc(a.bytes));
  await assert.rejects(f.imports.mapSource(request),code('ASSET_CHANGED'));
}));

test('VFR裁切回执明确给出实际入出点和工程帧量化误差',async()=>fixture(async f=>{
  const r=f.request();r.plan.clips[0].inUs=33333;r.plan.clips[0].outUs=300000;r.plan.voices[0].outUs=266667;
  const receipt=await f.imports.commit(commitRequest(await f.imports.prepare(r)));
  assert.deepEqual(receipt.sourceRanges,[{clipId:'clip-1',assetId:'v',inUs:33333,outUs:300000,inFrame:1,outFrame:4,frames:8,roundingDeltaNumeratorUs:-10,roundingDeltaDenominator:30}]);
  assert.equal(compilePlan(f.store.project(receipt.projectId),f.assets).totalFrames,8);
}));

test('能力、画幅、未知必需字段、重复ID、越界裁切和未声明素材均在发布前拒绝',async()=>fixture(async f=>{
  const cases=[
    [p=>p.requiredCapabilities.push('unsupported.capability'),'UNSUPPORTED_CAPABILITY'],
    [p=>p.canvas.fps.numerator=60,'UNSUPPORTED_CANVAS'],
    [p=>p.requiredExtensions=['unknown'],'UNKNOWN_FIELD'],
    [p=>p.clips.push({...p.clips[0]}),'DUPLICATE_ID'],
    [p=>p.clips[0].inUs=1,'RANGE_NOT_ON_FRAME'],
    [p=>p.clips[0].assetId='outside-library','ASSET_NOT_READY'],
    [p=>p.voices[0].startFrame=14,'TIMELINE_GAP'],
    [p=>p.stickers[0].endFrame=30,'TIMELINE_OUT_OF_RANGE']
  ];
  const before=await fs.readFile(path.join(f.root,'state.json'));
  for(const [change,expected] of cases){const r=f.request();change(r.plan);await assert.rejects(f.imports.prepare(r),code(expected));assert.deepEqual(await fs.readFile(path.join(f.root,'state.json')),before);}
}));

test('准备后原素材或索引改变必须拒绝；旧工程和回执不出现半提交',async()=>fixture(async f=>{
  const ticket=await f.imports.prepare(f.request()),before=f.store.view();
  const file=path.join(f.root,'assets',f.assets[0].sha256);await fs.writeFile(file,Buffer.from('x'.repeat(f.assets[0].bytes)));
  await assert.rejects(f.imports.commit(commitRequest(ticket)),code('ASSET_CHANGED'));assert.deepEqual(f.store.view(),before);
  assert.equal(f.imports.receipt({workspaceId:ticket.workspaceId,operationId:ticket.operationId}).status,'not_committed');
}));

test('跨库票据、改哈希和过期票据不能提交，准备状态跨重启保持',async()=>fixture(async f=>{
  const ticket=await f.imports.prepare(f.request());await f.reopen();
  await assert.rejects(f.imports.commit({...commitRequest(ticket),workspaceId:randomUUID()}),code('WORKSPACE_MISMATCH'));
  await assert.rejects(f.imports.commit({...commitRequest(ticket),planHash:'f'.repeat(64)}),code('TICKET_MISMATCH'));
  await f.store.write(s=>{s.draftPreparations[0].expiresAt=0;});
  await assert.rejects(f.imports.commit(commitRequest(ticket)),code('TICKET_EXPIRED'));assert.equal(f.store.view().projects.length,1);
}));

test('提交磁盘重命名失败保持内存与磁盘原件，重试可恢复',async t=>fixture(async f=>{
  const ticket=await f.imports.prepare(f.request()),before=await fs.readFile(path.join(f.root,'state.json')),projects=f.store.view().projects;
  const original=fs.rename;
  const patch=t.mock.method(fs,'rename',async(...args)=>{if(args[1]===path.join(f.root,'state.json'))throw Error('isolated-rename-failure');return original(...args);});
  await assert.rejects(f.imports.commit(commitRequest(ticket)),/isolated-rename-failure/);patch.mock.restore();
  assert.deepEqual(await fs.readFile(path.join(f.root,'state.json')),before);assert.deepEqual(f.store.view().projects,projects);assert.equal((await fs.readdir(path.join(f.root,'incoming'))).length,0);
  await f.reopen();await f.imports.commit(commitRequest(ticket));assert.equal(f.store.view().projects.length,2);
}));

test('名称冲突保留提醒且可编译；缺素材保留原文占位并阻止伪造完整成片',async()=>fixture(async f=>{
  const conflict=f.request();conflict.plan.warnings=[{clipId:'clip-1',message:'用户说羊蹄，画面标签为猪蹄，待替换确认'}];
  const r1=await f.imports.commit(commitRequest(await f.imports.prepare(conflict)));assert.equal(r1.warnings.length,1);compilePlan(f.store.project(r1.projectId),f.assets);
  const missing=f.request();missing.plan.gaps=[{gapId:'gap-1',startFrame:15,frames:30,text:'医院画面',reason:'没有合适素材'}];
  const r2=await f.imports.commit(commitRequest(await f.imports.prepare(missing)));await f.reopen();const p=f.store.project(r2.projectId);
  assert.equal(p.text,missing.plan.text);assert.deepEqual(p.draftImport.pendingGaps,missing.plan.gaps);assert.throws(()=>compilePlan(p,f.assets),/待补素材/);
}));

test('受控HTTP处理器提供能力、准备、提交、回执及有限输入错误，不泄露路径',async()=>fixture(async f=>{
  const url='http://test/api/copy-edit/draft/',post=(name,value)=>f.imports.response(new Request(url+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}));
  const caps=await (await f.imports.response(new Request(url+'capabilities'))).json();assert.equal(caps.value.workspaceId,f.store.workspaceId);
  const prepared=await (await post('prepare',f.request())).json();assert.equal(prepared.ok,true);
  const committed=await (await post('commit',commitRequest(prepared.value))).json();assert.equal(committed.ok,true);
  const query=new URLSearchParams({workspaceId:f.store.workspaceId,operationId:prepared.value.operationId});
  const receipt=await (await f.imports.response(new Request(url+'receipt?'+query))).json();assert.deepEqual(receipt.value,committed.value);
  const wrong=await post('prepare',{...f.request(),workspaceId:'wrong'});assert.equal(wrong.status,409);assert(!(await wrong.text()).includes(f.root));
  const large=await f.imports.response(new Request(url+'prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(270000)}));assert.equal(large.status,413);
}));

test('过期准备保留操作内容绑定，只能续领同内容新票据；旧票据不能复活',async()=>fixture(async f=>{
  const request=f.request(),old=await f.imports.prepare(request);
  await f.store.write(s=>{s.draftPreparations[0].expiresAt=0;});
  // 其他请求会压缩过期正文，不能一并丢弃幂等身份。
  await f.imports.prepare(f.request());await f.reopen();
  await assert.rejects(f.imports.prepare({...request,plan:{...request.plan,text:'不同草案'}}),code('OPERATION_CONFLICT'));
  const fresh=await f.imports.prepare(request);assert.notEqual(fresh.ticketId,old.ticketId);
  await assert.rejects(f.imports.commit(commitRequest(old)),code('TICKET_MISMATCH'));
  await f.imports.commit(commitRequest(fresh));assert.equal(f.store.view().projects.length,2);
}));

test('已准备正文或素材索引被改动不能沿用旧摘要提交',async()=>fixture(async f=>{
  const ticket=await f.imports.prepare(f.request());
  await f.store.write(s=>{s.draftPreparations[0].plan.text='损坏正文';});
  await assert.rejects(f.imports.commit(commitRequest(ticket)),code('PLAN_CHANGED'));
  const second=await f.imports.prepare(f.request());
  await f.store.write(s=>{s.assets[0].ptsUs[1]=33334;});
  await assert.rejects(f.imports.commit(commitRequest(second)),code('ASSET_CHANGED'));
  assert.equal(f.store.view().projects.length,1);
}));

test('拒绝缺失正文、过深JSON、非JSON值；合法字段重排哈希不变',async()=>fixture(async f=>{
  const r=f.request();delete r.plan;await assert.rejects(f.imports.prepare(r),code('INVALID_JSON_VALUE'));
  const deep={};let child=deep;for(let i=0;i<30;i++){child.next={};child=child.next;}
  assert.throws(()=>draftHash(deep),code('INVALID_JSON_DEPTH'));
  for(const value of [NaN,Infinity,undefined,new Date()])assert.throws(()=>draftHash(value),code('INVALID_JSON_VALUE'));
  assert.equal(draftHash({b:2,a:1}),draftHash({a:1,b:2}));
}));

test('只有缺口也验证四轨时长，超出总长的占位、声音、贴片均拒绝',async()=>fixture(async f=>{
  const request=f.request();request.plan.clips=[];request.plan.assets=request.plan.assets.filter(a=>a.assetId!=='v');
  request.plan.gaps=[{gapId:'gap-1',startFrame:0,frames:15,text:'保留原句',reason:'无素材'}];
  const good=await f.imports.prepare(request);await f.imports.commit(commitRequest(good));
  for(const [mutate,expected] of [
    [p=>p.voices[0].startFrame=1799,'TIMELINE_GAP'],
    [p=>p.stickers[0].endFrame=16,'TIMELINE_OUT_OF_RANGE'],
    [p=>p.gaps[0].startFrame=1,'TIMELINE_OUT_OF_RANGE']
  ]){const r=structuredClone(request);r.operationId=randomUUID();mutate(r.plan);await assert.rejects(f.imports.prepare(r),code(expected));}
  const tooLong=f.request();tooLong.plan.gaps=[{gapId:'long',startFrame:0,frames:1800,text:'保留',reason:'无素材'}];
  await assert.rejects(f.imports.prepare(tooLong),code('DURATION_EXCEEDED'));
}));

test('磁盘写入或同步失败不发布工程且清掉本次临时文件',async t=>fixture(async f=>{
  const ticket=await f.imports.prepare(f.request()),before=await fs.readFile(path.join(f.root,'state.json'));
  for(const method of ['writeFile','sync']){
    const original=fs.open,patch=t.mock.method(fs,'open',async(...args)=>{
      const handle=await original(...args);
      if(args[1]==='wx'&&path.dirname(args[0])===path.join(f.root,'incoming'))handle[method]=async()=>{throw Error('isolated-'+method+'-failure');};
      return handle;
    });
    try{await assert.rejects(f.imports.commit(commitRequest(ticket)),new RegExp('isolated-'+method+'-failure'));}finally{patch.mock.restore();}
    assert.deepEqual(await fs.readFile(path.join(f.root,'state.json')),before);assert.equal(f.store.view().projects.length,1);
    assert.deepEqual(await fs.readdir(path.join(f.root,'incoming')),[]);
  }
  await f.reopen();await f.imports.commit(commitRequest(ticket));
}));

test('准备或提交时空间不足均拒绝，不产生半工程',async t=>fixture(async f=>{
  const ticket=await f.imports.prepare(f.request()),before=await fs.readFile(path.join(f.root,'state.json'));
  const patch=t.mock.method(fs,'statfs',async()=>({bavail:1n,bsize:4096n}));
  try{
    await assert.rejects(f.imports.prepare(f.request()),code('INSUFFICIENT_SPACE'));
    await assert.rejects(f.imports.commit(commitRequest(ticket)),code('INSUFFICIENT_SPACE'));
  }finally{patch.mock.restore();}
  assert.deepEqual(await fs.readFile(path.join(f.root,'state.json')),before);assert.equal(f.store.view().projects.length,1);
}));

test('畸形列表成员及伪装颜色作为输入错误返回，不能变成内部异常',async()=>fixture(async f=>{
  const r=f.request();r.plan.clips=[null];await assert.rejects(f.imports.prepare(r),code('INVALID_OBJECT'));
  r.plan=structuredClone(f.plan);r.plan.stickers[0].color=['#ffffff'];await assert.rejects(f.imports.prepare(r),code('INVALID_STYLE'));
}));
