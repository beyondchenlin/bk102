import test from 'node:test';
import assert from 'node:assert/strict';
import {importSelection,selectionSourceOrigin} from '../src/selection-import.mjs';

const id='11111111-1111-4111-8111-111111111111',assetId='22222222-2222-4222-8222-222222222222',sentence='33333333-3333-4333-8333-333333333333';
const hash='a'.repeat(64), workspaceId='44444444-4444-4444-8444-444444444444';
function fixture(){
  const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  let committed=null,prepared=null,uploads=0,lose=false,sourceChanged=false,failBefore=false;
  const manifest={plan_id:id,revision:1,text:'锅里的羊蹄。',fps:30,target_frames:30,assets:[{asset_id:assetId,sha256:hash,bytes:3}],sentences:[{sentence_id:sentence,text:'锅里的羊蹄。',frames:30,timeline_start_frame:0,gap_frames:0,selected:{asset_id:assetId,shot_id:id,revision:'r',start_us:0,end_us:1000000,source_in_us:0,source_out_us:1000000,name_conflicts:[{requested:'羊蹄',annotated:['鸡爪']}],unmatched_subjects:[]}}]};
  const json=value=>Response.json({ok:true,value});
  const fetcher=async(url,opt={})=>{
    if(url.startsWith('http://127.0.0.1:1234')){
      assert.equal(opt.credentials,'omit');assert.equal(opt.redirect,'error');
      if(url.includes('/assets/'))return new Response(new Uint8Array([1,2,3]));
      return Response.json(sourceChanged?{...manifest,text:'变化'}:manifest);
    }
    if(url.endsWith('/capabilities'))return json({workspaceId,features:['draft.atomic.v1','tracks.four.v1','source.pts.v1','source.mapping.v1']});
    if(url.includes('/receipt?'))return json(committed||{status:'not_committed'});
    if(url.endsWith('/map-source'))return json({inUs:0,outUs:1000000,frames:30});
    if(url.endsWith('/prepare')){prepared=JSON.parse(opt.body);return json({status:'prepared',workspaceId,operationId:prepared.operationId,ticketId:'ticket',planHash:hash,expiresAt:Date.now()+60000});}
    if(url.endsWith('/commit')){if(failBefore)throw Error('network unavailable');committed={status:'committed',projectId:'project-1',workspaceId,operationId:prepared.operationId,ticketId:'ticket',planHash:hash};if(lose)throw Error('response lost');return json(committed);}
    throw Error('unexpected URL '+url);
  };
  const uploadFile=async f=>{uploads++;if(f.type==='video/mp4')return {kind:'video',assetId,sha256:hash,bytes:3};return {kind:'image',assetId:'image',sha256:'b'.repeat(64),bytes:1};};
  const options={origin:'http://127.0.0.1:1234',token:'secret',planId:id,revision:1,workspaceId,storage,fetcher,uploadFile,newId:()=>id,stickerFile:async()=>new File(['x'],'x.png',{type:'image/png'})};
  return {options,map,get uploads(){return uploads;},get prepared(){return prepared;},lose(){lose=true;},change(){sourceChanged=true;},setFail(value){failBefore=value;},setCommitted(value){committed=value;}};
}
test('有界原片登记、真实帧映射、警告保留及提交响应丢失后查询原回执',async()=>{
  const f=fixture();f.lose();const result=await importSelection(f.options);
  assert.equal(result.projectId,'project-1');assert.equal(f.uploads,2);
  assert.match(f.prepared.plan.warnings[0].message,/鸡爪/);assert.equal(f.prepared.plan.clips[0].outUs,1000000);
  assert(![...f.map.values()].some(x=>x.includes('secret')));
  assert.equal((await importSelection(f.options)).projectId,'project-1');assert.equal(f.uploads,2);
});
test('准备前来源变化不创建工程；保留冻结请求与操作身份',async()=>{
  const f=fixture();const upload=f.options.uploadFile;f.options.uploadFile=async file=>{const a=await upload(file);if(file.type==='image/png')f.change();return a;};
  await assert.rejects(importSelection(f.options),/计划或授权已变化/);assert.equal(f.prepared,null);
  assert([...f.map.values()].some(x=>x.includes('"plan"')));
});
test('来源地址限制与能力不匹配时拒绝',async()=>{
  assert.throws(()=>selectionSourceOrigin('http://example.com'));
  assert.throws(()=>selectionSourceOrigin('https://user:pass@example.com'));
  const f=fixture();f.options.workspaceId='other';await assert.rejects(importSelection(f.options),/能力不匹配/);
});
test('提交前网络中断后沿用已保存的完整请求和操作身份，过期票据重新准备',async()=>{
  const f=fixture();f.setFail(true);await assert.rejects(importSelection(f.options),/network unavailable/);
  const original=f.prepared,uploads=f.uploads,[key,raw]=[...f.map.entries()][0],saved=JSON.parse(raw);
  saved.ticket.expiresAt=0;f.map.set(key,JSON.stringify(saved));f.setFail(false);
  assert.equal((await importSelection(f.options)).projectId,'project-1');assert.deepEqual(f.prepared,original);assert.equal(f.uploads,uploads);
});
test('损坏恢复记录不能把不相干的已提交工程当作本次结果',async()=>{
  const f=fixture();f.setFail(true);await assert.rejects(importSelection(f.options),/network unavailable/);
  f.setCommitted({status:'committed',workspaceId,operationId:id,ticketId:'other',planHash:hash,projectId:'unrelated'});
  await assert.rejects(importSelection(f.options),/回执与恢复记录不匹配/);
});
test('正文缺句和超过声明长度的原片在登记前拒绝',async()=>{
  const first=fixture(),fetch1=first.options.fetcher;
  first.options.fetcher=async(url,opt)=>{if(url.includes('/export?')){const r=await fetch1(url,opt),m=await r.json();m.sentences[0].text='别的句子';return Response.json(m);}return fetch1(url,opt);};
  await assert.rejects(importSelection(first.options),/正文或时长不完整/);assert.equal(first.uploads,0);
  const second=fixture(),fetch2=second.options.fetcher;
  second.options.fetcher=async(url,opt)=>url.includes('/assets/')?new Response(new Uint8Array([1,2,3,4])):fetch2(url,opt);
  await assert.rejects(importSelection(second.options),/原素材长度已变化/);assert.equal(second.uploads,0);
});
test('配音超出画面时长时不冻结错误草案，可改选后继续',async()=>{
  const f=fixture(),upload=f.options.uploadFile;
  f.options.voiceFile=new File(['voice'],'voice.wav',{type:'audio/wav'});
  f.options.uploadFile=async file=>file.type==='audio/wav'?{kind:'audio',assetId:'voice',sha256:'c'.repeat(64),bytes:5,durationUs:2000000}:upload(file);
  await assert.rejects(importSelection(f.options),/配音长于画面计划/);assert(![...f.map.values()].some(x=>JSON.parse(x).plan));
  f.options.uploadFile=async file=>file.type==='audio/wav'?{kind:'audio',assetId:'voice',sha256:'c'.repeat(64),bytes:5,durationUs:500000}:upload(file);
  await importSelection(f.options);assert.equal(f.prepared.plan.voices[0].outUs,500000);
});
test('素材库超大清单在登记之前拒绝',async()=>{
  const f=fixture(),fetch=f.options.fetcher;
  f.options.fetcher=async(url,opt)=>url.includes('/export?')?new Response('x'.repeat(256*1024+1)):fetch(url,opt);
  await assert.rejects(importSelection(f.options),/清单超过大小限制/);assert.equal(f.uploads,0);
});
