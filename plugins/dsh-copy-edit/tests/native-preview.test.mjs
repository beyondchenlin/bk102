import test from 'node:test';import assert from 'node:assert/strict';
import {createNativePreviewPlayer} from '../src/native-preview.mjs';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 const win=new EventTarget(),doc=new EventTarget();let observerCount=0,raf=null;const observations=[];
 win.ResizeObserver=win.MutationObserver=class{constructor(fn){observerCount++;this.fn=fn;}observe(target){observations.push({target,fn:this.fn});}disconnect(){observerCount--;}};win.innerWidth=360;win.requestAnimationFrame=fn=>{raf=fn;return 1;};win.cancelAnimationFrame=()=>{raf=null;};doc.defaultView=win;doc.hidden=false;doc.body={};
 const element={ownerDocument:doc,getBoundingClientRect:()=>({x:12,y:12,width:240,height:420}),contains:x=>x===element,closest:()=>null};doc.elementFromPoint=()=>element;
 const id='a'.repeat(32),calls=[],subscribers=new Set();let sequence=0,command=0,resolveOpen,rejectOpen;
 const state={playbackId:id,position:0,running:false,preparing:false,ended:false,error:''};
 const value=patch=>({...state,...patch,command,sequence:++sequence});
 const client={subscribePreview(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},call(action,args){calls.push({action,...args});if(action==='previewOpen')return new Promise((resolve,reject)=>{resolveOpen=()=>resolve(value({}));rejectOpen=reject;});if(args.command==='seek'){command++;return Promise.resolve(value({preparing:true}));}if(args.command==='pause'){command++;return Promise.resolve(value({}));}return Promise.resolve(value({position:1.933}));}};
 const seen={running:[],preparing:[],position:[]},player=createNativePreviewPlayer(element,{client,jobId:'job',newId:()=>id,onRunning:x=>seen.running.push(x),onPreparing:x=>seen.preparing.push(x),onPosition:x=>seen.position.push(x)});
 return {player,calls,seen,id,doc,observations,mutate(){observations.at(-1).fn();const fn=raf;raf=null;fn?.();},open:()=>resolveOpen(),fail:e=>rejectOpen(e),emit:patch=>{const v=value(patch);for(const fn of subscribers)fn(v);return v;},replay:v=>{for(const fn of subscribers)fn(v);},nextCommand:()=>command++,observers:()=>observerCount,subscribers};
}
test('准备完成前不宣称播放，身份/序号隔离迟到状态，精确操作查询原生位置',async()=>{
 const f=fixture();try{const run=f.player.playFrom(0);f.open();await flush();assert.equal(f.calls.filter(x=>x.command==='seek').length,1);assert.equal(f.seen.running.includes(true),false);
 f.emit({playbackId:'b'.repeat(32),running:true});assert.equal(f.seen.running.includes(true),false);const old=f.emit({preparing:true});f.emit({preparing:false,running:true,position:.2});await run;
 f.replay(old);assert.equal(f.seen.running.at(-1),true);assert.equal(await f.player.readPosition(),1.933);assert.equal(f.calls.at(-1).command,'state');
 }finally{f.player.dispose();await flush();}assert.equal(f.calls.at(-1).command,'close');assert.equal(f.calls.at(-1).playbackId,f.id);assert.equal(f.observers(),0);assert.equal(f.subscribers.size,0);
});
test('open响应前退出会取消播放，只关闭自己的实例，不发送迟到seek',async()=>{
 const f=fixture(),run=f.player.playFrom(2),rejected=assert.rejects(run,{name:'AbortError'});f.player.dispose();assert.equal(f.calls.at(-1).command,'close');f.open();await rejected;await flush();assert.equal(f.calls.some(x=>x.command==='seek'),false);assert.deepEqual(f.calls.filter(x=>x.action==='preview').map(x=>x.command),['close']);
});
test('后台/遮挡的原生暂停能取消未完成定位，不等超时也不自动恢复',async()=>{
 const f=fixture();try{const run=f.player.playFrom(1),rejected=assert.rejects(run,{name:'AbortError'});f.open();await flush();f.nextCommand();f.emit({running:false,preparing:false});await rejected;assert.equal(f.calls.filter(x=>x.command==='seek').length,1);}finally{f.player.dispose();await flush();}
});
test('原生open失败会退出准备状态，不能留下永远转圈的控件',async()=>{
 const f=fixture();try{const run=f.player.playFrom(0),rejected=assert.rejects(run,/unavailable/);f.fail(Error('unavailable'));await rejected;assert.equal(f.seen.preparing.at(-1),false);}finally{f.player.dispose();await flush();}
});
test('面板外弹层和角落遮挡也隐藏原生视频，重复布局不发送多余命令',async()=>{
 const f=fixture();try{f.open();await flush();assert.equal(f.observations.at(-1).target,f.doc.body);
 const hit=f.doc.elementFromPoint;f.doc.elementFromPoint=(x,y)=>x<20&&y<20?{}:hit(x,y);f.mutate();await flush();assert.equal(f.calls.at(-1).command,'layout');assert.equal(f.calls.at(-1).bounds.visible,false);
 const count=f.calls.length;f.mutate();await flush();assert.equal(f.calls.length,count);
 f.doc.elementFromPoint=hit;f.mutate();await flush();assert.equal(f.calls.at(-1).bounds.visible,true);assert.equal(f.calls.some(x=>x.command==='seek'),false);
 }finally{f.player.dispose();await flush();}
});
