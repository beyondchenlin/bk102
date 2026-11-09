import fs from 'node:fs/promises';import {createReadStream} from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {Readable} from 'node:stream';

// Host保管原始字节；Android报告索引。渲染仍须按实际文件重验摘要/PTS，不把客户端元数据当执行授权。
export function checkedNativeMetadata(value,sha){
  if(!value||value.sha256!==sha||!['video','audio','image'].includes(value.kind))throw Error('原生素材身份不匹配');
  const integer=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('原生素材索引无效');return v;};
  if(value.kind==='image'){if(value.width!==1080||value.height!==400||value.mime!=='image/png')throw Error('贴片必须为1080×400 PNG');return {kind:'image',width:1080,height:400,mime:'image/png'};}
  if(value.kind==='audio')return {kind:'audio',durationUs:integer(value.durationUs,1,600000000),mime:typeof value.mime==='string'&&/^audio\/[a-z0-9.+-]{1,64}$/.test(value.mime)?value.mime:'application/octet-stream'};
  const endUs=integer(value.endUs,1,600000000),width=integer(value.width,1,4096),height=integer(value.height,1,4096),pts=value.ptsUs;
  if(!Array.isArray(pts)||!pts.length||pts.length>20000||width*height>16777216)throw Error('视频索引超出范围');let previous=-1;for(const p of pts){integer(p,0,endUs-1);if(p<=previous)throw Error('视频PTS必须递增');previous=p;}
  return {kind:'video',width,height,rotation:[0,90,180,270].includes(value.rotation)?value.rotation:0,ptsUs:[...pts],endUs,mime:'video/mp4'};
}
export class NativeImports {
  constructor(store){this.store=store;this.entries=new Map();this.life=new AbortController();this.inflight=new Set();this.bytes=0;}
  async init(){const parent=path.join(this.store.root,'incoming');if((await fs.lstat(parent)).isSymbolicLink())throw Error('素材临时目录不能是链接');this.root=await fs.mkdtemp(path.join(parent,'native-'));}
  begin(body,name,signal){const work=this.receive(body,name,signal);this.inflight.add(work);work.finally(()=>this.inflight.delete(work)).catch(()=>{});return work;}
  async receive(body,name,signal){
    if(this.life.signal.aborted||this.inflight.size>=2||this.entries.size>=8)throw Error('请先完成当前原生素材导入');
    const assetId=randomUUID(),file=path.join(this.root,assetId),sig=AbortSignal.any([this.life.signal,signal||new AbortController().signal,AbortSignal.timeout(120000)]);let handle,bytes=0,kept=false;
    try{sig.throwIfAborted();handle=await fs.open(file,'wx');const hash=createHash('sha256');if(!body)throw Error('文件为空');for await(const chunk of Readable.fromWeb(body,{signal:sig})){sig.throwIfAborted();bytes+=chunk.length;this.bytes+=chunk.length;if(bytes>256*1024*1024||this.bytes>512*1024*1024)throw Error('原生素材缓存超出限制');hash.update(chunk);await handle.writeFile(chunk);}await handle.close();handle=null;sig.throwIfAborted();if(!bytes)throw Error('文件为空');const entry={assetId,sha256:hash.digest('hex'),bytes,name:String(name||'素材').replace(/[\u0000-\u001f/\\]/g,'_').slice(0,120),file};this.entries.set(assetId,entry);kept=true;return this.describe(assetId);
    }finally{if(handle)await handle.close();if(!kept){this.bytes-=bytes;await fs.rm(file,{force:true});}}
  }
  get(id){const e=this.entries.get(id);if(!e||this.life.signal.aborted)throw Error('导入已退出，请重新选择文件');return e;}
  describe(id){const {file,...value}=this.get(id);return value;}
  async response(id){const e=this.get(id);return new Response(Readable.toWeb(createReadStream(e.file,{signal:this.life.signal})),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(e.bytes),'Cache-Control':'no-store'}});}
  async commit(id,metadata){const entry=this.get(id);if(entry.answer)return entry.answer;const checked=checkedNativeMetadata(metadata,entry.sha256);const answer=await this.store.write(async state=>{
    this.life.signal.throwIfAborted();if(this.entries.get(id)!==entry)throw Error('导入已退出');const existing=state.assets.find(a=>a.sha256===entry.sha256);if(existing)return existing;if(state.assets.length>=200)throw Error('素材库已满');
    const hash=createHash('sha256');for await(const b of createReadStream(entry.file))hash.update(b);if(hash.digest('hex')!==entry.sha256)throw Error('素材字节已变化');
    const asset={assetId:id,sha256:entry.sha256,bytes:entry.bytes,name:entry.name,...checked,indexSource:'android-mediaextractor'};const target=path.join(this.store.root,'assets',entry.sha256);try{await fs.copyFile(entry.file,target,1);}catch(error){if(error.code!=='EEXIST')throw error;if(!(await fs.lstat(target)).isFile())throw Error('素材目标无效');const digest=createHash('sha256');for await(const b of createReadStream(target))digest.update(b);if(digest.digest('hex')!==entry.sha256)throw Error('素材目标摘要不匹配');}state.assets.push(asset);return asset;
  });entry.answer=answer;return answer;}
  async drop(id){const entry=this.entries.get(id);if(!entry)return;this.entries.delete(id);await fs.rm(entry.file,{force:true});this.bytes-=entry.bytes;}
  async close(){this.life.abort();await Promise.allSettled([...this.inflight]);for(const id of [...this.entries.keys()])await this.drop(id);if(this.root)await fs.rmdir(this.root).catch(e=>{if(e.code!=='ENOTEMPTY'&&e.code!=='ENOENT')throw e;});}
}
