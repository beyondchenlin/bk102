import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {newProject, compilePlan, outputFrames} from './project.mjs';

const FEATURES=['draft.atomic.v1','tracks.four.v1','source.pts.v1','gaps.persist.v1','source.mapping.v1'];
const MAX_BYTES=256*1024, MAX_REQUEST_BYTES=MAX_BYTES+4096, TTL_MS=15*60*1000;
export class DraftImportError extends Error {
  constructor(code, field='') { super(`草案导入失败：${code}${field?'（'+field+'）':''}`);this.code=code;this.field=field; }
}
const fail=(code,field)=>{throw new DraftImportError(code,field);};
function object(v,keys,field){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)fail('INVALID_OBJECT',field);
  if(Object.keys(v).some(k=>!keys.includes(k)))fail('UNKNOWN_FIELD',field);
  return v;
}
function integer(v,min,max,field){if(!Number.isSafeInteger(v)||v<min||v>max)fail('INVALID_RANGE',field);return v;}
function text(v,max,field){if(typeof v!=='string'||v.length>max)fail('INVALID_TEXT',field);return v;}
function id(v,field){if(typeof v!=='string'||!/^[-\w]{1,80}$/.test(v))fail('INVALID_ID',field);return v;}
function list(v,max,field){if(!Array.isArray(v)||v.length>max)fail('INVALID_LIST',field);return v;}
function unique(rows,key,field){const ids=new Set();for(const r of rows){if(!r||typeof r!=='object'||Array.isArray(r))fail('INVALID_OBJECT',field);id(r[key],field);if(ids.has(r[key]))fail('DUPLICATE_ID',field);ids.add(r[key]);}}
function canonical(v,depth=0){
  if(depth>24)fail('INVALID_JSON_DEPTH');
  if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  if(Array.isArray(v))return '['+Array.from(v,x=>canonical(x,depth+1)).join(',')+']';
  if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k],depth+1)).join(',')+'}';
  fail('INVALID_JSON_VALUE');
}
export const draftHash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const volume=(v,field)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)fail('INVALID_VOLUME',field);return v;};

/** 入出点必须是已登记的真实PTS边界；不猜平均帧率或静默扩大范围。 */
export function sourceRange(asset,inUs,outUs){
  integer(inUs,0,600000000,'clip.inUs');integer(outUs,inUs+1,600000000,'clip.outUs');
  const pts=asset.ptsUs;
  if(!Array.isArray(pts)||!pts.length||pts.length>72000)fail('INVALID_ASSET_INDEX');
  let previous=-1;
  for(const p of pts){integer(p,0,asset.endUs-1,'asset.ptsUs');if(p<=previous)fail('INVALID_ASSET_INDEX');previous=p;}
  integer(asset.endUs,previous+1,600000000,'asset.endUs');
  const inFrame=pts.indexOf(inUs),outFrame=outUs===asset.endUs?pts.length:pts.indexOf(outUs);
  if(inFrame<0||outFrame<=inFrame)fail('RANGE_NOT_ON_FRAME');
  return {inFrame,outFrame};
}

/** 只在请求的镜头范围内寻找实际边界，保持用户指定的工程帧数；来源授权由素材库核验。 */
export function mapSourceRange(asset,startUs,endUs,frames){
  integer(startUs,0,600000000,'startUs');integer(endUs,startUs+1,600000000,'endUs');
  integer(frames,1,18000,'frames');
  if(!Array.isArray(asset.ptsUs)||!asset.ptsUs.length)fail('INVALID_ASSET_INDEX');
  sourceRange(asset,asset.ptsUs[0],asset.endUs);
  const bounds=[...asset.ptsUs,asset.endUs];
  const lower=(target,lo=0)=>{let hi=bounds.length;while(lo<hi){const mid=(lo+hi)>>1;if(bounds[mid]<target)lo=mid+1;else hi=mid;}return lo;};
  for(let i=lower(startUs);i<bounds.length-1&&bounds[i]<endUs;i++){
    // outputFrames(duration) 的最小整数微秒，包含原有 1 微秒量化容差。
    const minDuration=frames===1?1:Math.floor((frames-1)*1000000/30)+2;
    const j=lower(bounds[i]+minDuration,i+1);
    if(j<bounds.length&&bounds[j]<=endUs&&outputFrames(bounds[j]-bounds[i])===frames)
      return {inUs:bounds[i],outUs:bounds[j],inFrame:i,outFrame:j,frames};
  }
  fail('NO_EXACT_SOURCE_RANGE');
}

