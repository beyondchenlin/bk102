// npm run build 后运行：真实插件入口＋Cordis生命周期；传输注册表为隔离替身，不证明网络鉴权。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import {CopyEditService} from '../lib/index.js';

test('构建后的实际插件注册草案入口并随生命周期撤销，准备/提交/重开闭环',async()=>{
  const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'draft-entry-')),previous=process.env.DSH_HOME;
  process.env.DSH_HOME=root;let ctx,service;const routes=new Map();
  async function open(){
    ctx=new Context();ctx.provide('connection',{fetch:{register(route){assert(!routes.has(route.path));routes.set(route.path,route);return ()=>routes.delete(route.path);}}});
    const fiber=ctx.plugin(CopyEditService);await fiber.await();service=ctx.get('copyEdit');await service.ready;
    assert.equal(service.store.root,path.join(root,'copy-edit'));
  }
  async function call(route,value){
    const entry=routes.get('/api/copy-edit/draft/'+route);assert(entry,'正式入口必须注册');
    const response=await entry.fetch(new Request('http://isolated'+entry.path,value?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:undefined));
    const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.ok,true);return body.value;
  }
  try{
    await open();const caps=await call('capabilities');assert(caps.features.includes('draft.atomic.v1'));assert(caps.features.includes('source.mapping.v1'));
    assert.equal(routes.get('/api/copy-edit/draft/map-source').requestBody,'streaming');
    const missing=await routes.get('/api/copy-edit/draft/map-source').fetch(new Request('http://isolated/api/copy-edit/draft/map-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:caps.workspaceId,assetId:'missing',sha256:'0'.repeat(64),bytes:1,startUs:0,endUs:1000000,frames:30})}));
    assert.equal(missing.status,409);assert.equal((await missing.json()).error.code,'ASSET_NOT_READY');
    const plan={schemaVersion:1,draftId:'entry-check',revision:1,requiredCapabilities:['gaps.persist.v1'],canvas:caps.canvas,text:'未匹配句子完整保留',assets:[],clips:[],stickers:[],voices:[],music:[],warnings:[],gaps:[{gapId:'missing',startFrame:0,frames:900,text:'未匹配句子完整保留',reason:'隔离无素材样例'}]};
    const ticket=await call('prepare',{workspaceId:caps.workspaceId,operationId:randomUUID(),plan});
    const commit={workspaceId:ticket.workspaceId,operationId:ticket.operationId,ticketId:ticket.ticketId,planHash:ticket.planHash};
    const receipt=await call('commit',commit);assert.equal((await service.workspace()).projects.length,2);
    await ctx.fiber.dispose();assert.equal(routes.size,0);await open();
    assert.deepEqual(await call('commit',commit),receipt);assert.equal(service.store.project(receipt.projectId).text,plan.text);
    await assert.rejects(service.nativePlan(receipt.projectId,1,'export'),/待补素材/);
    assert.equal(routes.get('/api/copy-edit/draft/prepare').requestBody,'streaming');
  }finally{
    try{await ctx?.fiber.dispose();}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;}
    const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved).toLowerCase(),base.toLowerCase());
    const entries=await fs.readdir(root,{recursive:true,withFileTypes:true});assert(!entries.some(e=>e.isSymbolicLink()));await fs.rm(root,{recursive:true});
  }
});
