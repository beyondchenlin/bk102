import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';
import {DesktopMedia,hashFile} from '../src/desktop-media.mjs';
import {DraftImports} from '../src/draft-import.mjs';
import {compilePlan,TRACK_ORDER} from '../src/project.mjs';
import {musicPhaseAt} from '../src/audio-timing.mjs';

test('真实媒体：整份30秒7镜头四轨草案导入、编辑、保存重开及丢回执恢复', {skip:process.platform!=='win32'}, async t=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'draft-media-'));let store,media,imports;
  const durations=[4,4,4,4,4,5,5],colors=['red','green','blue','yellow','cyan','magenta','gray'];
  const assets=[],sources=[];
  const request=(route,value)=>imports.response(new Request('http://isolated/api/copy-edit/draft/'+route,value?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:undefined));
  async function call(route,value){const response=await request(route,value),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.ok,true);return body.value;}
  async function open(){store=await new ProjectStore(path.join(root,'store')).init();media=await new DesktopMedia(store).init();assert(media.available,'需配置已有FFmpeg，不能跳过真实媒体验收');imports=new DraftImports(store);}
  async function close(){await media?.close();await store?.close();}
  async function generate(name,args){
    const file=path.join(root,name);await media.run(media.ffmpeg,['-v','error','-nostdin',...args,file]);
    const asset=await media.importStream(createReadStream(file),name);assets.push(asset);sources.push({file,sha256:asset.sha256});return asset;
  }
  try{
    await open();const original=store.view().projects;
    for(let i=0;i<7;i++)await generate(`shot-${i}.mp4`,['-f','lavfi','-i',`color=c=${colors[i]}:s=160x288:r=30:d=7`,'-c:v','libx264','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p','-an']);
    await generate('voice.wav',['-f','lavfi','-i','sine=frequency=457:sample_rate=48000:duration=30','-c:a','pcm_s16le']);
    await generate('bgm.wav',['-f','lavfi','-i','sine=frequency=217:sample_rate=48000:duration=7','-c:a','pcm_s16le']);
    await generate('sticker.png',['-f','lavfi','-i','color=c=white:s=1080x400','-frames:v','1','-threads','1']);
    const plan={schemaVersion:1,draftId:'synthetic-seven-shots',revision:1,requiredCapabilities:['draft.atomic.v1','tracks.four.v1','source.pts.v1'],canvas:{width:1080,height:1920,fps:{numerator:30,denominator:1}},
      text:'这是一份羊蹄素材工程的结构测试文案。画面和声音均为合成测试材料。',
      assets:assets.map((a,i)=>({assetId:'source-'+i,sha256:a.sha256,bytes:a.bytes,kind:a.kind})),
      // 每段都从1秒进入：同时证明不是默认前4秒，也不是忽略入点。
      clips:durations.map((seconds,i)=>({clipId:'shot-'+i,assetId:'source-'+i,inUs:assets[i].ptsUs[30],outUs:assets[i].ptsUs[30+seconds*30]})),
      stickers:[{stickerId:'whole',assetId:'source-9',text:'全程贴片',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:200,width:1080,startFrame:0,endFrame:null},
        {stickerId:'section',assetId:'source-9',text:'分段贴片',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,x:0,y:650,width:1080,startFrame:120,endFrame:240}],
      voices:[{voiceId:'narration',assetId:'source-7',text:'测试声音，非真实配音',inUs:0,outUs:30000000,startFrame:0,volume:1}],
      music:[{musicId:'music',assetId:'source-8',startFrame:0,endFrame:null,offsetSamples:0,volume:.15}],warnings:[],gaps:[]};
    const caps=await call('capabilities');for(const feature of plan.requiredCapabilities)assert(caps.features.includes(feature));
    const prepare={workspaceId:caps.workspaceId,operationId:randomUUID(),plan};const ticket=await call('prepare',prepare);
    assert.deepEqual(store.view().projects,original);await close();await open();
    const commit={workspaceId:ticket.workspaceId,operationId:ticket.operationId,ticketId:ticket.ticketId,planHash:ticket.planHash};
    const receipt=await call('commit',commit);let p=store.project(receipt.projectId),compiled=compilePlan(p,store.state.assets);
    assert.equal(p.clips.length,7);assert.equal(compiled.totalFrames,900);assert.deepEqual(p.trackOrder,TRACK_ORDER);
    assert.deepEqual(compiled.clips.map(c=>c.frames),[120,120,120,120,120,150,150]);assert(compiled.clips.every(c=>c.startUs===1000000));
    assert(receipt.sourceRanges.every(r=>r.inFrame===30&&r.roundingDeltaNumeratorUs===0&&r.roundingDeltaDenominator===30));
    assert.equal(compiled.voices.length,1);assert.equal(compiled.music.length,1);assert.equal(compiled.stickers.length,2);
    assert.equal(compiled.stickers[0].endFrame,900);assert.equal(compiled.stickers[1].endFrame,240);
    const edit=async command=>p=await store.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});
    await edit({type:'splitVoice',voiceId:'narration',frame:450});await edit({type:'splitMusic',musicId:'music',frame:450});
    await edit({type:'splitSticker',stickerId:'whole',frame:450});await edit({type:'splitClip',clipId:'shot-0',offsetFrame:60});
    assert.equal(compilePlan(p,store.state.assets).totalFrames,900);assert.equal(p.voiceClips[0].outUs,p.voiceClips[1].inUs);assert.equal(p.voiceClips[1].outUs,30000000);
    assert.equal(p.musicClips[1].offsetSamples,musicPhaseAt(p.musicClips[0],450,assets[8]));
    await edit({type:'replaceClip',clipId:'shot-1',assetId:assets[2].assetId});
    await edit({type:'moveSticker',stickerId:'section',x:30,y:300,width:1000});
    await edit({type:'undo'});await edit({type:'redo'});
    await edit({type:'saveCopy',title:'结构测试',text:plan.text+'保存重开测试。'});
    compiled=compilePlan(p,store.state.assets);assert.equal(compiled.totalFrames,900);
    const expected=structuredClone(p),stateFile=path.join(store.root,'state.json'),before=await hashFile(stateFile);
    await assert.rejects(store.mutate({projectId:p.projectId,expectedRevision:p.revision-1,operationId:randomUUID(),command:{type:'removeClip',clipId:'shot-1'}}),/已更新/);
    assert.equal(await hashFile(stateFile),before);
    await close();await open();assert.deepEqual(store.project(p.projectId),expected);assert.deepEqual(compilePlan(store.project(p.projectId),store.state.assets),compiled);
    assert.deepEqual(await call('commit',commit),receipt);assert.equal((await call('prepare',prepare)).status,'committed');
    assert.deepEqual(store.project(p.projectId),expected);assert.deepEqual(store.view().projects.slice(0,original.length),original);
    assert.equal(store.view().projects.length,original.length+1);
    for(const source of sources)assert.equal(await hashFile(source.file),source.sha256);
    for(const asset of assets)assert.equal(await hashFile(media.fileFor(asset.assetId)),asset.sha256);
    t.diagnostic(JSON.stringify({seconds:30,initialShots:7,editedShots:8,frames:compiled.totalFrames,assets:assets.length,mediaBytes:assets.reduce((n,a)=>n+a.bytes,0),restartCount:2,registeredVia:'DesktopMedia.importStream',importVia:'DraftImports.response',fixture:'真实编码色块/正弦波/PNG，不是实际羊蹄识别、UI或人声质量验收'}));
  }finally{
    await close();const resolved=await fs.realpath(root);
    assert.equal(path.dirname(resolved).toLowerCase(),base.toLowerCase());
    const entries=await fs.readdir(root,{recursive:true,withFileTypes:true});assert(!entries.some(e=>e.isSymbolicLink()));
    await fs.rm(root,{recursive:true});
  }
});
