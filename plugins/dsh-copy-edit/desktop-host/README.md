# 桌面 DSH 多标签页更新连接修复

这是独立的**桌面 DSH 宿主维护补丁**，不属于文案剪辑插件的业务代码，不打进插件 npm 包，也不接入 Android 资产流水线。

适用版本：`@deepseek-ai/dsh-client-hmr@0.2.1-rc.2`，`lib/client.js` 原始 SHA-256：
`697e5273fa6f7ac7e811b6171a1858fbfd402f556b03d9cc6f0c4808dc72e87b`。

## 原因与处理

原浏览器分支每页创建一条 `/plugins/events` EventSource。在 HTTP/1.1 同源连接池达到上限时，其他 RPC 会在浏览器排队，服务端根本还没有开始处理。延长读取超时、重复读取或压缩工作台数据不能释放这些长连接。

`shared-hmr.mjs` 通过 Web Locks 选出一个可见页面持有 SSE，BroadcastChannel 转发原始更新帧。锁和广播名称同时包含完整文档相对接口地址，不把不同路径的 DSH 实例混用。

- 关闭、隐藏、冻结或卸载页面时先关闭连接，再释放锁；等待者可以接手。全部页面隐藏时没有更新长连接。
- 新页面加入、后台页面恢复时，持有者重新取得服务端完整 graph。合并同一轮加入请求；不缓存旧 graph/rebuilt 来冒充最新状态。原模块控制器继续处理 revision、安装/卸载与热更新。
- EventSource 的原生断线重连保留；遇到已经关闭的连接，新页面的同步请求也可重新建立它。没有增加业务 RPC 的超时重试、写操作重放或周期轮询。
- `__DSH_TRANSPORT__.fetch` 分支逐字节保留，鉴权和服务端 SSE 协议均不修改。
- Web Locks / BroadcastChannel 不可用时，只做可见页面的连接生命周期管理；**不声称这种降级也能保证多个可见窗口共享一条连接**。本轮验证的是支持这两种 API 的 Chromium 回环地址，不包括不安全 LAN HTTP、其他浏览器和 Android。

## 安装与回滚

复用现有桌面 runtime，无需安装依赖或重新构建文案插件：

```powershell
node E:/dsha/plugins/dsh-copy-edit/desktop-host/apply.mjs E:/dsha/build/copy-edit-spike/runtime
node --check E:/dsha/build/copy-edit-spike/runtime/node_modules/@deepseek-ai/dsh-client-hmr/lib/client.js
node --test E:/dsha/plugins/dsh-copy-edit/desktop-host/shared-hmr.test.mjs
```

安装器校验包名、版本和原始摘要，备份原件为同目录 `client.js.desktop-shared.original`，原子替换；重复应用返回 unchanged。发现未知目标修改或未知原件摘要即停止。运行时升级后必须重新核对，不能对其他版本强行套用。

```powershell
node E:/dsha/plugins/dsh-copy-edit/desktop-host/apply.mjs E:/dsha/build/copy-edit-spike/runtime --restore
```

回滚只还原该客户端文件，不改文案库、剪辑工程、媒体文件或浏览器偏好。保留的原件用于这次补丁回滚，由桌面维护者在下次 DSH 升级时复查。

## 验证

10 项独立测试覆盖多页面单连接、加入同步、graph/rebuilt 转发、隐藏及恢复、锁交接、等待取消、服务重启后的关闭连接、路径隔离和降级。

本机真实浏览器证据、原始失败、82 项检查以及未改动边界见 [根因报告](../../../docs/product/copy-edit-multitab-connection-20261109.md)。

平台依据：[MDN SSE 连接限制](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)、[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request)、[BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)。
