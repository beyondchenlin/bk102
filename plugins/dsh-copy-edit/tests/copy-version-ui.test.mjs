import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {emptyPanelMemory,normalizePanelMemory,panelDraftCopies,writePersistentPanelMemory,forkPanelRecovery} from '../src/client-memory.mjs';
import {copySummary} from '../src/copy-label.mjs';

// 执行实际组件产生的事件处理器与持久化effect；仅替代DOM绘制和React调度，不复制切换逻辑。
const source=fs.readFileSync(new URL('../src/client.cjs',import.meta.url),'utf8');
const component=source.slice(source.indexOf('function CopyPage('),source.indexOf('\nfunction CopyWorkspace('));
function fixture(){
 const data=new Map(),storage={get length(){return data.size;},key:n=>[...data.keys()][n]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const memory={...emptyPanelMemory(),scope:'review-library'},written={},drafts={current:memory.drafts};
 const p={projectId:'review-project',title:'历史标题',text:'已保存第二版。',versions:[{version:1,title:'旧标题',text:'已保存第一版。'},{version:2,title:'历史标题',text:'已保存第二版。'}],audio:{}};
 const state=[],effects=[],refs=[],deps=[];let cursor=0,refCursor=0,effectCursor=0,pending=[],changed=false,tree,blocked=false;
 const h=(tag,props,...children)=>({tag,props:props||{},children:children.flat(Infinity)}),placeholder=()=>null;
 const context={h,copySummary,normalizePanelMemory,panelDraftCopies,window:{localStorage:storage,addEventListener:placeholder,removeEventListener:placeholder},matchMedia:()=>({matches:false}),usePanelLayer:placeholder,useCopyTextHeight:()=>null,projectStickers:()=>[],stickerDefaults:{text:'',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true},stickerCanvas:()=>({toDataURL:()=>''}),CopyAction:placeholder,CopyVoice:placeholder,CopyMusic:placeholder,CopyComposition:placeholder,icon:placeholder,row:(...children)=>h('div',{},...children),button:(label,onClick,props={})=>h('button',{onClick,...props},label),action:()=>h('button',{}),
  useState(initial){const n=cursor++;if(!(n in state))state[n]=typeof initial==='function'?initial():initial;return [state[n],next=>{const value=typeof next==='function'?next(state[n]):next;if(!Object.is(state[n],value)){state[n]=value;changed=true;}}];},
  useRef(initial){const n=refCursor++;return refs[n]||(refs[n]={current:initial});},
  useEffect(fn,next){const n=effectCursor++;if(!deps[n]||next.some((v,i)=>!Object.is(v,deps[n][i]))){deps[n]=next;pending.push(()=>{effects[n]?.();effects[n]=fn();});}}
 };
 context.React={Fragment:'fragment'};
 const CopyPage=vm.runInNewContext(component+';CopyPage',context);
 const props={p,assets:[],workspace:{workspaceId:memory.scope,assets:[],projects:[p],results:[],capabilities:{}},drafts,notice:placeholder,onDraftText:placeholder,persist:()=>{if(blocked)return false;writePersistentPanelMemory(storage,memory,written);return true;},forkRecovery:()=>forkPanelRecovery(written)};
 function flush(){for(let i=0;i<15;i++){changed=false;cursor=refCursor=effectCursor=0;pending=[];tree=CopyPage(props);for(const effect of pending)effect();if(!changed)return;}throw Error('render loop');}
 const find=(node,predicate)=>{if(!node||typeof node!=='object')return;return predicate(node)?node:node.children?.map(c=>find(c,predicate)).find(Boolean);};
 flush();
 return {p,storage,memory,props,block:()=>blocked=true,text:()=>find(tree,n=>n.props.className==='copy-text').props.value,selected:()=>find(tree,n=>n.props.className==='dce-copy-version').props.value,status:()=>find(tree,n=>n.props.className==='dce-mobile-copy-meta')?.children[0]??'',type:text=>{find(tree,n=>n.props.className==='copy-text').props.onChange({target:{value:text}});flush();},select:value=>{find(tree,n=>n.props.className==='dce-copy-version').props.onChange({target:{value}});flush();},copies:()=>panelDraftCopies(storage,memory.scope,p.projectId)};
}

test('选择已保存版本后，当前未保存正文仍可恢复',()=>{
 const app=fixture();app.type('未保存的独立首句。还没保存的后半段。');
 app.select('1');assert.equal(app.text(),'已保存第一版。');
 assert(app.copies().some(c=>c.draft.text==='未保存的独立首句。还没保存的后半段。'),'切换版本覆盖了当前编辑者的唯一恢复副本');
});
test('当前草稿保护失败时不切换版本',()=>{
 const app=fixture();app.type('浏览器配额不足前的正文。');app.block();app.select('1');assert.equal(app.text(),'浏览器配额不足前的正文。');
});
test('草稿恢复与版本切换往返保留两份正文及旧标题元数据',()=>{
 const app=fixture();app.type('未保存稿A。');app.select('1');
 const a=app.copies().find(c=>c.draft.text==='未保存稿A。');assert(a);
 app.type('未保存稿B。');app.select('recover:'+a.key);
 assert.equal(app.text(),'未保存稿A。');assert(app.copies().some(c=>c.draft.text==='未保存稿B。'));
 assert.equal(app.p.title,'历史标题');assert.equal(app.p.text,'已保存第二版。');
});
test('修改后显示草稿，允许重新选择原版本；旧版本不会误报未保存',()=>{
 const app=fixture();assert.equal(app.selected(),'2');app.type('最新版本上的修改。');assert.equal(app.selected(),'draft');assert.equal(app.status(),'未保存');
 app.select('2');assert.equal(app.selected(),'2');assert.equal(app.text(),'已保存第二版。');assert(app.copies().some(c=>c.draft.text==='最新版本上的修改。'));
 app.select('1');assert.equal(app.selected(),'1');assert.equal(app.status(),'');
});
test('反复查看已保存版本不会按点击次数耗尽恢复副本额度',()=>{
 const app=fixture();for(let n=0;n<120;n++)app.select(String(n%2+1));
 assert.equal(app.text(),'已保存第二版。');assert(app.storage.length<=4,'没有修改却为每次查看增加了独占副本');
});
