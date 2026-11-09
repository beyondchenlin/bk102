import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/src/main/assets/builtin-plugins/dsh-web-mobile/lib/client.js','utf8');
const code=source.slice(source.indexOf('function createPanelBackExitTask('),source.indexOf('\n/**\n * Tapping the already-selected panel row'));
function harness({depth=0,generic=true,supported=true}={}){
  let open=true,exits=0,backs=0,index=0,pending=0;
  const listeners=new Map(),pushes=[],goes=[];
  const control={className:'_crumb',getAttribute:k=>k==='data-dsh-panel-back'&&generic?'true':k==='data-dsh-panel-depth'?String(depth):null};
  const context={window:{addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setTimeout:()=>1,clearTimeout:()=>{}},history:{pushState:s=>{pushes.push(s);index++;},go:n=>{goes.push(n);pending=n;}},panelViewOpen:()=>open};
  vm.createContext(context);vm.runInContext(code,context);
  const task=context.createPanelBackExitTask(()=>{exits++;open=false;},supported,()=>{backs++;depth--;},()=>depth?control:null);
  const flush=()=>{if(pending){index+=pending;pending=0;listeners.get('popstate')?.();}};
  return {task,control,pushes,goes,flush,get depth(){return depth;},set depth(n){depth=n;},get index(){return index;},get exits(){return exits;},get backs(){return backs;},close:()=>{open=false;},pop:()=>{index--;listeners.get('popstate')?.();}};
}
test('通用同一返回按钮的深度变化逐层预置，系统返回只走一层',()=>{
  const h=harness();h.task.ensure();assert.equal(h.index,1);
  h.depth=1;h.task.ensure();h.depth=2;h.task.ensure();h.depth=3;h.task.ensure();assert.equal(h.index,4);
  for(const expected of [2,1,0]){h.pop();h.task.ensure();assert.equal(h.depth,expected);assert.equal(h.exits,0);assert.equal(h.index,expected+1);}
  h.pop();h.task.ensure();assert.equal(h.exits,1);assert.equal(h.index,0);assert.equal(h.pushes.length,4);
});
test('直接恢复深层页面预置完整层级，UI直接回首页一次归还多余历史',()=>{
  const h=harness({depth:4});h.task.ensure();assert.equal(h.index,5);
  h.depth=0;h.task.ensure();assert.deepEqual(h.goes,[-4]);h.flush();assert.equal(h.index,1);assert.equal(h.exits,0);
  h.close();h.task.ensure();h.flush();assert.equal(h.index,0);assert.deepEqual(h.goes,[-4,-1]);
});
test('侧栏直接离开深层页回收全部当前面板记录，不留下幽灵返回',()=>{
  const h=harness({depth:3});h.task.ensure();h.close();h.task.ensure();h.flush();h.task.ensure();assert.equal(h.index,0);assert.deepEqual(h.goes,[-4]);assert.equal(h.exits,0);
});
test('旧插件管理页保持每次进入一条记录，宿主无选择能力不接管历史',()=>{
  const h=harness({depth:2,generic:false});h.task.ensure();assert.equal(h.index,2);h.pop();h.depth=0;h.task.ensure();assert.equal(h.index,1);
  const no=harness({depth:4,supported:false});no.task.ensure();assert.equal(no.index,0);
});
test('卸载归还深层历史且释放事件监听',()=>{const h=harness({depth:2});h.task.ensure();h.task.dispose();h.flush();assert.equal(h.index,0);assert.equal(h.backs,0);assert.deepEqual(h.goes,[-3]);});
