# mobile30：源帧映射与播放控制修复

用户在 mobile29 可以进入工作台，但播放时报 `NATIVE_FRAME_MAPPING_UNSUPPORTED`。截图显示 53 个源帧，而30fps工程区间约70帧。该错误来自 `FrozenRenderPlan` 的明确拒绝：旧实现要求源帧数量等于工程帧数量，且每个源PTS都必须严格位于30fps栅格。截图足以定位这道检查；没有用户原视频，不能据此确定原素材的具体帧率或编码器。

本次交付保持当前独立预览包身份，可覆盖 mobile29；常驻诊断导出功能保留。

| 项目 | 值 |
| --- | --- |
| APK | `build/copy-edit-mobile/20261112/playback-fix/BK-Harenss-mobile30-playback-fix-20261112.apk` |
| 包名 | `io.github.beyondchenlin.bk102.copyedit.preview` |
| versionCode | `19030` |
| versionName | `0.2.0-mobile.30-playback-fix.20261112` |
| 插件 | `dsh-copy-edit@0.2.0-mobile.30` |
| 字节数 | `307201655` |
| APK SHA-256 | `39c28518ccb5ffc64a4a861f854665d65bcfad7a3d1b8f0f297054d7ca2963b4` |
| 签名证书 SHA-256 | `5833e632216fa67d9df78137c366fabb32e5332131e8529697fb81b1f31b1f7f` |
| 受管运行时 | `d05fbc751d9d97518262c2e747338d1002b948426321a606514158fa67e3ab05` |
| 构建 | Standard、minSdk30、ARM64、非调试；同原预览签名 |

## 实现

- `SourceFrameMapping` 按实际PTS为每个30fps工程帧选择不晚于目标时刻的最近源帧，沿用插件 `timeline.sourceFrameAt` 的1µs容差。分割镜头保留原窗口和偏移，避免每段重新取整造成接缝错帧。计划摘要、资产授权、首尾PTS、输出总帧数与窗口边界继续核验。
- `SourceFrameEffect` 在Media3单纹理通道中重复低帧率帧、丢弃未选中的高帧率帧，输出固定30fps时间戳。纹理等所有重复输出归还后才释放；同步回调用循环防递归，结束信号等待末帧归还。没有逐帧建立解码器或复制整段视频。
- 每个镜头的效果时长等于其工程帧数，预览与导出共用。缓存契约升至 `native-plan-v5/media3-1.11.1/`，避免复用旧结果。
- 补测发现镜头效果变化时Media3重建GL链，原 `TimedSticker` 会返回已回收的Bitmap。现在释放本轮位图后，下一次使用从已授权文件重新创建；两镜头贴片回归恢复通过。
- 前一帧／播放或暂停／后一帧统一为44×44触摸区、20px线性图标、同底色和圆角。帧进退增加带竖线的方向三角，播放取消突出的大圆底；保留辅助标签、键盘操作、焦点和禁用态。
- 补齐 `NativePreview` 已使用的Media3实验API注解；锁定的依赖版本没有升级。

实现参考锁定版本的官方接口：[GlShaderProgram](https://github.com/androidx/media/blob/1.11.1/libraries/effect/src/main/java/androidx/media3/effect/GlShaderProgram.java)、[GlEffect](https://github.com/androidx/media/blob/1.11.1/libraries/effect/src/main/java/androidx/media3/effect/GlEffect.java)。

## 验证与边界

证据目录为 `build/copy-edit-mobile/20261112/playback-fix/`，所有媒体均为仓库自制小素材，没有读取用户工程。

- 共享媒体JUnit：23项通过，含8项新增帧映射／纹理生命周期检查。插件关联回归：34项通过，完整浏览器脚本解析和注册通过。
- 独立API30 x86_64模拟器运行生产 `NativeMediaSession`：VFR、60fps、24fps、29.97fps、B帧、非关键帧剪裁、三种分割窗口、混合帧率连续镜头；9组计划生成13个预览／导出文件。
- FFmpeg独立解码读回 **926帧**，逐帧条码均对应预期源帧，所有PTS误差≤2µs，显示尺寸与视频时长准确，AAC音轨时长误差<25ms。导出保留Media3旋转元数据，按显示方向检查1080×1920。
- 原生 `NativePreview` 实际播放VFR分割成片，暂停后时钟稳定，定位第17帧为0.566秒，播放至2.233秒结束，无播放错误，81次帧回调。此项验证播放器功能，不声称零丢帧或全设备流畅度。
- 原有计划身份／摘要／授权等3项、取消任务1项通过。原有两镜头／贴片／混音／旧修订拒绝测试在位图修复后通过。
- ego-browser连接隔离的真实DSH宿主，实际导入VFR素材并执行加帧、减帧、播放、暂停；320／390／1280宽度均为三键等大，无时间码遮挡、无横向溢出。截图与几何数据保存在 `controls-*-final.png`、`browser-controls.json`、`browser-responsive.json`。
- 媒体模块Lint零错误、9条警告；独立实验应用Lint零错误、16条警告。警告原件保留，未以本次修复宣称全部清零。
- 精确APK核验12项通过，包括28个插件文件与冻结包逐字节一致、受管描述符、实际DEX内新映射类／v5契约、正式依赖链和注册启停；签名v2及16KiB ZIP对齐检查通过。ZIP对齐不是16KiB设备运行证明。

失败记录分别保留：初次测试读取夹具误用了API33的 `InputStream.readAllBytes`，已改为有界流；读回检查最初未考虑导出旋转元数据，已纠正；原贴片位图回收回归已修；Lint补齐已有实验API注解；暂停测试改为等待异步停止完成后验证稳定时钟。浏览器初次测量包含鼠标悬停态及未完成的布局更新，最终回执使用静止指针和稳定布局。不称为首次运行全绿。

用户OPPO当前不能连接，本次未在该手机安装新APK，也没有用户原视频作原件复现。Android原生渲染／播放器、桌面网页交互及ARM64 APK静态完整性分别取证，不混称为手机端全链路验收。旧的长时流畅度和全编解码器兼容矩阵仍未覆盖。

## 构建与收尾

复用唯一工作区 `E:/dsha`、现有 `build/copy-edit-mobile/20261112/diagnostics/source` 构建快照、Gradle/npm缓存，无新增worktree。预览版本仅写入该快照，不改主工程上游发布身份。运行时资源通过现有描述符生成脚本更新，非替换Ubuntu基础环境。

构建前C盘28.18GiB、E盘40.81GiB。旧模拟器SDK路径不存在，补回当前SDK下缺失的模拟器、API30镜像及platform-tools；预计新增峰值8GiB。SDK保留复用，旧失败现场和此前被清理策略阻止的构建快照均保留。交付APK、冻结清单、脚本与必要测试证据保留。本轮隔离宿主与只读模拟器正常停止；临时覆盖层处理及最终磁盘读数见 `cleanup-inspection.json` 和 `cleanup-result.json`。

清理本轮 `playback-fix/emulator-temp` 时，环境自动审批返回 `blocked by policy`，未执行删除、未改用其他方式绕过。该目录保留逻辑大小859,774,884字节；不宣称释放这些字节。模拟器正常退出后的文件变化与本轮整个构建期并发写入分开看待，最终磁盘可用空间以 `space-final.json` 为准。

未上传公开Release、未改动实体手机数据。
