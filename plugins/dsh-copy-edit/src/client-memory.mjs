// 只保存视图/草稿，不持久化待重放命令、媒体字节或凭据。
export function emptyPanelMemory(){return {format:1,scope:null,route:{page:'home',projectId:null},trail:[],drafts:{},editors:{},home:{query:'',scrollTop:0},copy:{search:'',scrollTop:0,showList:false},job:null};}
export function normalizePanelMemory(value){
  const out=emptyPanelMemory(),record=v=>!!v&&typeof v==='object'&&!Array.isArray(v),text=(v,max)=>typeof v==='string'?v.slice(0,max):undefined;
  if(!record(value)||value.format!==1)return out;
  const identity=v=>typeof v==='string'&&/^[-\w]{1,80}$/.test(v)?v:null;
  const route=r=>record(r)&&['home','copy','edit','projects'].includes(r.page)?{page:r.page,projectId:identity(r.projectId)}:null;
  const number=(v,max=1e7)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:0;
  const sticker=s=>record(s)&&typeof s.text==='string'&&s.text.length<=500&&['color','stroke','background'].every(k=>/^#[a-fA-F0-9]{6}$/.test(s[k]))&&typeof s.transparent==='boolean'?s:undefined;
  out.scope=identity(value.scope);out.route=route(value.route)||out.route;out.trail=Array.isArray(value.trail)?value.trail.slice(-12).map(route).filter(Boolean):[];
  out.home={query:text(value.home?.query,1000)||'',scrollTop:number(value.home?.scrollTop)};
  out.copy={search:text(value.copy?.search,1000)||'',scrollTop:number(value.copy?.scrollTop),showList:value.copy?.showList===true};
  if(record(value.drafts))for(const [id,d] of Object.entries(value.drafts).slice(0,200))if(identity(id)&&record(d)){
    const result={title:text(d.title,120),text:text(d.text,20000),version:Number.isInteger(d.version)&&d.version>0?d.version:undefined,stickerId:identity(d.stickerId)||''};
    if(record(d.copyBase)&&typeof d.copyBase.title==='string'&&typeof d.copyBase.text==='string')result.copyBase={title:d.copyBase.title.slice(0,120),text:d.copyBase.text.slice(0,20000)};
    if(sticker(d.sticker)){result.sticker=d.sticker;result.stickerBase=sticker(d.stickerBase);}
    out.drafts[id]=result;
  }
  if(record(value.editors))for(const [id,e] of Object.entries(value.editors).slice(0,200))if(identity(id)&&record(e))out.editors[id]={revision:number(e.revision),selected:identity(e.selected),frame:Math.floor(number(e.frame)),position:number(e.position,60),zoom:Math.max(1,number(e.zoom,64)),selectedSticker:identity(e.selectedSticker),selectedVoice:identity(e.selectedVoice)};
  const j=value.job;if(record(j)&&identity(j.jobId)&&identity(j.projectId)&&['running','complete','failed','cancelled','retired'].includes(j.status)&&['preview','export'].includes(j.profile))out.job={jobId:j.jobId,projectId:j.projectId,revision:number(j.revision),status:j.status,profile:j.profile,...(j.executionLocation==='android-local'?{executionLocation:'android-local'}:{})};
  return out;
}
export function readPanelMemory(storage,key='dsh-copy-edit.session.v1'){
  try{const raw=(typeof storage==='function'?storage():storage).getItem(key);if(!raw||raw.length>3000000)return emptyPanelMemory();return normalizePanelMemory(JSON.parse(raw));}catch{return emptyPanelMemory();}
}
export function writePanelMemory(storage,value,key='dsh-copy-edit.session.v1'){
  const raw=JSON.stringify(value);if(raw.length>3000000)throw Error('草稿容量已满，请先保存版本');storage.setItem(key,raw);
}
export function navigatePanel(route,trail,next){
  if(route.page===next.page&&route.projectId===next.projectId)return {route,trail};
  if(next.page==='home')return {route:next,trail:[]};
  const existing=trail.findIndex(x=>x.page===next.page&&x.projectId===next.projectId);
  return {route:next,trail:existing>=0?trail.slice(0,existing):[...trail,route].slice(-12)};
}
export function restorePanelMemory(value,workspace){
  value=normalizePanelMemory(value);
  if(!workspace.workspaceId||value.scope!==workspace.workspaceId)return {...emptyPanelMemory(),scope:workspace.workspaceId};
  const ids=new Set(workspace.projects.map(p=>p.projectId));
  const valid=r=>r&&['home','projects'].includes(r.page)||r&&ids.has(r.projectId)&&['copy','edit'].includes(r.page);
  const retain=records=>Object.fromEntries(Object.entries(records||{}).filter(([id])=>ids.has(id)));
  return {...value,route:valid(value.route)?value.route:{page:'home',projectId:null},trail:value.trail.filter(valid),drafts:retain(value.drafts),editors:retain(value.editors)};
}
// 持久恢复按库、工程及字段分键；一个标签的旧草稿不能因编辑别的工程被重写。
export function readPersistentPanelMemory(storage,workspace){
  const base='dsh-copy-edit.recovery.v1:'+workspace.workspaceId+':',empty={...emptyPanelMemory(),scope:workspace.workspaceId};
  try{
    storage=typeof storage==='function'?storage():storage;
    const read=key=>{try{const raw=storage.getItem(base+key);return raw&&raw.length<=3000000?JSON.parse(raw):null;}catch{return null;}};
    const meta=read('view'),value=meta?.scope===workspace.workspaceId?{...empty,...meta,drafts:{},editors:{}}:empty;
    for(const p of workspace.projects.slice(0,100)){const d=read(p.projectId+':draft'),e=read(p.projectId+':editor');if(d)value.drafts[p.projectId]=d;if(e)value.editors[p.projectId]=e;}
    return restorePanelMemory(value,workspace);
  }catch{return empty;}
}
export function panelRecoveryBaseline(memory,existing=memory){
  return Object.fromEntries(['drafts','editors'].flatMap(group=>Object.entries(memory[group]).filter(([id])=>Object.hasOwn(existing[group],id)).map(([id,value])=>[group+':'+id,JSON.stringify(value)])));
}
// 每个编辑者独占一个键。localStorage 没有跨标签事务，不能靠先读后写检测并发。
export function panelDraftCopies(storage,scope,id){
  storage=typeof storage==='function'?storage():storage;
  const prefix='dsh-copy-edit.recovery.v1:'+scope+':'+id+':draft',keys=[prefix];
  for(let n=0;n<storage.length;n++){const key=storage.key(n);if(key?.startsWith(prefix+'-copy:'))keys.push(key);}
  const result=[],seen=new Set();
  for(const key of keys){try{const raw=storage.getItem(key);if(!raw||raw.length>100000)continue;const v=JSON.parse(raw),copy=key===prefix?{draft:v,updatedAt:0}:v;
    const draft=normalizePanelMemory({format:1,drafts:{[id]:copy.draft}}).drafts[id];if(!draft)continue;
    const json=JSON.stringify(draft);if(seen.has(json))continue;seen.add(json);result.push({key,draft,updatedAt:Number.isFinite(copy.updatedAt)?copy.updatedAt:0});
  }catch{/* 损坏副本独立隔离，不挡其他可恢复稿。 */}}
  return result.sort((a,b)=>b.updatedAt-a.updatedAt);
}
export function forkPanelRecovery(written){delete written.$writer;}
export function recoveryWriterId(cryptoSource=globalThis.crypto){
  return typeof cryptoSource.randomUUID==='function'?cryptoSource.randomUUID():Array.from(cryptoSource.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
}
export function writePersistentPanelMemory(storage,memory,written){
  storage=typeof storage==='function'?storage():storage;
  const base='dsh-copy-edit.recovery.v1:'+memory.scope+':';
  for(const group of ['drafts','editors'])for(const [id,value] of Object.entries(memory[group])){
    const json=JSON.stringify(value),key=group+':'+id;if(json===written[key])continue;
    if(json.length>100000)throw Error('单个工程草稿过大，请保存版本');
    if(group==='drafts'){
      const writer=written.$writer||recoveryWriterId(),prefix=base+id+':draft-copy:',ownKey=prefix+writer;
      let count=0;for(let n=0;n<storage.length;n++)if(storage.key(n)?.startsWith(prefix))count++;
      if(count>=100&&!storage.getItem(ownKey))throw Error('此工程恢复副本已满，请先复制正文并保存版本');
      // 迁移旧的单键草稿；先留下副本，任何写入失败都不更新成功基线。
      const legacy=storage.getItem(base+id+':draft');let legacyDraft;
      try{if(legacy&&legacy.length<=100000)legacyDraft=JSON.parse(legacy);}catch{/* 已损坏的旧单键不阻断新稿。 */}
      if(legacyDraft&&!storage.getItem(prefix+'legacy'))storage.setItem(prefix+'legacy',JSON.stringify({draft:legacyDraft,updatedAt:0}));
      storage.setItem(ownKey,JSON.stringify({draft:value,updatedAt:Date.now()}));written.$writer=writer;
    }
    storage.setItem(base+id+(group==='drafts'?':draft':':editor'),json);written[key]=json;
  }
  const {drafts,editors,...view}=memory;storage.setItem(base+'view',JSON.stringify(view));
}
