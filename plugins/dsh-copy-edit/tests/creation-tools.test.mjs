import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Context,Service} from '@deepseek-ai/cordis';
import {ToolRuntime} from '@deepseek-ai/dsh-tools';
import {SystemPrompt} from '@deepseek-ai/dsh-system-prompt';
import * as plugin from '../lib/index.js';

test('真实 Cordis ToolRuntime 注册意图工具、调用并随插件撤销',async()=>{
 const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-desktop/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'creation-tools-'));
 const previous=process.env.DSH_HOME;process.env.DSH_HOME=root;
 class TestConnection extends Service{constructor(ctx){super(ctx,'connection');this.fetch={register:()=>async()=>{}};}}
 const ctx=new Context();
 try{
  await ctx.plugin(TestConnection).await();await ctx.plugin(SystemPrompt,{}).await();await ctx.plugin(ToolRuntime,{mode:'native'}).await();
  const fiber=ctx.plugin(plugin);await fiber.await();
  const call=async(name,args,id)=>{const value=await ctx.tools.execute({callId:id,name,arguments:args,signal:new AbortController().signal});assert.equal(value.isError,false,JSON.stringify(value));return JSON.parse(value.value.result);};
  const saved=await call('copy_edit_confirm',{intent:'copy',text:'只保存这份文案。'},'copy-only');assert.equal(saved.job,null);
  const generated=await call('copy_edit_confirm',{intent:'video',text:'只保存这份文案。',projectId:saved.sourceProjectId,expectedRevision:saved.revision},'video-intent');assert.equal(generated.job.status,'needs_input');
  assert.equal((await call('copy_edit_task',{jobId:generated.job.jobId,action:'status'},'task-status')).status,'needs_input');
  const context=await call('copy_edit_context',{},'context');assert.equal(context.jobs.length,1);assert.equal(context.projects.length,2);
  await fiber.dispose();for(const name of ['copy_edit_context','copy_edit_confirm','copy_edit_task','copy_edit_describe'])assert.equal(ctx.tools.get(name),undefined);
 }finally{await ctx.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;await fs.rm(root,{recursive:true,force:true});}
});
