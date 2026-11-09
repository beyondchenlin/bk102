import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';import {compilePlan} from '../src/project.mjs';
async function withStore(run){const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'categories-'));let store;try{store=await new ProjectStore(dir).init();await run(store,dir);}finally{if(store)await store.close();await fs.rm(dir,{recursive:true,force:true});}}
const request=(s,command)=>({expectedRevision:s.view().library.revision,operationId:randomUUID(),command});
test('旧库读取预置分类不改工程和磁盘，空分类列表重开不会重新预置',()=>withStore(async(s,dir)=>{
 await s.write(()=>{});const before=await fs.readFile(path.join(dir,'state.json'));assert.equal(s.view().library.categories.copy.length,5);assert.equal(s.view().library.categories.edit.length,5);assert.deepEqual(await fs.readFile(path.join(dir,'state.json')),before);
 for(const c of [...s.view().library.categories.copy])await s.library(request(s,{type:'deleteCategory',kind:'copy',categoryId:c.categoryId}));await s.close();s.closed=false;await s.init();assert.equal(s.view().library.categories.copy.length,0);assert.equal(s.view().library.categories.edit.length,5);
}));
test('两个区域独立归类，重命名维持关联，删分类仅清除该区域归类',()=>withStore(async s=>{
 const p=s.view().projects[0],original=structuredClone(p);await s.library(request(s,{type:'assignCategory',kind:'copy',projectId:p.projectId,categoryId:'preset-life'}));await s.library(request(s,{type:'assignCategory',kind:'edit',projectId:p.projectId,categoryId:'preset-product'}));await s.library(request(s,{type:'renameCategory',kind:'copy',categoryId:'preset-life',name:'公司案例'}));assert.equal(s.view().library.assignments.copy[p.projectId],'preset-life');await s.library(request(s,{type:'deleteCategory',kind:'copy',categoryId:'preset-life'}));assert.equal(s.view().library.assignments.copy[p.projectId],undefined);assert.equal(s.view().library.assignments.edit[p.projectId],'preset-product');assert.deepEqual(s.project(p.projectId),original);
}));
test('拒绝重复名称、保留名称、无效区域与引用，冲突及失败不写磁盘',()=>withStore(async(s,dir)=>{
 await s.write(()=>{});const before=await fs.readFile(path.join(dir,'state.json'));for(const command of [{type:'createCategory',kind:'copy',name:'  生活记录  '},{type:'createCategory',kind:'copy',name:'全部'},{type:'createCategory',kind:'copy',name:'x'.repeat(25)},{type:'createCategory',kind:'__proto__',name:'分类'},{type:'assignCategory',kind:'copy',projectId:'missing',categoryId:null},{type:'assignCategory',kind:'copy',projectId:s.view().projects[0].projectId,categoryId:'missing'}])await assert.rejects(s.library(request(s,command)));assert.deepEqual(await fs.readFile(path.join(dir,'state.json')),before);
 const first=request(s,{type:'createCategory',kind:'copy',name:'自建分类'}),answer=await s.library(first);assert.deepEqual(await s.library(first),answer);await assert.rejects(s.library({...first,command:{...first.command,name:'不同请求'}}),/操作标识/);await assert.rejects(s.library({...request(s,{type:'createCategory',kind:'edit',name:'自建分类'}),expectedRevision:0}),/已更新/);
}));
test('新建作品与归类原子提交，失效分类不会遗留半成品',()=>withStore(async s=>{
 const before=s.view(),p=await s.create({title:'产品案例',operationId:randomUUID(),category:{kind:'copy',categoryId:'preset-product'}});assert.equal(s.view().library.assignments.copy[p.projectId],'preset-product');assert.equal(s.view().library.assignments.edit[p.projectId],undefined);assert.equal(p.revision,1);
 const count=s.view().projects.length;await assert.rejects(s.create({title:'无效分类',operationId:randomUUID(),category:{kind:'copy',categoryId:'missing'}}));assert.equal(s.view().projects.length,count);assert.deepEqual(s.project(before.projects[0].projectId),before.projects[0]);
}));
test('分类不使预览计划失效，不影响剪辑撤销；归类重开持久化',()=>withStore(async(s,dir)=>{
 await s.write(state=>state.assets.push({assetId:'v',kind:'video',sha256:'a'.repeat(64),ptsUs:[0,33333,66667],endUs:100000}));let p=s.view().projects[0];const edit=async command=>p=await s.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command});await edit({type:'addClip',assetId:'v'});const before=s.view(),plan=compilePlan(p,before.assets);await s.library(request(s,{type:'assignCategory',kind:'edit',projectId:p.projectId,categoryId:'preset-mood'}));assert.equal(compilePlan(s.project(p.projectId),s.view().assets).planHash,plan.planHash);assert.deepEqual(s.view().history,before.history);await edit({type:'undo'});assert.equal(p.clips.length,0);assert.equal(s.view().library.assignments.edit[p.projectId],'preset-mood');await edit({type:'redo'});assert.equal(p.clips.length,1);await s.close();s.closed=false;await s.init();assert.equal(s.view().library.assignments.edit[p.projectId],'preset-mood');
}));

