import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-spike');
const {origin,cookie}=JSON.parse(fs.readFileSync(path.join(base,'browser-auth.json')));
async function rpc(method,args={}) {
  const response=await fetch(origin+'/api/'+method,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}})});
  if(response.status===404)return {ok:false,httpStatus:404};
  assert.equal(response.status,200);return (await response.json()).result;
}
const results=[];
for(const enabled of [false,true,false,true]) {
  const change=await rpc('pluginManager/setPluginEnabled',{id:'include:dsh-copy-edit',enabled});assert.equal(change.ok,true,JSON.stringify(change));
  let inventory;
  for(let i=0;i<100;i++) {
    inventory=await rpc('pluginInventory/list');
    const row=inventory.value?.entries.find(x=>x.moduleName==='dsh-copy-edit');
    if(row?.enabled===enabled && (enabled ? row.fiberPhase==='active' : row.fiberPhase!=='active'))break;
    await new Promise(r=>setTimeout(r,100));
  }
  const rows=inventory.value.entries.filter(x=>x.moduleName==='dsh-copy-edit');assert.equal(rows.length,1);assert.equal(rows[0].enabled,enabled);
  const query=await rpc('copyEdit/describe',{projectId:'copy-edit-example'});assert.equal(query.ok,enabled,JSON.stringify(query));
  results.push({enabled,phase:rows[0].fiberPhase,query});
}
fs.writeFileSync(path.join(base,'lifecycle-report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