function checkedPlan(plan,registered){
  object(plan,['schemaVersion','draftId','revision','requiredCapabilities','canvas','text','assets','clips','stickers','voices','music','warnings','gaps'],'plan');
  if(Buffer.byteLength(canonical(plan))>MAX_BYTES)fail('PLAN_TOO_LARGE');
  if(plan.schemaVersion!==1)fail('UNSUPPORTED_SCHEMA');
  id(plan.draftId,'draftId');integer(plan.revision,1,Number.MAX_SAFE_INTEGER,'revision');
  for(const f of list(plan.requiredCapabilities,16,'requiredCapabilities'))if(!FEATURES.includes(f))fail('UNSUPPORTED_CAPABILITY');
  object(plan.canvas,['width','height','fps'],'canvas');object(plan.canvas.fps,['numerator','denominator'],'fps');
  if(plan.canvas.width!==1080||plan.canvas.height!==1920||plan.canvas.fps.numerator!==30||plan.canvas.fps.denominator!==1)fail('UNSUPPORTED_CANVAS');
  text(plan.text,20000,'text');
  const refs=list(plan.assets,64,'assets');unique(refs,'assetId','assets');
  const assetMap=new Map(),used=new Set();let totalBytes=0;
  for(const r of refs){
    object(r,['assetId','sha256','bytes','kind'],'asset');
    if(!/^[a-f0-9]{64}$/.test(r.sha256)||!['video','audio','image'].includes(r.kind))fail('INVALID_ASSET_IDENTITY');
    totalBytes+=integer(r.bytes,1,512*1024*1024,'asset.bytes');if(totalBytes>2*1024**3)fail('ASSETS_TOO_LARGE');
    const a=registered.find(a=>a.sha256===r.sha256&&a.bytes===r.bytes&&a.kind===r.kind);
    if(!a)fail('ASSET_NOT_READY',r.assetId);
    assetMap.set(r.assetId,a);
  }
  const asset=(ref,kind)=>{id(ref,'assetId');const a=assetMap.get(ref);if(!a||a.kind!==kind)fail('ASSET_NOT_READY',ref);used.add(ref);return a;};
  const clips=list(plan.clips,120,'clips');unique(clips,'clipId','clips');
  const project=newProject('candidate',plan.text.trim().split(/[。！？\n]/u)[0].slice(0,120)||'未命名文案');
  project.text=plan.text;project.versions=[{version:1,title:project.title,text:plan.text,savedAt:project.updatedAt}];
  let videoFrames=0;
  project.clips=clips.map(c=>{
    object(c,['clipId','assetId','inUs','outUs','sourceVolume'],'clip');const a=asset(c.assetId,'video');const range=sourceRange(a,c.inUs,c.outUs);
    videoFrames+=outputFrames(c.outUs-c.inUs);return {clipId:c.clipId,assetId:a.assetId,...range,...(c.sourceVolume!==undefined?{sourceVolume:volume(c.sourceVolume,'clip.sourceVolume')}:{})};
  });
  if(videoFrames>18000)fail('DURATION_EXCEEDED');
  const voices=list(plan.voices,120,'voices');unique(voices,'voiceId','voices');
  project.voiceClips=voices.map(v=>{
    object(v,['voiceId','assetId','text','inUs','outUs','startFrame','volume'],'voice');const a=asset(v.assetId,'audio');
    integer(a.durationUs,1,600000000,'audio.durationUs');integer(v.inUs,0,a.durationUs-1,'voice.inUs');integer(v.outUs,v.inUs+1,a.durationUs,'voice.outUs');
    integer(v.startFrame,0,17999,'voice.startFrame');text(v.text,2000,'voice.text');if(!v.text.trim())fail('INVALID_TEXT','voice.text');
    return {...v,assetId:a.assetId,clipIds:[],copyVersion:1,volume:volume(v.volume,'voice.volume')};
  });
  project.audio={timelineVersion:2,voiceMode:'independent',bgmMode:'segments',voice:null,bgm:null};
  project.stickers=list(plan.stickers,120,'stickers').map(s=>{
    object(s,['stickerId','assetId','text','color','stroke','background','transparent','x','y','width','startFrame','endFrame'],'sticker');
    const a=asset(s.assetId,'image');
    if(a.width!==1080||a.height!==400||a.mime!=='image/png')fail('INVALID_STICKER_ASSET');
    text(s.text,500,'sticker.text');for(const k of ['color','stroke','background'])if(typeof s[k]!=='string'||!/^#[a-f0-9]{6}$/i.test(s[k]))fail('INVALID_STYLE',k);
    if(typeof s.transparent!=='boolean')fail('INVALID_STYLE','transparent');
    integer(s.width,216,1080,'sticker.width');integer(s.x,Math.ceil(-s.width/2),Math.floor(1080-s.width/2),'sticker.x');
    integer(s.y,Math.ceil(-400*s.width/2160),Math.floor(1920-400*s.width/2160),'sticker.y');
    integer(s.startFrame,0,17999,'sticker.startFrame');if(s.endFrame!==null)integer(s.endFrame,s.startFrame+1,18000,'sticker.endFrame');
    return {...s,assetId:a.assetId};
  });unique(project.stickers,'stickerId','stickers');
  project.musicClips=list(plan.music,120,'music').map(m=>{
    object(m,['musicId','assetId','startFrame','endFrame','offsetSamples','volume'],'music');const a=asset(m.assetId,'audio');
    integer(a.durationUs,1,600000000,'music.durationUs');integer(m.startFrame,0,17999,'music.startFrame');
    if(m.endFrame!==null)integer(m.endFrame,m.startFrame+1,18000,'music.endFrame');
    integer(m.offsetSamples,0,Math.max(1,Math.round(a.durationUs*48000/1e6))-1,'music.offsetSamples');
    return {...m,assetId:a.assetId,volume:volume(m.volume,'music.volume')};
  });unique(project.musicClips,'musicId','music');
  const warnings=list(plan.warnings,120,'warnings').map(w=>{object(w,['clipId','message'],'warning');if(!clips.some(c=>c.clipId===w.clipId))fail('UNKNOWN_CLIP','warning');text(w.message,1000,'warning.message');return {...w};});
  const gaps=list(plan.gaps,120,'gaps').map(g=>{object(g,['gapId','startFrame','frames','text','reason'],'gap');id(g.gapId,'gapId');integer(g.startFrame,0,17999,'gap.startFrame');integer(g.frames,1,18000-g.startFrame,'gap.frames');text(g.text,2000,'gap.text');text(g.reason,1000,'gap.reason');return {...g};});unique(gaps,'gapId','gaps');
  const sorted=[...gaps].sort((a,b)=>a.startFrame-b.startFrame);for(let i=1;i<sorted.length;i++)if(sorted[i].startFrame<sorted[i-1].startFrame+sorted[i-1].frames)fail('OVERLAPPING_GAPS');
  if(!clips.length&&!gaps.length)fail('EMPTY_DRAFT');
  const logicalFrames=videoFrames+gaps.reduce((n,g)=>n+g.frames,0);
  if(logicalFrames>18000)fail('DURATION_EXCEEDED');
  if(gaps.some(g=>g.startFrame+g.frames>logicalFrames))fail('TIMELINE_OUT_OF_RANGE');
  if(project.voiceClips.some(v=>v.startFrame+outputFrames(v.outUs-v.inUs)>logicalFrames))fail('TIMELINE_GAP');
  if([...project.stickers,...project.musicClips].some(s=>s.startFrame>=logicalFrames||(s.endFrame!==null&&s.endFrame>logicalFrames)))fail('TIMELINE_OUT_OF_RANGE');
  if(used.size!==refs.length)fail('UNUSED_ASSET');
  if(clips.length){
    let compiled;try{compiled=compilePlan(project,registered);}catch{fail('INVALID_TIMELINE');}
    if(!gaps.length&&compiled.totalFrames!==videoFrames)fail('TIMELINE_GAP');
  }
  // 未匹配信息必须持久保存；旧渲染器不能把缺口压缩后冒称完整成片。
  project.draftImport={schemaVersion:1,draftId:plan.draftId,revision:plan.revision,warnings,pendingGaps:gaps};
  return {project,assets:[...new Set(assetMap.values())],assetMap:Object.fromEntries([...assetMap].map(([k,v])=>[k,v.assetId]))};
}

/** 只读取宿主管理目录中已登记的文件；每次提交重新检查，票据不替代文件身份。 */
async function verifyFiles(root,assets){
  const parent=path.join(root,'assets');
  if(!(await fs.lstat(parent)).isDirectory()||(await fs.lstat(parent)).isSymbolicLink())fail('INVALID_ASSET_DIRECTORY');
  const physical=await fs.realpath(parent);
  for(const asset of assets){
    const file=path.join(parent,asset.sha256);let handle;
    try{
      const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.bytes)fail('ASSET_CHANGED');
      if(path.dirname(await fs.realpath(file))!==physical)fail('ASSET_CHANGED');
      handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
      const before=await handle.stat({bigint:true});if(before.size!==BigInt(asset.bytes))fail('ASSET_CHANGED');
      const h=createHash('sha256'),buffer=Buffer.alloc(256*1024);let bytes=0;
      for(;;){const r=await handle.read(buffer,0,buffer.length,null);if(!r.bytesRead)break;bytes+=r.bytesRead;if(bytes>asset.bytes)fail('ASSET_CHANGED');h.update(buffer.subarray(0,r.bytesRead));}
      const after=await handle.stat({bigint:true});
      const current=await fs.lstat(file,{bigint:true});
      if(!current.isFile()||current.isSymbolicLink()||current.ino!==after.ino||current.dev!==after.dev||current.size!==after.size||current.mtimeNs!==after.mtimeNs||bytes!==asset.bytes||h.digest('hex')!==asset.sha256||before.ino!==after.ino||before.mtimeNs!==after.mtimeNs||before.size!==after.size)fail('ASSET_CHANGED');
    }catch(e){if(e instanceof DraftImportError)throw e;fail('ASSET_NOT_READABLE');}finally{await handle?.close();}
  }
}

