import fs from 'node:fs/promises';
import path from 'node:path';
import {id,digest,newProject,editProject,compilePlan} from './project.mjs';
import {libraryView,changeLibrary,assignCategory} from './categories.mjs';

const editKeys=['clips','sticker','stickers','audio','voiceClips','musicClips'];
const snapshot=p=>Object.fromEntries(editKeys.filter(k=>p[k]!==undefined).map(k=>[k,structuredClone(p[k])]));
function boundHistory(h){while(h.undo.length>30||h.redo.length>30||Buffer.byteLength(JSON.stringify(h))>2*1024*1024){if(h.undo.length)h.undo.shift();else if(h.redo.length)h.redo.shift();else break;}}

// 一个 DSH Host 持有一个写入者。关闭、失败均保留已提交状态。
export class ProjectStore {
  constructor(root) {this.root=root;this.chain=Promise.resolve();this.closed=false;}
  async init() {
    await fs.mkdir(this.root,{recursive:true});
    if((await fs.lstat(this.root)).isSymbolicLink())throw Error('插件数据目录不能是链接');
    this.lock=await fs.open(path.join(this.root,'writer.lock'),'wx').catch(()=>{throw Error('文案库已被其他进程占用，或上次异常退出的锁尚未核验');});
    await this.lock.writeFile(JSON.stringify({pid:process.pid,nonce:id()}));
    try {
      // 不改写旧 state.json；浏览器恢复必须绑定这份库，不能按端口或工程名猜测。
      const identityFile=path.join(this.root,'workspace-id');
      try{await fs.writeFile(identityFile,id(),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
      if((await fs.lstat(identityFile)).isSymbolicLink())throw Error('文案库身份不能是链接');
      this.workspaceId=await fs.readFile(identityFile,'utf8');
      if(!/^[a-f0-9-]{36}$/.test(this.workspaceId))throw Error('文案库身份无效');
      for(const dir of ['assets','jobs','incoming'])await fs.mkdir(path.join(this.root,dir),{recursive:true});
      try {this.state=JSON.parse(await fs.readFile(path.join(this.root,'state.json'),'utf8'));}
      catch(e) {if(e.code!=='ENOENT')throw e;this.state={format:1,projects:[newProject('copy-edit-workspace','留一点时间给自己')],assets:[],operations:[],results:[]};}
      if(this.state.format!==1||!Array.isArray(this.state.projects)||!Array.isArray(this.state.assets))throw Error('不支持的文案库格式');
      return this;
    } catch(e) {await this.close();throw e;}
  }
  project(projectId) {const p=this.state.projects.find(p=>p.projectId===projectId);if(!p)throw Error('工程不存在');return structuredClone(p);}
  view() {return structuredClone({workspaceId:this.workspaceId,library:libraryView(this.state),projects:this.state.projects,assets:this.state.assets,results:this.state.results,history:Object.fromEntries(Object.entries(this.state.history||{}).map(([id,h])=>[id,{canUndo:!!h.undo.length,canRedo:!!h.redo.length}]))});}
  library(request) {return this.write(s=>changeLibrary(s,request));}
  create(request) {
    if(!request||typeof request.operationId!=='string'||!/^[-\w]{8,80}$/.test(request.operationId))throw Error('操作标识无效');
    if(typeof request.title!=='string'||request.title.length>120)throw Error('标题不符合要求');
    return this.write(s=>{
      const hash=digest({type:'createProject',...request}),old=s.operations.find(o=>o.id===request.operationId);
      if(old){if(old.hash!==hash)throw Error('操作标识已用于其他请求');return old.answer;}
      if(s.projects.length>=100)throw Error('当前库最多支持 100 个工程');
      const projectId='project-'+digest({operationId:request.operationId}).slice(0,32);
      if(s.projects.some(p=>p.projectId===projectId))throw Error('新建请求已处理，请重新载入工程列表');
      const answer=newProject(projectId,request.title.trim()||'未命名文案');s.projects.push(answer);
      if(request.category!==undefined){const c=request.category;if(!c||typeof c!=='object')throw Error('新建分类参数无效');assignCategory(s,c.kind,projectId,c.categoryId);s.library.revision++;}
      s.operations.push({id:request.operationId,hash,answer});if(s.operations.length>100)s.operations.shift();return answer;
    });
  }
  async write(action) {
    const run=this.chain.then(async()=>{
      if(this.closed)throw Error('插件已关闭');
      const next=structuredClone(this.state),answer=await action(next);
      const temp=path.join(this.root,'incoming',id()+'.json');
      try {
        const f=await fs.open(temp,'wx');
        try {await f.writeFile(JSON.stringify(next));await f.sync();}finally{await f.close();}
        await fs.rename(temp,path.join(this.root,'state.json'));this.state=next;return structuredClone(answer);
      }
      finally {await fs.rm(temp,{force:true});}
    });
    this.chain=run.catch(()=>{});return run;
  }
  mutate(request) {
    if(!request||typeof request.operationId!=='string'||!/^[-\w]{8,80}$/.test(request.operationId))throw Error('操作标识无效');
    return this.write(s=>{
      const hash=digest(request),old=s.operations.find(o=>o.id===request.operationId);
      if(old) {if(old.hash!==hash)throw Error('操作标识已用于其他请求');return old.answer;}
      const index=s.projects.findIndex(p=>p.projectId===request.projectId);if(index<0)throw Error('工程不存在');
      const p=s.projects[index];if(p.revision!==request.expectedRevision)throw Error('工程已更新，请重新载入后再保存');
      let answer;
      if(['undo','redo'].includes(request.command.type)){
        const h=s.history?.[p.projectId],from=request.command.type,to=from==='undo'?'redo':'undo';if(!h?.[from].length)throw Error(from==='undo'?'没有可撤销的剪辑':'没有可重做的剪辑');
        const saved=h[from].pop();h[to].push(snapshot(p));answer=structuredClone(p);for(const k of editKeys)delete answer[k];Object.assign(answer,saved,{revision:p.revision+1,updatedAt:new Date().toISOString()});if(answer.clips.length)compilePlan(answer,s.assets);boundHistory(h);
      }else{
        answer=editProject(p,request.command,s.assets);
        if(request.command.type!=='saveCopy'&&digest(snapshot(answer))!==digest(snapshot(p))){s.history??={};const h=s.history[p.projectId]??={undo:[],redo:[]};h.undo.push(snapshot(p));h.redo=[];boundHistory(h);}
      }
      s.projects[index]=answer;
      s.operations.push({id:request.operationId,hash,answer});
      // 有界重放窗口；更早的旧请求仍被 expectedRevision 拒绝，不能重复变更。
      if(s.operations.length>100)s.operations.shift();return answer;
    });
  }
  async close() {
    this.closed=true;await this.chain;
    if(this.lock) {await this.lock.close();this.lock=null;await fs.unlink(path.join(this.root,'writer.lock'));}
  }
}
