// 分类是文案库元数据，不进入工程修订、剪辑撤销或媒体计划。
import {digest} from './project.mjs';
const presets=[['product','产品介绍'],['knowledge','知识分享'],['life','生活记录'],['mood','情绪表达'],['campaign','活动推广']];
export function defaultLibrary(){return {revision:0,categories:Object.fromEntries(['copy','edit'].map(kind=>[kind,presets.map(([id,name])=>({categoryId:'preset-'+id,name}))])),assignments:{copy:{},edit:{}}};}
export function libraryView(state){return structuredClone(state.library??defaultLibrary());}
function kindCheck(kind){if(!['copy','edit'].includes(kind))throw Error('分类区域无效');}
function nameValue(value){if(typeof value!=='string')throw Error('请输入分类名称');const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(!name||name.length>24||/[\x00-\x1f\x7f]/.test(name))throw Error('分类名称需为 1–24 个字符');if(['全部','未分类'].includes(name))throw Error('请使用其他分类名称');return name;}
function uniqueName(list,name,except){if(list.some(c=>c.categoryId!==except&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('这个分类名称已存在');}
export function assignCategory(state,kind,projectId,categoryId){
  kindCheck(kind);if(!state.projects.some(p=>p.projectId===projectId))throw Error('工程不存在');
  const library=state.library??=defaultLibrary();if(categoryId!==null&&!library.categories[kind].some(c=>c.categoryId===categoryId))throw Error('分类不存在，请重新选择');
  if(categoryId===null)delete library.assignments[kind][projectId];else library.assignments[kind][projectId]=categoryId;
}
export function changeLibrary(state,request){
  if(!request||typeof request.operationId!=='string'||!/^[-\w]{8,80}$/.test(request.operationId))throw Error('操作标识无效');
  const hash=digest({namespace:'copy-edit-library',request}),old=state.operations.find(o=>o.id===request.operationId);
  if(old){if(old.hash!==hash)throw Error('操作标识已用于其他请求');return old.answer;}
  const library=state.library??=defaultLibrary();if(request.expectedRevision!==library.revision)throw Error('分类已更新，请刷新后重试');
  const c=request.command;if(!c||typeof c!=='object')throw Error('分类操作无效');kindCheck(c.kind);const list=library.categories[c.kind];
  switch(c.type){
    case 'createCategory': {if(list.length>=40)throw Error('每个区域最多 40 个分类');const name=nameValue(c.name);uniqueName(list,name);const categoryId='category-'+digest({operationId:request.operationId}).slice(0,32);if(list.some(x=>x.categoryId===categoryId))throw Error('新建分类请求已处理，请刷新');list.push({categoryId,name});break;}
    case 'renameCategory': {const item=list.find(x=>x.categoryId===c.categoryId);if(!item)throw Error('分类不存在，请刷新');const name=nameValue(c.name);uniqueName(list,name,c.categoryId);item.name=name;break;}
    case 'deleteCategory': {const index=list.findIndex(x=>x.categoryId===c.categoryId);if(index<0)throw Error('分类不存在，请刷新');list.splice(index,1);for(const [projectId,id]of Object.entries(library.assignments[c.kind]))if(id===c.categoryId)delete library.assignments[c.kind][projectId];break;}
    case 'assignCategory': assignCategory(state,c.kind,c.projectId,c.categoryId);break;
    case 'assignCategories': {
      const ids=c.projectIds;
      if(!Array.isArray(ids)||ids.length<1||ids.length>100||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('请选择 1–100 个不同的作品');
      if(ids.some(id=>!state.projects.some(p=>p.projectId===id)))throw Error('部分作品不存在，请刷新后重新选择');
      if(c.categoryId!==null&&!list.some(x=>x.categoryId===c.categoryId))throw Error('分类不存在，请重新选择');
      for(const id of ids)assignCategory(state,c.kind,id,c.categoryId);
      break;
    }
    default:throw Error('不支持的分类操作');
  }
  library.revision++;const answer=structuredClone(library);state.operations.push({id:request.operationId,hash,answer});if(state.operations.length>100)state.operations.shift();return answer;
}
