import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// 测试生成后的完整浏览器入口，不能只截取一个组件或只测试后端 ESM。
test('完整客户端入口能被模块加载器执行并注册工作台与侧栏',async()=>{
  const source=fs.readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
  const require=createRequire(import.meta.url),modules=[],registered=[],styles=[];
  const document={createElement:()=>({dataset:{},setAttribute(){},appendChild(){},replaceChildren(){},remove(){}}),head:{appendChild:style=>styles.push(style)},body:{appendChild(){}}};
  const context={document,location:{hash:''},AbortController,setInterval,clearInterval,crypto:globalThis.crypto,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},fetch:async()=>Response.json({result:{ok:true,value:{jobs:[]}}}),window:{addEventListener(){},removeEventListener(){},dispatchEvent(){},__ModuleLoader__:{load:entry=>modules.push(entry)}}};
  new vm.Script(source,{filename:'delivered-client.js'}).runInNewContext(context);
  assert.equal(modules.length,1);assert.equal(modules[0].id,'dsh-copy-edit');
  const plugin=modules[0].factory(require),cleanup=[];
  assert.deepEqual(Array.from(plugin.inject),['slots','layout']);
  plugin.apply({effect:fn=>cleanup.push(fn()),layout:{selectPanel(){}},slots:{
    inject:(_name,fn)=>fn(),register:(options,component)=>{registered.push({options,component});return()=>{};}
  }});
  assert.equal(styles.length,1);assert.equal(styles[0].dataset.plugin,'dsh-copy-edit');
  assert(registered.some(r=>r.options.name==='main'&&typeof r.component==='function'));
  assert(registered.some(r=>r.options.name==='sidebar.panellist'&&r.options.id==='dsh-copy-edit'));
  await new Promise(resolve=>setImmediate(resolve));cleanup.reverse().forEach(fn=>fn?.());
});

test('导入面板能绘制完整对话框且空输入不能发起导入',()=>{
  const source=fs.readFileSync(new URL('../src/selection-import.cjs',import.meta.url),'utf8');
  const h=(tag,props,...children)=>({tag,props:props||{},children});let closed=false;
  const SelectionImport=vm.runInNewContext(source+';SelectionImport',{
    h,useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect(){},usePanelLayer(){},
    button:(label,onClick,props)=>h('button',{onClick,...props},label)
  });
  const tree=SelectionImport({workspace:{workspaceId:'fixture'},onClose:()=>closed=true});
  assert.equal(tree.props.role,'dialog');assert.equal(tree.props['aria-label'],'导入素材库选片');
  const nodes=[];const walk=n=>{if(!n||typeof n!=='object')return;nodes.push(n);n.children.forEach(walk);};walk(tree);
  const submit=nodes.find(n=>n.tag==='button'&&n.children.includes('生成可编辑工程'));
  assert.equal(submit.props.disabled,true);
  nodes.find(n=>n.tag==='button'&&n.children.includes('关闭')).props.onClick();assert.equal(closed,true);
});
