// 桌面 DSH 的更新通道补丁；不进入文案插件包，也不接管 shell-owned transport。
// 同源、同路径只允许一个可见页面持有 SSE，其他页面通过广播接收原协议。
export function startBrowserHmrEvents(route, receive, report, env = globalThis) {
  const doc = env.document;
  const url = new URL(route, doc.baseURI).href;
  const key = 'dsh:desktop-hmr:v1:' + url;
  let channel = null;
  let shared = typeof env.BroadcastChannel === 'function' && !!env.navigator?.locks?.request;
  let current = null;
  let disposed = false;
  let suspended = false;
  if (shared) {
    try { channel = new env.BroadcastChannel(key); }
    catch (error) { shared = false; report(error); }
  }
  const visible = () => !disposed && !suspended && doc.visibilityState !== 'hidden';
  const isCurrent = session => current === session && visible();
  function stop() {
    const session = current;
    current = null;
    if (!session) return;
    session.controller.abort();
    env.clearTimeout(session.refreshTimer);
    session.source?.close();
    session.release?.();
  }
  function publish(message) {
    try { channel?.postMessage(message); }
    catch (error) { report(error); }
  }
  function open(session) {
    if (!isCurrent(session)) return;
    session.source?.close();
    session.hasSnapshot = false;
    const source = new env.EventSource(url);
    session.source = source;
    source.addEventListener('message', event => {
      if (!isCurrent(session) || session.source !== source) return;
      // 原服务在连接建立时先发完整 graph；其余帧仍由原接收器校验。
      try { if (JSON.parse(event.data)?.type === 'graph') session.hasSnapshot = true; }
      catch { /* 原接收器负责报告协议错误。 */ }
      if (shared) publish({ kind: 'frame', data: event.data });
      receive(event.data);
    });
  }
  function start() {
    if (current || !visible()) return;
    const session = { controller: new env.AbortController(), source: null, release: null, refreshTimer: null, hasSnapshot: false };
    current = session;
    if (!shared) {
      try { open(session); } catch (error) { stop(); report(error); }
      return;
    }
    // 锁持有时间等于连接存活时间；取消只撤销等待，已获得的锁由 release 释放。
    Promise.resolve().then(() => env.navigator.locks.request(key, { signal: session.controller.signal }, async () => {
      if (!isCurrent(session)) return;
      await new Promise(resolve => {
        session.release = resolve;
        try { open(session); }
        catch (error) { stop(); report(error); }
      });
    })).catch(error => {
      if (!session.controller.signal.aborted) {
        report(error);
        // 浏览器禁止共享 API 时保留可见页面更新，不伪装已实现跨窗口共享。
        if (current === session) {
          stop();
          shared = false;
          channel?.close();
          channel = null;
          start();
        }
      }
    });
    publish({ kind: 'sync' });
  }
  if (channel) channel.onmessage = event => {
    const session = current;
    if (!session || !isCurrent(session)) return;
    const message = event.data;
    if (message?.kind === 'frame' && typeof message.data === 'string') {
      // 只由锁持有者广播，发送者不会收到自己的消息。
      if (!session.source) receive(message.data);
    } else if (message?.kind === 'sync' && session.source && (session.hasSnapshot || session.source.readyState === 2) && !session.refreshTimer) {
      // 新加入/恢复的页面需要服务端最新 graph，不能回放过期 revision。
      // 合并同一轮加入；首个 graph 未到时共享等待，但已被鉴权拒绝关闭的连接必须重新建立。
      session.refreshTimer = env.setTimeout(() => {
        session.refreshTimer = null;
        try { open(session); } catch (error) { stop(); report(error); }
      }, 0);
    }
  };
  const visibility = () => { if (visible()) start(); else stop(); };
  const suspend = () => { suspended = true; stop(); };
  const resume = () => { suspended = false; visibility(); };
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('freeze', suspend);
  doc.addEventListener('resume', resume);
  env.addEventListener('pagehide', suspend);
  env.addEventListener('pageshow', resume);
  start();
  return () => {
    disposed = true;
    stop();
    channel?.close();
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('freeze', suspend);
    doc.removeEventListener('resume', resume);
    env.removeEventListener('pagehide', suspend);
    env.removeEventListener('pageshow', resume);
  };
}
