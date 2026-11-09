import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Context,Service} from '@deepseek-ai/cordis';
import {ToolRuntime} from '@deepseek-ai/dsh-tools';
import * as plugin from '../lib/index.js';
const base=path.resolve(import.meta.dirname,'../../../build/copy-edit-spike');
process.env.DSH_HOME=path.join(base,'tool-home');
class TestConnection extends Service {
  constructor(ctx){super(ctx,'connection');this.fetch={register:()=>async()=>{}};}
}
const {SystemPrompt}=await import(pathToFileURL(path.join(base,'runtime/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js')));
const ctx=new Context();await ctx.plugin(TestConnection).await();await ctx.plugin(SystemPrompt,{}).await();await ctx.plugin(ToolRuntime,{mode:'native'}).await();
const records=[];
try {
  for(let i=0;i<2;i++){
    const fiber=ctx.plugin(plugin);await fiber.await();
    assert(ctx.tools.get('copy_edit_describe'));
    const answer=await ctx.tools.execute({callId:'copy-edit-'+i,name:'copy_edit_describe',arguments:{projectId:'copy-edit-workspace'},signal:new AbortController().signal});
    assert(!answer.isError,JSON.stringify(answer));
    const view=await ctx.get('copyEdit').describe('copy-edit-workspace');
    assert.deepEqual(answer.value,view);records.push({iteration:i,answer});
    await fiber.dispose();assert.equal(ctx.tools.get('copy_edit_describe'),undefined);assert.equal(ctx.get('copyEdit'),undefined);
  }
  fs.writeFileSync(path.join(base,'tool-report.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records));
} finally {await ctx.fiber.dispose();}
