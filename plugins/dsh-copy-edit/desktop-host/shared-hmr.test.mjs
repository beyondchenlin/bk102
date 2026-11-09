import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserHmrEvents } from './shared-hmr.mjs';
import { patchedClient } from './apply.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function fixture() {
  const channels = new Set(), sources = [], locks = new Map(), pages = [];
  function pump(name) {
    const queue = locks.get(name);
    if (!queue?.length || queue[0].running) return;
    const row = queue[0];
    row.running = true;
    row.signal.removeEventListener('abort', row.abort);
    Promise.resolve().then(row.callback).then(row.resolve, row.reject).finally(() => {
      queue.shift(); pump(name);
    });
  }
  const lockManager = { request(name, { signal }, callback) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
      const queue = locks.get(name) || [];
      locks.set(name, queue);
      const row = { signal, callback, resolve, reject, running: false, abort() {
        queue.splice(queue.indexOf(row), 1);
        reject(new DOMException('aborted', 'AbortError'));
        pump(name);
      } };
      queue.push(row);
      signal.addEventListener('abort', row.abort, { once: true });
      pump(name);
    });
  } };
  class Channel {
    constructor(name) { this.name = name; channels.add(this); }
    postMessage(message) {
      for (const target of channels) if (target !== this && target.name === this.name) {
        queueMicrotask(() => { if (channels.has(target)) target.onmessage?.({ data: message }); });
      }
    }
    close() { channels.delete(this); }
  }
  function page({ hidden = false, base = 'http://local/desktop/', sharing = true, rejectLocks = false } = {}) {
    const win = new EventTarget(), doc = new EventTarget(), frames = [], errors = [];
    doc.baseURI = base;
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    const env = Object.assign(win, {
      document: doc, navigator: { locks: rejectLocks ? { request() { throw new Error('denied'); } } : lockManager },
      BroadcastChannel: sharing ? Channel : undefined,
      EventSource: class extends EventTarget {
        constructor(url) { super(); this.url = url; this.closed = false; this.readyState = 0; sources.push(this); }
        close() { this.closed = true; this.readyState = 2; }
        emit(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
      }, AbortController, setTimeout, clearTimeout,
    });
    const stop = startBrowserHmrEvents('plugins/events', data => frames.push(JSON.parse(data)), e => errors.push(e.message), env);
    const result = { env, doc, frames, errors, stop, hide() { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); }, show() { doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); } };
    pages.push(result);
    return result;
  }
  return { page, sources, channels, active: () => sources.filter(s => !s.closed), cleanup: async () => { pages.forEach(p => p.stop()); await tick(); assert.equal(sources.filter(s => !s.closed).length, 0); assert.equal(channels.size, 0); assert.equal([...locks.values()].flat().length, 0); } };
}

