import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPanelMemory,readPanelMemory,writePanelMemory,navigatePanel,restorePanelMemory,readPersistentPanelMemory,writePersistentPanelMemory,panelRecoveryBaseline,panelDraftCopies,forkPanelRecovery,recoveryWriterId} from '../src/client-memory.mjs';
function localStore(){const data=new Map();return {get length(){return data.size;},key:n=>[...data.keys()][n]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('无randomUUID时仍用安全随机字节隔离草稿编辑者',()=>{
 const randomOnly={getRandomValues:bytes=>globalThis.crypto.getRandomValues(bytes)};
 const ids=new Set(Array.from({length:64},()=>recoveryWriterId(randomOnly)));assert.equal(ids.size,64);for(const id of ids)assert.match(id,/^[a-f0-9]{32}$/);
 const storage=localStore(),m={...emptyPanelMemory(),scope:'library',drafts:{a:{text:'旧内核草稿'}}};const original=Object.getOwnPropertyDescriptor(globalThis,'crypto'),randomBytes=globalThis.crypto.getRandomValues.bind(globalThis.crypto);
 try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:randomBytes}});writePersistentPanelMemory(storage,m,{});assert.equal(panelDraftCopies(storage,'library','a')[0].draft.text,'旧内核草稿');}finally{Object.defineProperty(globalThis,'crypto',original);}
});
test('来源返回保留明确工程，跨文案/剪辑往返不增长循环',()=>{
 let route={page:'home',projectId:null},trail=[];
 ({route,trail}=navigatePanel(route,trail,{page:'copy',projectId:'a'}));
 ({route,trail}=navigatePanel(route,trail,{page:'edit',projectId:'a'}));
 assert.deepEqual(trail,[{page:'home',projectId:null},{page:'copy',projectId:'a'}]);
 ({route,trail}=navigatePanel(route,trail,{page:'copy',projectId:'a'}));assert.equal(trail.length,1);
});
test('关闭标签后从持久分键恢复草稿/版本/位置，其他标签旧副本不覆盖无关工程',()=>{
 const storage=localStore(),workspace={workspaceId:'library-a',projects:[{projectId:'a'},{projectId:'b'}]};
 const a={...emptyPanelMemory(),scope:'library-a',route:{page:'copy',projectId:'a'},drafts:{a:{title:'标题',text:'草稿一',version:2}},editors:{a:{revision:3,frame:15,position:.5,zoom:16}}},written={};writePersistentPanelMemory(storage,a,written);
 const old=readPersistentPanelMemory(storage,workspace),otherBaseline=panelRecoveryBaseline(old);a.drafts.a.text='草稿二';writePersistentPanelMemory(storage,a,written);
 old.drafts.b={title:'另一工程',text:'独立草稿'};writePersistentPanelMemory(storage,old,otherBaseline);
 const reopened=readPersistentPanelMemory(storage,workspace);assert.equal(reopened.drafts.a.text,'草稿二');assert.equal(reopened.drafts.b.text,'独立草稿');assert.equal(reopened.drafts.a.version,2);assert.equal(reopened.editors.a.zoom,16);
 const reopeningBaseline=panelRecoveryBaseline(old,reopened);writePersistentPanelMemory(storage,old,reopeningBaseline);assert.equal(readPersistentPanelMemory(storage,workspace).drafts.a.text,'草稿二');
 assert.deepEqual(readPersistentPanelMemory(storage,{...workspace,workspaceId:'another'}).drafts,{});
});
test('持久保存配额失败不记录成功基线，修复存储后同一草稿仍可保存',()=>{
 const m={...emptyPanelMemory(),scope:'a',drafts:{b:{text:'重要草稿'}}},written={};assert.throws(()=>writePersistentPanelMemory({setItem(){throw Error('quota');}},m,written));assert.deepEqual(written,{});
 const storage=localStore();writePersistentPanelMemory(storage,m,written);assert.equal(storage.length,3);assert.equal(readPersistentPanelMemory(()=>{throw Error('denied');},{workspaceId:'a',projects:[]}).scope,'a');
});
test('同工程两标签交错写入并关闭后，两份未保存稿均可恢复',()=>{
 const storage=localStore(),workspace={workspaceId:'library',projects:[{projectId:'a'}]},initial={...emptyPanelMemory(),scope:'library',drafts:{a:{title:'标题',text:'原稿',version:1}}};
 writePersistentPanelMemory(storage,initial,{});
 const a=readPersistentPanelMemory(storage,workspace),b=readPersistentPanelMemory(storage,workspace),wa=panelRecoveryBaseline(a),wb=panelRecoveryBaseline(b);
 a.drafts.a.text='草稿 A';b.drafts.a.text='草稿 B';
 // 两个保存都先留下编辑者独占副本；模拟在主键提交处发生另一个标签写入。
 const set=storage.setItem;let interleaved=false;
 storage.setItem=(key,value)=>{if(key.endsWith(':a:draft')&&!interleaved){interleaved=true;writePersistentPanelMemory(storage,b,wb);}set(key,value);};
 writePersistentPanelMemory(storage,a,wa);
 const copies=panelDraftCopies(storage,'library','a');assert(copies.some(c=>c.draft.text==='草稿 A'));assert(copies.some(c=>c.draft.text==='草稿 B'));
 assert.equal(readPersistentPanelMemory(storage,workspace).drafts.a.version,1);
 // 新标签恢复 A，再选 B 并继续编辑；之前的 A/B 均不被恢复操作擦掉。
 const fresh=readPersistentPanelMemory(storage,workspace),written=panelRecoveryBaseline(fresh);fresh.drafts.a.text='恢复后临时稿';writePersistentPanelMemory(storage,fresh,written);
 forkPanelRecovery(written);fresh.drafts.a=copies.find(c=>c.draft.text==='草稿 B').draft;writePersistentPanelMemory(storage,fresh,written);
 const retained=panelDraftCopies(storage,'library','a').map(c=>c.draft.text);for(const text of ['草稿 A','草稿 B','恢复后临时稿'])assert(retained.includes(text));
 assert.deepEqual(panelDraftCopies(storage,'another','a'),[]);
});
test('旧草稿损坏时新稿仍可保存，副本写失败不会覆盖当前主稿',()=>{
 const storage=localStore(),m={...emptyPanelMemory(),scope:'library',drafts:{a:{text:'新稿'}}};storage.setItem('dsh-copy-edit.recovery.v1:library:a:draft','{');writePersistentPanelMemory(storage,m,{});
 const set=storage.setItem;storage.setItem=(key,value)=>{if(key.includes('draft-copy:'))throw Error('quota');set(key,value);};m.drafts.a.text='待保存';
 assert.throws(()=>writePersistentPanelMemory(storage,m,{}),/quota/);assert.equal(JSON.parse(storage.getItem('dsh-copy-edit.recovery.v1:library:a:draft')).text,'新稿');
});
test('存取草稿/播放头不夹带动作，隔离不同文案库和失效工程',()=>{
 const m=emptyPanelMemory();Object.assign(m,{scope:'one',route:{page:'copy',projectId:'a'},drafts:{a:{text:'未提交\n草稿'},b:{text:'旧工程'}},editors:{a:{position:3.5,selected:'clip-a'}}});
 let bytes;const storage={setItem:(k,v)=>bytes=v,getItem:()=>bytes};writePanelMemory(storage,m);
 const v=restorePanelMemory(readPanelMemory(storage),{workspaceId:'one',projects:[{projectId:'a'}]});assert.equal(v.drafts.a.text,'未提交\n草稿');assert.equal(v.editors.a.position,3.5);assert.equal(v.drafts.b,undefined);
 assert.deepEqual(restorePanelMemory(v,{workspaceId:'two',projects:[{projectId:'a'}]}).drafts,{});
});
test('损坏和容量失败不伪造持久化成功',()=>{
 assert.equal(readPanelMemory({getItem:()=>'{'}).route.page,'home');
 assert.throws(()=>writePanelMemory({setItem(){throw Error('quota');}},emptyPanelMemory()),/quota/);
});
test('合法JSON中的错误嵌套结构和拒绝访问storage均不能阻断入口',()=>{
 for(const bad of [null,[],false,1,'abc',{query:1,search:[]}]){
  const m=readPanelMemory({getItem:()=>JSON.stringify({format:1,route:{page:'home'},home:bad,copy:bad,drafts:{a:bad},editors:{a:bad},trail:[bad],job:bad})});
  assert.equal(typeof m.home.query,'string');assert.equal(typeof m.copy.search,'string');assert.equal(m.job,null);
 }
 assert.equal(readPanelMemory(()=>{throw Error('SecurityError');}).route.page,'home');
 const m=readPanelMemory({getItem:()=>JSON.stringify({format:1,drafts:{a:{text:5,sticker:{text:3}}},home:{scrollTop:-5}})});assert.equal(m.drafts.a.text,undefined);assert.equal(m.drafts.a.sticker,undefined);assert.equal(m.home.scrollTop,0);
});
