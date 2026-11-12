import {randomUUID} from 'node:crypto';
import {digest,newProject,editProject} from './project.mjs';
import {assignCategory,libraryView} from './categories.mjs';

const validId=v=>typeof v==='string'&&/^[-\w]{1,80}$/.test(v);
// 与素材库 sentence_plan.py 保持相同边界，连空白与引号一起保存。
export function creationSentences(text){
 if([...text].length>6000)throw Error('自动选片目前支持 6000 字以内的文案，原文已保存');
 const parts=[];let start=0;
 for(const match of text.matchAll(/[。！？!?；;]+[”’」』"')）】]*|\r?\n+|\.(?=\s|$)/gu)){
  const end=match.index+match[0].length,value=text.slice(start,end);if(value.trim()){parts.push(value);start=end;}
 }
 if(start<text.length){const tail=text.slice(start);if(tail.trim()||!parts.length)parts.push(tail);else parts[parts.length-1]+=tail;}
 if(!parts.length||parts.length>32||parts.some(p=>[...p.trim()].length>200))throw Error('自动选片支持最多 32 句、每句 200 字，请先缩短文案');
 return parts;
}
const labels={queued:'等待生成',running:'正在准备视频',paused:'已暂停',needs_input:'需要补充设置',failed:'生成未完成',complete:'草稿已生成'};

/** 所有意图、文案版本和执行步骤持久保存；凭据始终在独立连接配置中。 */
export class CreationJobs {
  constructor(store){this.store=store;}
  public(j){return {jobId:j.jobId,sourceProjectId:j.sourceProjectId,copyVersion:j.copyVersion,status:j.status,message:j.message||labels[j.status],projectId:j.projectId||null,question:j.question||null,warnings:j.warnings||[],openUrl:'#bk-creation='+j.jobId};}
  row(id,state=this.store.state){const j=(state.creationJobs||[]).find(j=>j.jobId===id);if(!j)throw Error('生成任务不存在');return j;}
  list(){return (this.store.state.creationJobs||[]).map(j=>this.public(j));}
  async confirm(request){
  const {operationId,intent,text,projectId,expectedRevision,categoryId,variant=false,options={}}=request;
    if(!validId(operationId)||!['copy','video'].includes(intent)||typeof text!=='string'||!text.trim()||text.length>20000)throw Error('请明确文案和本次任务是修改文案还是制作视频');
    const hash=digest(request);
    return this.store.write(s=>{
      s.creationIntents??=[];s.creationJobs??=[];
      const old=s.creationIntents.find(x=>x.operationId===operationId);
   if(old){if(old.hash!==hash)throw Error('该确认请求已经用于其他内容');return {...old.answer,job:old.answer.job?this.public(this.row(old.answer.job.jobId,s)):null};}
      if(s.creationIntents.length>=500)throw Error('当前创作记录已满，请先整理工作区');
      // 未指定旧文案时，同一正文复用同一份新文案，避免丢回复后再次确认生成重复项。
      const pid=projectId||'copy-'+digest(text).slice(0,32);let p=s.projects.find(x=>x.projectId===pid);
      if(projectId&&(!p||p.revision!==expectedRevision))throw Error('文案已变化，请读取当前版本再保存');
      if(!p){if(s.projects.length>=100)throw Error('文案库已满');p=newProject(pid,text.trim().slice(0,120));s.projects.push(p);}
   if(p.text!==text||!p.versions.length){const next=editProject(p,{type:'saveCopy',text,title:projectId?p.title:text.trim().slice(0,120)},s.assets);Object.assign(p,next);}
      if(categoryId!==undefined&&!libraryView(s).assignments.copy[pid]){assignCategory(s,'copy',pid,categoryId);s.library.revision++;}
      const copyVersion=p.versions.at(-1).version;
      let job=null;
      if(intent==='video'){
        const key=digest({pid,copyVersion,variant:variant?operationId:null});
        job=s.creationJobs.find(j=>j.key===key);
        if(!job){
          if(s.creationJobs.length>=100)throw Error('生成任务已满');
      job={jobId:randomUUID(),key,sourceProjectId:pid,copyVersion,text,options,status:'queued',steps:{},createdAt:new Date().toISOString(),generation:0};
          s.creationJobs.push(job);
        }
      }
      const answer={saved:true,sourceProjectId:pid,revision:p.revision,copyVersion,job:job?this.public(job):null};
      s.creationIntents.push({operationId,hash,answer});return answer;
    });
  }
  async claim(jobId){return this.store.write(s=>{
    const j=this.row(jobId,s),now=Date.now();
    if(j.status==='running'&&j.lease?.until>now)return null;
    if(!['queued','running'].includes(j.status))return null;
    j.status='running';j.generation++;j.lease={id:randomUUID(),until:now+45000};
    return structuredClone(j);
  });}
  checked(s,jobId,leaseId){const j=this.row(jobId,s);if(j.status!=='running'||j.lease?.id!==leaseId||j.lease.until<Date.now())throw Error('生成执行已失效');return j;}
  async update(jobId,leaseId,fn){return this.store.write(s=>{const j=this.checked(s,jobId,leaseId);const answer=fn(j,s);j.lease.until=Date.now()+45000;return answer??this.public(j);});}
  async heartbeat(jobId,leaseId){return this.update(jobId,leaseId,()=>{});}
  async checkpoint(jobId,leaseId,key,value){
  if(!/^asset:(video:[-\w]{1,80}|voice:\d{1,2}|sticker:\d{1,2})$/.test(key))throw Error('生成步骤无效');
    return this.update(jobId,leaseId,(j,s)=>{
    const a=s.assets.find(a=>a.assetId===value);if(!a)throw Error('媒体尚未登记');
    const [,kind,index]=key.split(':');if(a.kind!==({video:'video',voice:'audio',sticker:'image'})[kind])throw Error('媒体类型不匹配');
    if(kind==='video'){const source=j.manifest?.assets.find(x=>x.asset_id===index);if(!source||a.sha256!==source.sha256||a.bytes!==source.bytes)throw Error('原素材身份不匹配');}
    if(kind==='voice'){const source=j.steps['speech:'+index];if(!source||source.sha256!==a.sha256||source.bytes!==a.bytes)throw Error('配音身份不匹配');}
    if(kind==='sticker'&&(!Number.isInteger(Number(index))||Number(index)>=j.sentences.length))throw Error('贴片句子无效');
      const old=j.steps[key];if(old&&old!==value)throw Error('已完成步骤不可替换');j.steps[key]=value;
    });
  }
 finish(j,s,r){
    j.status='complete';j.projectId=r.projectId;j.warnings=r.warnings;j.message=r.gaps.length?'草稿已生成，仍有画面待补':r.warnings.length?'草稿已生成，'+r.warnings.length+' 处画面需核对':'草稿已生成';
    const p=s.projects.find(p=>p.projectId===r.projectId);p.creationSource={projectId:j.sourceProjectId,copyVersion:j.copyVersion,jobId:j.jobId};
  const lib=libraryView(s),sourceCategory=lib.categories.copy.find(c=>c.categoryId===lib.assignments.copy[j.sourceProjectId]);
  const category=sourceCategory&&lib.categories.edit.find(c=>c.categoryId===sourceCategory.categoryId||c.name===sourceCategory.name);
  if(category){assignCategory(s,'edit',p.projectId,category.categoryId);s.library.revision++;}
  j.lease=null;
 }
  async control(jobId,action){
    if(!['pause','resume'].includes(action))throw Error('不支持的生成操作');
    return this.store.write(s=>{const j=this.row(jobId,s);if(j.status==='complete')return this.public(j);
      if(action==='resume'&&j.status==='running'&&j.lease?.until>Date.now())return this.public(j);
      j.status=action==='pause'?'paused':'queued';j.message='';j.question=null;j.lease=null;return this.public(j);
    });
  }
  async fail(jobId,leaseId,message,question=null){return this.update(jobId,leaseId,j=>{j.status=question?'needs_input':'failed';j.message=String(message).slice(0,200);j.question=question;});}
}