test('批量归类一次提交、两区独立、重放不重复写入，可批量移回未分类',()=>withStore(async s=>{
 const a=s.view().projects[0],b=await s.create({title:'第二份',operationId:randomUUID()}),c=await s.create({title:'不选中',operationId:randomUUID()}),ids=[a.projectId,b.projectId];
 const command={type:'assignCategories',kind:'copy',projectIds:ids,categoryId:'preset-life'},req=request(s,command),answer=await s.library(req);assert.equal(answer.revision,req.expectedRevision+1);assert.deepEqual(await s.library(req),answer);assert.equal(s.view().library.revision,answer.revision);
 for(const id of ids)assert.equal(s.view().library.assignments.copy[id],'preset-life');assert.equal(s.view().library.assignments.copy[c.projectId],undefined);
 await s.library(request(s,{...command,kind:'edit',categoryId:'preset-product'}));await s.library(request(s,{...command,categoryId:null}));for(const id of ids){assert.equal(s.view().library.assignments.copy[id],undefined);assert.equal(s.view().library.assignments.edit[id],'preset-product');}
}));

test('批量归类拒绝空集合、重复、超量、失效作品和分类，旧修订不覆盖其他写入',()=>withStore(async(s,dir)=>{
 const a=s.view().projects[0],b=await s.create({title:'第二份',operationId:randomUUID()}),base={type:'assignCategories',kind:'copy',projectIds:[a.projectId,b.projectId],categoryId:'preset-life'},before=await fs.readFile(path.join(dir,'state.json'));
 for(const delta of [{projectIds:[]},{projectIds:null},{projectIds:[a.projectId,a.projectId]},{projectIds:[a.projectId,'missing']},{projectIds:[a.projectId,7]},{projectIds:Array.from({length:101},(_,i)=>'id'+i)},{categoryId:'missing'},{categoryId:undefined},{kind:'missing'}]){await assert.rejects(s.library(request(s,{...base,...delta})));assert.deepEqual(await fs.readFile(path.join(dir,'state.json')),before);}
 const first=request(s,base),second=request(s,{...base,categoryId:'preset-product'}),result=await Promise.allSettled([s.library(first),s.library(second)]);assert.equal(result[0].status,'fulfilled');assert.equal(result[1].status,'rejected');for(const id of base.projectIds)assert.equal(s.view().library.assignments.copy[id],'preset-life');assert.equal(s.view().library.revision,first.expectedRevision+1);
 await assert.rejects(s.library({...first,command:{...base,categoryId:null}}),/操作标识/);
}));

test('批量分类不改工程、剪辑历史、媒体计划和结果，重开保留整个批次',()=>withStore(async(s,dir)=>{
 const b=await s.create({title:'第二份',operationId:randomUUID()});await s.write(state=>state.assets.push({assetId:'v',kind:'video',sha256:'a'.repeat(64),ptsUs:[0,33333,66667],endUs:100000}));
 for(const p of s.view().projects)await s.mutate({projectId:p.projectId,expectedRevision:p.revision,operationId:randomUUID(),command:{type:'addClip',assetId:'v'}});
 const before=s.view(),plans=before.projects.map(p=>compilePlan(p,before.assets).planHash),ids=before.projects.map(p=>p.projectId);
 await s.library(request(s,{type:'assignCategories',kind:'edit',projectIds:ids,categoryId:'preset-mood'}));assert.deepEqual(s.view().projects,before.projects);assert.deepEqual(s.view().history,before.history);assert.deepEqual(s.view().results,before.results);assert.deepEqual(s.view().projects.map(p=>compilePlan(p,s.view().assets).planHash),plans);
 await s.close();s.closed=false;await s.init();for(const id of ids)assert.equal(s.view().library.assignments.edit[id],'preset-mood');assert.deepEqual(s.view().projects,before.projects);
}));
