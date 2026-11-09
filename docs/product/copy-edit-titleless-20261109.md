# 文案标题移除与草稿菜单（2026-11-09）

09:10续轮：用户要求review两次，当前隔离版mobile.12补齐版本切换草稿保护及状态提示，并避免只读版本查看耗尽副本额度。[两轮记录](copy-edit-title-review-twice-20261109.md)。下文保留mobile.10当时的实现和有限验收。

用户明确要求桌面与手机移除独立文案标题，所有作品展示名采用正文首句。本轮隔离安装为 `0.2.0-mobile.10`，沿用 mobile.9 外观；播放稳定性仍按用户要求暂缓。未操作生产手机，未提交或发布。

## 界面结果

- 正文页删除标题输入及整行容器，不再将自动首句另画成一个标题。
- 侧栏、首页卡片/列表、工程卡片、工程下拉、剪辑名称及分类提示统一从当前窗口正文首句取名，未保存输入也会同步。没有句末标点时取第一行，空正文显示“空白文案”；过长名称限80个Unicode字符并省略。列表摘要从首句之后开始，避免重复。
- “其他草稿”是不同窗口保存的未提交副本，用于避免相互覆盖。原先独占一行没有技术必要。本轮删除独立恢复行，在原有V1下拉里分为“已保存版本”和“未保存草稿”；选择草稿仍先保护当前副本，其他副本保留。
- 旧标题仅作为历史存储兼容字段保留，不参与界面显示，也不批量改写历史工程或版本。保存文案继续使用已有服务端合同，不把不可见旧草稿标题写回当前工程。

实现入口：`plugins/dsh-copy-edit/src/copy-label.mjs`、`client.cjs`、`home.cjs`、`categories.cjs`、`copy-layout.css`、`mobile-refinement.css`；构建器将首句函数并入客户端。

## 验证与截图

1. 首句/草稿存储关联13项单测全部通过；插件构建、独立Android测试APK编译通过。没有重复计算历史92项媒体测试。
2. Ego工作区31完成桌面实际操作后已finish且无保留页面。标题/恢复行不存在；正文即时更新侧栏；首页卡片和列表、分类窗口、全部29个工程选项及剪辑页符合首句规则；恢复实际草稿并核对正文及副本保留。桌面实际视口1912×1281，无面板横向溢出，版本选择器宽72px。验收脚本最初等待手机目录按钮而超时，随后依据桌面快照选择实际插件入口；另有脚本导入路径和长首页滚动修正，不计作应用通过或失败。
3. 复用 `DSHA_API30` / `emulator-5580` / Android11 / AOSP WebView128.0.6613.88。`titlelessDraftMenu`、`copyAppearance`、`editorAppearance` 三项通过；412×660 CSSpx、系统字号1，版本菜单宽60px，没有被长草稿名称撑开。动态首句、真实副本恢复、原副本保留、正文和剪辑无横溢出、主轨可见及抽屉宽度均有断言。
4. Android首试 `web-081949` 在WebView渲染进程SIGTRAP后应用退出；有界补跑 `web-082019` 三项通过。首试不是布局断言失败，也不能据此宣布内核稳定性解决。本轮没有重跑130%/横屏/播放矩阵，mobile.9旧证据仍按原范围保留。

完整截图均来自实际界面，未拼接或重绘：

- `build/copy-edit-mobile/20261109/web-082019/android-copy-review.png`
- `build/copy-edit-mobile/20261109/web-082019/android-editor.png`
- `build/copy-edit-mobile/20261109/title-layout/desktop-copy.png`
- `build/copy-edit-mobile/20261109/title-layout/desktop-home.png`
- `build/copy-edit-mobile/20261109/title-layout/desktop-editor.png`

正文截图仅暂时修改既有自制工程的未保存文稿，完成后恢复；分类检查没有保存分类；未更改工程修订或发起媒体任务。浏览器首页视图偏好也恢复。回执见 `title-layout/desktop-receipt.json`、`ego-restored.json` 和 `web-082019/web-titleless.json`。

## 软件身份与数据保全

安装包107,016字节，SHA256 `baf7210418326d17d308a924173ed533ef0e3a9bd52461fcdd1c1931086a788a`。客户端SHA256 `a4dab1662b96deb5e2ce231b5299b2b84d5b26931f1aff8bb896199d39880eb6`，7个关键安装文件与源码构建输出逐字节一致。独立App APK仍为 `dc60e90dbc7ad3b0989c8e492021486be157982ee201cb6c505d865dfbf98e54`；此次只更新测试APK和隔离服务插件。

隔离安装前后 `state.json` SHA256均为 `1e6cf36c4b15576678a9140344c3ff52b892bd23657b1a2b2f72f66dcd5eac6e`，移动宿主与HMR文件不变；原25个工程零改动，自制4工程修订仍为3/17/10/2。原45个tracked变更中43个字节保持，另外2个仅保留此前允许的集成差异，无本轮新增偏差。生产 `HOST_DEVICE_VERIFIED=false` 不变。

仅使用既有E:/dsha工作树、依赖、SDK/JDK、只读AVD和61328隔离服务。保留当前服务/模拟器供下一轮外观评审；没有新clone/worktree、依赖下载或批量清理。新包、最小失败日志、检查回执及截图留存在 `build/copy-edit-mobile/20261109/title-layout/` 与上述两个 `web-*` 目录；独立测试端仅替换自己命名的可再生输出，旧宿主证据全部保留。空间记录见 `title-layout/closeout.json`，未将并发磁盘变化记作清理收益。