async function verifySpace(root,state){
  const space=await fs.statfs(root,{bigint:true});
  // 已登记素材不复制。这里只给下一份状态快照及安全余量预留空间。
  const required=BigInt(Buffer.byteLength(JSON.stringify(state)))*2n+64n*1024n*1024n;
  if(space.bavail*space.bsize<required)fail('INSUFFICIENT_SPACE');
}

export class DraftImports {
  constructor(store){this.store=store;}
  capabilities(){return {schemaVersion:1,workspaceId:this.store.workspaceId,features:[...FEATURES],canvas:{width:1080,height:1920,fps:{numerator:30,denominator:1}},maxDurationFrames:18000,maxAssets:64,maxPlanBytes:MAX_BYTES,maxRequestBytes:MAX_REQUEST_BYTES,maxActivePreparations:16,maxReservedOperations:256,mode:'new-candidate'};}
  scope(request,keys){object(request,keys,'request');if(request.workspaceId!==this.store.workspaceId)fail('WORKSPACE_MISMATCH');id(request.operationId,'operationId');}
  async mapSource(request){
    object(request,['workspaceId','assetId','sha256','bytes','startUs','endUs','frames'],'request');
    if(request.workspaceId!==this.store.workspaceId)fail('WORKSPACE_MISMATCH');
    id(request.assetId,'assetId');
    if(typeof request.sha256!=='string'||!/^[a-f0-9]{64}$/.test(request.sha256))fail('INVALID_ASSET_IDENTITY');
    integer(request.bytes,1,512*1024*1024,'bytes');
    const asset=this.store.state.assets.find(a=>a.assetId===request.assetId&&a.kind==='video'&&a.sha256===request.sha256&&a.bytes===request.bytes);
    if(!asset)fail('ASSET_NOT_READY');
    await verifyFiles(this.store.root,[asset]);
    return mapSourceRange(asset,request.startUs,request.endUs,request.frames);
  }
  async prepare(request){
    // 冻结调用者对象，等待存储写锁期间不能被修改。
    request=structuredClone(request);this.scope(request,['workspaceId','operationId','plan']);
    const inputHash=draftHash(request.plan);
    return this.store.write(async state=>{
      const done=(state.draftReceipts||[]).find(r=>r.operationId===request.operationId);
      if(done){if(done.planHash!==inputHash)fail('OPERATION_CONFLICT');return {status:'committed',receipt:done};}
      const old=(state.draftPreparations||[]).find(p=>p.operationId===request.operationId);
      if(old&&old.planHash!==inputHash)fail('OPERATION_CONFLICT');
      const checked=checkedPlan(request.plan,state.assets);
      await verifySpace(this.store.root,state);
      await verifyFiles(this.store.root,checked.assets);
      const now=Date.now(),pending=state.draftPreparations||[];
      if(old&&old.expiresAt>now)return this.ticket(old);
      if(pending.filter(p=>p.expiresAt>now).length>=16)fail('PREPARATIONS_FULL');
      if(!old&&pending.length>=256)fail('RESERVATIONS_FULL');
      const row={workspaceId:this.store.workspaceId,operationId:request.operationId,ticketId:randomUUID(),planHash:inputHash,plan:request.plan,assetMetadataHash:draftHash(checked.assets),expiresAt:now+TTL_MS};
      // 过期后只压缩大正文，操作与内容的绑定不丢；同一输入可重新准备，旧票据失效。
      state.draftPreparations=[...pending.filter(p=>p!==old).map(p=>p.expiresAt>now?p:{operationId:p.operationId,planHash:p.planHash,expiresAt:0}),row];return this.ticket(row);
    });
  }
  ticket(p){return {status:'prepared',workspaceId:p.workspaceId,operationId:p.operationId,ticketId:p.ticketId,planHash:p.planHash,expiresAt:p.expiresAt};}
  async commit(request,{guard,afterCommit}={}){
    request=structuredClone(request);this.scope(request,['workspaceId','operationId','ticketId','planHash']);id(request.ticketId,'ticketId');
    if(!/^[a-f0-9]{64}$/.test(request.planHash))fail('INVALID_PLAN_HASH');
    return this.store.write(async state=>{
      guard?.(state);
      const old=(state.draftReceipts||[]).find(r=>r.operationId===request.operationId);
      if(old){if(old.planHash!==request.planHash||old.ticketId!==request.ticketId)fail('OPERATION_CONFLICT');return old;}
      const row=(state.draftPreparations||[]).find(p=>p.ticketId===request.ticketId&&p.operationId===request.operationId);
      if(!row||row.workspaceId!==request.workspaceId||row.planHash!==request.planHash)fail('TICKET_MISMATCH');
      if(row.expiresAt<=Date.now())fail('TICKET_EXPIRED');
      if(draftHash(row.plan)!==row.planHash)fail('PLAN_CHANGED');
      const checked=checkedPlan(row.plan,state.assets);
      if(draftHash(checked.assets)!==row.assetMetadataHash)fail('ASSET_CHANGED');
      await verifySpace(this.store.root,state);
      await verifyFiles(this.store.root,checked.assets);
      if(state.projects.length>=100||(state.draftReceipts||[]).length>=100)fail('PROJECT_LIMIT');
      const projectId='draft-'+draftHash({workspaceId:this.store.workspaceId,operationId:request.operationId}).slice(0,32);
      if(state.projects.some(p=>p.projectId===projectId))fail('PROJECT_CONFLICT');
      const project={...checked.project,projectId};
      const sourceRanges=row.plan.clips.map((c,i)=>{
        const {inFrame,outFrame}=project.clips[i],frames=outputFrames(c.outUs-c.inUs);
        return {clipId:c.clipId,assetId:c.assetId,inUs:c.inUs,outUs:c.outUs,inFrame,outFrame,frames,
          // 工程帧量化相对源时长的差；分母固定30，避免再用浮点秒数传输。
          roundingDeltaNumeratorUs:frames*1000000-(c.outUs-c.inUs)*30,roundingDeltaDenominator:30};
      });
      const receipt={status:'committed',workspaceId:this.store.workspaceId,operationId:request.operationId,ticketId:request.ticketId,planHash:request.planHash,projectId,revision:project.revision,capabilities:this.capabilities(),assetMap:checked.assetMap,sourceRanges,warnings:project.draftImport.warnings,gaps:project.draftImport.pendingGaps};
      // 与工程在同一次原子state提交内保存永久回执，不使用旧100项编辑操作轮换窗口。
      state.projects.push(project);state.draftReceipts??=[];state.draftReceipts.push(receipt);
      state.draftPreparations=state.draftPreparations.filter(p=>p.ticketId!==row.ticketId);afterCommit?.(state,receipt);return receipt;
    });
  }
  receipt(request){this.scope(request,['workspaceId','operationId']);const r=(this.store.state.draftReceipts||[]).find(r=>r.operationId===request.operationId);return r?structuredClone(r):{status:'not_committed',operationId:request.operationId};}
  async response(request){
    try{
      const url=new URL(request.url),route=url.pathname;
      if(request.method==='GET'&&route==='/api/copy-edit/draft/capabilities')return Response.json({ok:true,value:this.capabilities()});
      if(request.method==='GET'&&route==='/api/copy-edit/draft/receipt')return Response.json({ok:true,value:this.receipt({workspaceId:url.searchParams.get('workspaceId'),operationId:url.searchParams.get('operationId')})});
      if(request.method!=='POST'||!['/api/copy-edit/draft/prepare','/api/copy-edit/draft/commit','/api/copy-edit/draft/map-source'].includes(route))return new Response(null,{status:404});
      if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return new Response(null,{status:415});
      let size=0,chunks=[];if(!request.body)fail('INVALID_JSON');
      for await(const b of request.body){size+=b.length;if(size>MAX_REQUEST_BYTES)fail('PLAN_TOO_LARGE');chunks.push(b);}
      let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_JSON');}
      const result=route.endsWith('/prepare')?await this.prepare(value):route.endsWith('/map-source')?await this.mapSource(value):await this.commit(value);
      return Response.json({ok:true,value:result});
    }catch(e){
      if(e instanceof DraftImportError)return Response.json({ok:false,error:{code:e.code,field:e.field}}, {status:e.code==='PLAN_TOO_LARGE'?413:409});
      return Response.json({ok:false,error:{code:'IMPORT_IO_FAILED'}},{status:500});
    }
  }
}
