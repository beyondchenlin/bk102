import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../../..'),base=path.join(root,'build/copy-edit-spike');
const {origin,cookie}=JSON.parse(await fs.readFile(path.join(base,'browser-auth.json')));
const rpc=async(method,args={})=>{
  const response=await fetch(origin+'/api/'+method,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}})});
  return response.status===200?(await response.json()).result:{ok:false,status:response.status};
};
const report={};const view=await rpc('copyEdit/workspace');assert(view.ok,JSON.stringify(view));
const p=view.value.projects.find(p=>p.projectId==='copy-edit-workspace');assert.equal(p.versions.length,2);assert.equal(p.clips.length,2);assert.equal(view.value.capabilities.androidNative,false);
report.reopened={revision:p.revision,versions:p.versions.length,clips:p.clips.length,results:view.value.results.length};
const result=view.value.results.find(r=>r.profile==='export'&&r.projectId===p.projectId);assert(result);
for(const route of ['upload','frame','media']) {
  const response=await fetch(origin+'/api/copy-edit/'+route,{method:route==='upload'?'POST':'GET'});assert([401,403].includes(response.status));report['unauth-'+route]=response.status;
}
const cross=await fetch(origin+'/api/copy-edit/media?jobId='+result.jobId,{headers:{Cookie:cookie,Origin:'http://attacker.invalid'}});assert.equal(cross.status,403);report.crossOrigin=403;
const partial=await fetch(origin+result.url,{headers:{Cookie:cookie,Origin:origin,Range:'bytes=10-109'}});assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,100);report.range=206;
const invalid=await fetch(origin+result.url,{headers:{Cookie:cookie,Range:'bytes=999999999-'}});assert.equal(invalid.status,416);report.invalidRange=416;
const conflict=await rpc('copyEdit/mutate',{request:{projectId:p.projectId,expectedRevision:1,operationId:randomUUID(),command:{type:'saveCopy',title:'不可提交',text:'旧版本'}}});assert.equal(conflict.ok,false);report.conflict='PASS';
for(const enabled of [false,true,false,true]) {
  const change=await rpc('pluginManager/setPluginEnabled',{id:'include:dsh-copy-edit',enabled});assert(change.ok);
  let reply;
  for(let i=0;i<80;i++){reply=await rpc('copyEdit/workspace');if(enabled?reply.ok:reply.status===404)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(reply.ok,enabled,JSON.stringify(reply));
  if(enabled)assert.equal(reply.value.projects.find(x=>x.projectId===p.projectId).revision,p.revision);
}
report.lifecycle='PASS';report.status='PASS';
await fs.writeFile(path.join(root,'build/copy-edit-desktop/host-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
