# 文案剪辑手机外观重排（2026-11-09）

08:25续轮：用户要求移除所有独立文案标题、调整“其他草稿”位置，已在mobile.10实现并完成有限实测。[新版截图与记录](copy-edit-titleless-20261109.md)。下文保留mobile.9外观矩阵，不作为mobile.10全量复测。

用户查看独立 Android 截图后要求先重做外观，再继续播放稳定性。当前为 `0.2.0-mobile.9` 隔离评审版，未获得外观定稿确认；未提交、发布或操作生产手机。生产 `HOST_DEVICE_VERIFIED=false` 不变。

## 本轮布局

- 文案：一行导航与列表入口；版本、复制和保存收在轻量工具条；标题与正文优先。配音、背景音乐、画面与贴片按需展开。底部保留进入剪辑，正文聚焦输入时收起以给键盘让位。不同草稿副本保留，恢复入口折叠展示。
- 剪辑：顶部保留返回、工程切换和导出，去掉重复工程标题。深色仅用于画面预览；白色操作区与文案统一。轨道在首屏可见，命令横向滚动，底部集中素材、属性与声音、文案、成片。抽屉可滚动、占满宽度。
- 手机视图统一 16px 页边距、21/30 标题、17/28 正文、14/20 操作和12/18辅助字号，关键按钮保持至少44px命中区。桌面媒体布局与作品画布参数没有改写。

源码位于 `plugins/dsh-copy-edit/src/mobile-refinement.css`、`client.cjs`、`editor-layout.cjs`；构建器按原顺序追加手机样式。本次没有改媒体编码/播放管线或服务端工程命令。

## 实际截图与检查

完整原始屏幕截图保存在 `build/copy-edit-mobile/20261109/visual-review-mobile9/`：`copy.png`、`editor.png`、`keyboard.png`、`properties.png`。没有拼接或重绘。正文示例仅输入已有自制工程的未保存草稿，截图后恢复；剪辑页使用既有色块验收工程，未更改镜头/素材/修订。

实测环境是复用的只读 `DSHA_API30` / `emulator-5580`、Android11、AOSP WebView128.0.6613.88、宿主GPU。不是生产DSHA或实体ARM64手机。APK仍为 `dc60e90dbc7ad3b0989c8e492021486be157982ee201cb6c505d865dfbf98e54`；本轮新增的是独立测试代码。

`android-resume/visual-mobile8/results.json` 保留所有尝试：正常字号文案/剪辑/软键盘草稿/重开4项通过；系统 font_scale=1.3 文案/剪辑2项通过，文案首试发生内核崩溃后补跑；横屏文案通过，横屏剪辑两次内核崩溃，未验收。共7次通过、3次崩溃，不能称全绿。系统字号与旋转设置在 finally 中恢复原值，回执 `settings-restored.json` 的 `same=true`。

130%字体是实际 Android 系统设置：配置值1.29999995，正文22.1px。412×660CSSpx下两页无横向溢出，剪辑主轨仍位于首屏，工程选择入口存在；属性抽屉宽412.19px与面板一致。横屏只完成文案页。新版系统返回分层、完整长标题矩阵及生产宿主仍待后续验收，不由外观截图推导通过。

截图/矩阵实测mobile.8；最终mobile.9仅更新README和版本，`lib/client.js`逐字节相同，SHA256 `a10e480d779649dd1ca46fa40e449695a3c299d6186ae4cc37b46c8009e186c4`。最终tgz105,876字节，SHA256 `66348cf1c02144693ac32a775f2577fa2bf62fd8f7ae57f1847432cf424cba87`。构建通过，6个关键安装文件与构建输出一致。没有把先前mobile.4的92项业务测试重新计入本轮执行数。

## 播放与内核保留问题

用户转向外观前，严格4秒 `android-20261109-064829` 两轮通过，下一次 `065124` 出现166ms播放间隔，仍超过150ms门限；随后ADB读回卡住，未启动第三轮或60秒。保留原门限与失败日志。正常停止命令也超时后，只终止已核验身份的本任务只读模拟器进程及孤立ADB读取进程。

旧swiftshader_indirect模式出现EGL错误；改用宿主GPU后完整页面能够显示，但WebView128的x86渲染进程仍间歇SIGSEGV（空地址0x8、libwebviewchromium.so偏移038335e4），不能宣称GPU切换修复了内核或播放稳定性。此项按用户要求暂缓。WebView更新只在只读AVD覆盖层，Google83仍保留。来源和签名在 `android-resume/webview-input.json`、`host-gpu/webview-installed.json`。

官方来源：[AOSP WebView预构建](https://android.googlesource.com/platform/external/chromium-webview/+/refs/heads/main/)、[WebView provider说明](https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/webview-providers.md)、[Android模拟器图形加速](https://developer.android.com/studio/run/emulator-acceleration#accel-graphics)。这份128预构建只用作本地验收输入，不宣称是当前最新公开内核。

## 保全与留存

安装mobile.7/.8/.9前后 `state.json` SHA256一直为 `1e6cf36c4b15576678a9140344c3ff52b892bd23657b1a2b2f72f66dcd5eac6e`，移动宿主SHA256也不变。审计原25个工程零改动；4份自制工程修订仍3/17/10/2。原45个tracked修改43个字节不变，另2项仅保留此前允许的集成差异。唯一工作树E:/dsha，没有新clone/worktree。

打包时曾因PowerShell转义导致版本更新脚本未执行，误覆盖mobile.6本地tgz。该包已由保留mobile.5成员及精确安装文件确定性重建，大小103,196、SHA256 `d997c5ca7ebe1770fbc81b08089ebd0f77dde09ca92f7e2b9b7897f424b65900`，与原件逐字节一致；错误草稿和恢复依据在 `android-resume/package-recovery.json`，未安装错误版本。

旧swiftshader覆盖文件在该进程结束后已由模拟器/系统回收；本轮未手工删除历史证据。当前宿主GPU只读模拟器与61328隔离服务保留用于外观迭代，WebView APK约249MiB、截图和失败记录留存。峰值预算3GiB，复用原AVD/SDK/JDK/依赖缓存，磁盘最终量见 `closeout-mobile9.json`。不把并发磁盘变化当作精确清理收益。