test('8 个可见页面共用一条连接，graph 和 rebuilt 都送达各页面', async t => {
  const f = fixture(); t.after(f.cleanup);
  const pages = Array.from({ length: 8 }, () => f.page());
  await tick(); assert.equal(f.active().length, 1);
  const graph = { type: 'graph', graph: { rev: '1' } }, rebuilt = { type: 'rebuilt', id: 'demo', rev: '2' };
  f.active()[0].emit(JSON.stringify(graph)); f.active()[0].emit(JSON.stringify(rebuilt));
  await tick();
  for (const page of pages) assert.deepEqual(page.frames, [graph, rebuilt]);
});
test('后来加入者获取新的完整 graph，不回放旧快照', async t => {
  const f = fixture(); t.after(f.cleanup);
  const first = f.page(); await tick();
  const old = f.active()[0]; old.emit(JSON.stringify({ type: 'graph', graph: { rev: 'old' } }));
  const second = f.page(); await tick();
  assert.equal(f.active().length, 1); assert.equal(old.closed, true);
  old.emit(JSON.stringify({ type: 'rebuilt', id: 'demo', rev: 'obsolete' }));
  const fresh = { type: 'graph', graph: { rev: 'new' } };
  f.active()[0].emit(JSON.stringify(fresh)); await tick();
  assert.deepEqual(second.frames, [fresh]); assert.equal(first.frames.length, 2);
});
test('leader 隐藏时交接，全部隐藏时没有长连接；恢复后同步', async t => {
  const f = fixture(); t.after(f.cleanup);
  const first = f.page(), second = f.page(); await tick();
  const old = f.active()[0]; first.hide(); await tick();
  assert.equal(old.closed, true); assert.equal(f.active().length, 1);
  second.hide(); await tick(); assert.equal(f.active().length, 0);
  first.show(); await tick(); assert.equal(f.active().length, 1);
  f.active()[0].emit(JSON.stringify({ type: 'graph', graph: { rev: 'return' } })); await tick();
  assert.equal(first.frames.at(-1).graph.rev, 'return'); assert.equal(second.frames.length, 0);
});
test('服务重启鉴权曾拒绝首个连接，新页面加入可同步而非永远等待', async t => {
  const f = fixture(); t.after(f.cleanup); const first = f.page(); await tick();
  f.active()[0].close();
  const second = f.page(); await tick(); assert.equal(f.active().length, 1);
  const graph = { type: 'graph', graph: { rev: 'restarted' } };
  f.active()[0].emit(JSON.stringify(graph)); await tick();
  assert.deepEqual(first.frames, [graph]); assert.deepEqual(second.frames, [graph]);
});
test('关闭等待者后不会留下排队锁；关闭 leader 后存活页面继续接收', async t => {
  const f = fixture(); t.after(f.cleanup);
  const first = f.page(), waiting = f.page(), survivor = f.page(); await tick();
  waiting.stop(); first.stop(); await tick();
  assert.equal(f.active().length, 1);
  f.active()[0].emit(JSON.stringify({ type: 'graph', graph: {} })); await tick();
  assert.equal(survivor.frames.length, 1); assert.equal(waiting.frames.length, 0);
});
test('pagehide / pageshow 与 freeze / resume 不泄漏锁或连接', async t => {
  const f = fixture(); t.after(f.cleanup); const p = f.page(); await tick();
  for (const [target, hide, show] of [[p.env, 'pagehide', 'pageshow'], [p.doc, 'freeze', 'resume']]) {
    target.dispatchEvent(new Event(hide)); await tick(); assert.equal(f.active().length, 0);
    target.dispatchEvent(new Event(show)); await tick(); assert.equal(f.active().length, 1);
  }
});
test('文档相对路径分隔不同宿主实例的通道', async t => {
  const f = fixture(); t.after(f.cleanup); const a = f.page(), b = f.page({ base: 'http://local/other/' });
  await tick(); assert.equal(f.active().length, 2);
  f.active().find(s => s.url === 'http://local/desktop/plugins/events').emit(JSON.stringify({ type: 'graph', graph: {} }));
  await tick(); assert.equal(a.frames.length, 1); assert.equal(b.frames.length, 0);
});
test('初始隐藏不占连接，重复显隐事件不会创建重复 source', async t => {
  const f = fixture(); t.after(f.cleanup); const p = f.page({ hidden: true }); await tick();
  assert.equal(f.active().length, 0); p.show(); p.show(); await tick(); assert.equal(f.active().length, 1);
  p.hide(); p.show(); p.hide(); p.show(); await tick(); assert.equal(f.active().length, 1);
});
test('不支持共享 API 时仍按可见性管理；拒绝锁时明确报告', async t => {
  const f = fixture(); t.after(f.cleanup);
  const p = f.page({ sharing: false }); await tick(); assert.equal(f.active().length, 1);
  p.hide(); assert.equal(f.active().length, 0);
  const denied = f.page({ rejectLocks: true }); await tick(); assert.deepEqual(denied.errors, ['denied']); assert.equal(f.active().length, 1);
});
test('补丁拒绝未知上游字节', () => assert.throws(() => patchedClient(Buffer.from('unknown')), /摘要不匹配/));
