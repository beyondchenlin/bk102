import test from 'node:test';import assert from 'node:assert/strict';import {createRequire}from'node:module';
const {createPreviewPlayer}=createRequire(import.meta.url)('../src/preview.cjs');
class Video extends EventTarget {
  readyState=0;duration=4;seeking=false;paused=true;error=null;time=0;frames=new Map();frameId=0;plays=[];
  get currentTime(){return this.time;}set currentTime(n){this.time=n;this.seeking=true;}
  requestVideoFrameCallback(fn){this.frames.set(++this.frameId,fn);return this.frameId;}
  cancelVideoFrameCallback(id){this.frames.delete(id);}
  event(name){this.dispatchEvent(new Event(name));}
  present(time){const pending=[...this.frames.values()];this.frames.clear();for(const fn of pending)fn(0,{mediaTime:time});}
  pause(){if(!this.paused){this.paused=true;this.event('pause');}}
  async play(){this.plays.push({time:this.time,ready:this.readyState,seeking:this.seeking});this.paused=false;this.event('playing');}
  metadata(){this.readyState=1;this.event('loadedmetadata');}
  ready(){this.readyState=4;this.seeking=false;this.event('seeked');this.event('canplay');}
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function fixture(run){const queue=new Map();let next=0;const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=fn=>{queue.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>queue.delete(id);
 const v=new Video(),state={preparing:false,running:false,errors:[],ended:0,position:0},player=createPreviewPlayer(v,{duration:4,onPreparing:x=>state.preparing=x,onRunning:x=>state.running=x,onPosition:x=>state.position=x,onError:e=>state.errors.push(e.message),onEnded:()=>state.ended++});
 const paint=async()=>{for(let i=0;i<2;i++){const pending=[...queue.values()];queue.clear();pending.forEach(fn=>fn());await flush();}};
 try{await run({v,player,state,paint,queue});}finally{player.dispose();globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel;}
}
test('冷启动必须等待目标帧提交；元数据、缓冲或旧帧都不能提前播放',async()=>fixture(async({v,player,paint,state})=>{
 const done=player.playFrom(1.8);v.metadata();await flush();assert(Math.abs(v.currentTime-1.8)<.000002);assert.equal(v.plays.length,0);v.ready();await flush();assert.equal(v.plays.length,0);
 v.present(0);await flush();await paint();assert.equal(v.plays.length,0);v.present(1.766667);await flush();await paint();assert.equal(v.plays.length,0);v.present(1.8);await flush();assert.equal(v.plays.length,0);await paint();await done;
 assert.equal(v.plays.length,1);assert.equal(v.plays[0].ready,4);assert.equal(v.plays[0].seeking,false);assert.equal(state.preparing,false);assert.equal(state.running,true);
}));
test('取消和卸载撤销迟到的定位、首帧及绘制回调',async()=>fixture(async({v,player,paint,queue})=>{
 const first=player.playFrom(1);const rejected=assert.rejects(first,{name:'AbortError'});v.metadata();await flush();player.pause();v.ready();v.present(1);await paint();await rejected;assert.equal(v.plays.length,0);
 const second=player.playFrom(2);const removed=assert.rejects(second,{name:'AbortError'});await flush();v.ready();v.present(2);await flush();assert(queue.size>0);player.dispose();await paint();await removed;assert.equal(v.plays.length,0);assert.equal(v.frames.size,0);assert.equal(queue.size,0);
}));
test('快速重定位仅允许最后请求播放，暂停定位不会自动播放',async()=>fixture(async({v,player,paint})=>{
 const old=player.playFrom(1),rejected=assert.rejects(old,{name:'AbortError'});v.metadata();await flush();const latest=player.playFrom(2);await flush();v.ready();v.present(1);await flush();await paint();assert.equal(v.plays.length,0);v.present(2);await flush();await paint();await latest;await rejected;assert.equal(v.plays.length,1);assert(Math.abs(v.plays[0].time-2)<.000002);
 const seek=player.seek(3);await flush();v.ready();v.present(3);await flush();await paint();await seek;assert.equal(v.paused,true);assert.equal(v.plays.length,1);
}));
test('暂停后续播不回到低频播放指针；末尾重播可重新定位首帧',async()=>fixture(async({v,player,paint})=>{
 v.metadata();const done=player.playFrom(0);await flush();v.ready();v.present(0);await flush();await paint();await done;
 v.time=1.857;v.present(1.7);player.pause();const resume=player.playFrom(v.currentTime);await flush();assert.equal(v.seeking,true);v.ready();v.present(1.833333);await flush();await paint();await resume;assert.equal(v.plays.at(-1).time,1.857);
 v.time=4;v.paused=true;v.event('ended');const replay=player.playFrom(0);await flush();v.ready();v.present(0);await flush();await paint();await replay;assert(v.plays.at(-1).time<.000002);
}));
test('循环小数边界经浏览器微秒截断后仍命中目标帧，不能回退一帧或超时',async()=>fixture(async({v,player,paint})=>{
 const done=player.playFrom(59/30);v.metadata();await flush();const browserTime=Math.floor(v.currentTime*1e6)/1e6;
 const decodedFrame=Math.floor(browserTime*30);assert.equal(decodedFrame,59);assert(Math.abs(browserTime-59/30)<.000002);
 v.ready();v.present(decodedFrame/30);await flush();await paint();await done;assert.equal(v.plays.length,1);
}));
test('解码错误向调用方报告，不自动重试或启动播放',async()=>fixture(async({v,player,state})=>{
 const done=player.playFrom(0),rejected=assert.rejects(done,/读取失败/);v.error={code:3};v.event('error');await rejected;assert.equal(v.plays.length,0);assert.equal(state.preparing,false);
}));
test('同帧内暂停定位不依赖重复的帧回调',async()=>fixture(async({v,player,paint})=>{
 v.metadata();const first=player.playFrom(1);await flush();v.ready();v.present(1);await flush();await paint();await first;player.pause();
 const seek=player.seek(1.015);await flush();v.ready();await flush();await paint();await seek;assert.equal(v.plays.length,1);assert.equal(v.paused,true);
}));
test('持续播放的缓冲与解码错误有可恢复状态，退出后不遗留监听',async()=>fixture(async({v,player,paint,state})=>{
 v.metadata();const done=player.playFrom(0);await flush();v.ready();v.present(0);await flush();await paint();await done;
 v.event('waiting');assert.equal(state.preparing,true);assert.equal(state.running,false);v.event('playing');assert.equal(state.preparing,false);assert.equal(state.running,true);
 v.error={code:3};v.event('error');assert.equal(state.running,false);assert.equal(state.preparing,false);assert.equal(v.paused,true);assert.equal(state.errors.length,1);assert.equal(v.plays.length,1);
 player.dispose();v.event('error');assert.equal(state.errors.length,1);
}));
test('AAC元数据含预延迟时仍按工程端点收尾，不重复完成或自动重播',async()=>fixture(async({v,player,paint,state})=>{
 v.duration=4.032;v.metadata();const done=player.playFrom(3.9);await flush();v.ready();v.present(3.9);await flush();await paint();await done;
 v.time=4.001;v.event('timeupdate');assert.equal(v.paused,true);assert.equal(state.position,4);assert.equal(state.ended,1);v.event('ended');assert.equal(state.ended,1);assert.equal(v.plays.length,1);
}));
test('未结算的play Promise可以立即取消，迟到完成不能覆盖新请求',async()=>fixture(async({v,player,paint,state})=>{
 let complete;const original=v.play.bind(v);v.play=()=>new Promise(resolve=>{complete=resolve;});
 v.metadata();const first=player.playFrom(0),cancelled=assert.rejects(first,{name:'AbortError'});await flush();v.ready();v.present(0);await flush();await paint();player.pause();await cancelled;
 v.play=original;const next=player.playFrom(1);await flush();v.ready();v.present(1);await flush();await paint();await next;complete();await flush();assert.equal(state.running,true);assert.equal(v.paused,false);assert.equal(v.plays.length,1);
}));
test('挂载前已显示首帧时重新提交目标帧，不能一直等待重复回调',async()=>fixture(async({v,player,paint})=>{
 v.readyState=4;const done=player.playFrom(0);await flush();assert(v.currentTime>0.03);v.ready();v.present(1/30);await flush();assert(v.currentTime<.000002);v.ready();v.present(0);await flush();await paint();await done;assert.equal(v.plays.length,1);
}));
test('未结算的play Promise到期停止等待和播放',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 try{await fixture(async({v,player,paint,state})=>{
  v.play=()=>new Promise(()=>{});v.metadata();const first=player.playFrom(0),failed=assert.rejects(first,/启动预览超时/);await flush();v.ready();v.present(0);await flush();await paint();t.mock.timers.tick(10000);await failed;assert.equal(state.preparing,false);assert.equal(v.paused,true);
 });}finally{t.mock.timers.reset();}
});
