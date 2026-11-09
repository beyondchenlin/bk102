# 文案剪辑 Android 媒体验证

独立 Gradle 工程，包名 `dsh.copyedit.spike`、minSdk 30、Media3 1.11.1。媒体实现已迁入共享 `components/copy-edit-media`；实验工程独立输出到自身build目录。WebProbe仅访问授权的本机隔离DSH服务验证真实RPC和WebView媒体桥。没有生产DSHA安装、共享存储广权或后台服务。

当前状态：**mobile.22 已修复原生 AAC 尾部缺失、WebView 非零 Range 重复偏移和播放等待/恢复；严格逐帧门禁仍未稳定通过。** 当前原生 4/60 秒成片和 WebView 三轮 60 秒功能验收已有记录，不能与历史 NativePreviewPlayer 的全 PTS/150ms 门槛混用。旧包351373…、9d4586…的长间隔和丢帧原件保留；当前包的证据及边界见[播放、尾音与 WebView 恢复](../../docs/product/copy-edit-playback-stability-20261109.md)、[本轮进度](../../docs/product/copy-edit-mobile-progress.md)和[验收矩阵](../../docs/product/copy-edit-mobile-acceptance.md)。

## 构建与验证

复用 DSHA 根目录的 Gradle wrapper、JDK 17、Android SDK。先设置 `JAVA_HOME` / `ANDROID_HOME`，在仓库根执行：

```powershell
python experiments/copy-edit-media/scripts/fixtures.py
./gradlew.bat -p experiments/copy-edit-media :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

生成器默认复用 `E:/ffmpeg/bin`，可传 `--ffmpeg` / `--ffprobe`。五个视频共数十 KiB，两段无压缩测试音频共约 22 MiB，不下载素材。A/B 为 1080×1920、30 fps；另外保留 B 帧、VFR、60 fps 样本。亮度条码由独立 FFmpeg 生成，期望结果不由 Android 实现反向生成。

**先取得设备操作授权**，再执行以下命令。本轮仅授权现有空闲模拟器，没有恢复实体手机操作权限：

```powershell
python experiments/copy-edit-media/scripts/run-emulator-test.py --serial emulator-5580
# 将 runner 返回的目录填入下方命令，必须先过完整 4 秒门禁。
python experiments/copy-edit-media/scripts/verify-export.py <4秒证据目录> --seconds 4
python experiments/copy-edit-media/scripts/run-emulator-test.py --serial emulator-5580 --method minute --gate <4秒证据目录>/readback-report.json
python experiments/copy-edit-media/scripts/verify-export.py <60秒证据目录> --seconds 60
# 针对诊断：不经 Media3 的 Surface 对照，或只重测 4 秒导出链路。
python experiments/copy-edit-media/scripts/run-emulator-test.py --serial emulator-5580 --method rawSurface
python experiments/copy-edit-media/scripts/run-emulator-test.py --serial emulator-5580 --method cacheLifecycle
python experiments/copy-edit-media/scripts/run-emulator-test.py --serial emulator-5580 --method exportOnly
python experiments/copy-edit-media/scripts/verify-export.py <本轮证据目录> --seconds 4 --export-only
```

runner 限制 `emulator-*`，仅安装本工程应用及测试包。每次保留独立的 `build/copy-edit-spike/android-时间/`，只读回本次完成事件列出的成片，避免旧文件假成功。60 秒的准入报告绑定相同 APK SHA-256 和设备指纹，并要求完整选帧、全帧读回及中途起播通过。仅 `exportOnly` 不能准入 60 秒。MP4 的时长、分辨率正常不能代替准确性。

本机 SDK 37.2.13 的 `lib/advancedFeatures.ini` 默认关闭 `GLESDynamicVersion`，会把 GLES 限制在 2。WebView156 配合 `-gpu host` 时曾出现帧回调正常但视频白屏；仅本次启动增加 `-feature GLESDynamicVersion,-Vulkan,-HardwareDecoder` 后实际画面恢复。不得用帧回调替代画面检查，也不应修改全局 SDK/生产设备配置。软件渲染和宿主 GPU 的失败应分别保留；此配置只描述当前独立 API30 模拟器，不是通用性能保证。

## 已实现的边界

- `ExactFrames`：实际PTS索引、前一同步帧解码到目标PTS，夹具条码路径与一般素材路径分离。`NativeAssetTasks`复用首次索引，有界缓存64帧/32MiB；实际来回取帧与过期请求测试通过，尚无全格式矩阵。
- `SpikeEngine`：活动门禁输入由插件真实`compilePlan`生成，经`FrozenRenderPlan`核验修订/hash/资产/PTS/输出。共享`NativePlanComposition`支持单主视频、独立配音、循环BGM、多PNG和纯声音黑尾。旧固定演示仍保留，但不冒充新冻结计划证明。
- `SurfacePipeline`：已复现的 API 30 Goldfish 模拟器使用单帧背压；其他设备不套用该策略。`RawSurfaceProbe` 是只使用 Android API 的反证对照。
- 正常预览先生成 360×640 本地文件，复用相同计划和效果；在当前 Activity 内可复用固定计划缓存，从所选源帧对应位置连续播放。首次 4/60 秒缓存分别等待约 5/63 秒，不把这段准备时间隐藏为流畅播放指标；逐帧编辑继续使用源解码。完整工程缓存与增量失效仍未实现。
- `SpikeActivity`：±1 帧、连续播放、4/60 秒本地导出、错误与时间记录。切到后台取消导出；没有断点续导或前台服务保证。当前项目帧率限制 30 fps，未验证任意帧率素材导出。
- `NativeWebMediaBridge`：同源主帧、页面代次、前台生命周期、任务身份、Range结果与系统分享；Standard源码已接入但默认关闭，Low无Media3。实验桥明确`deviceVerified=false`，真实8项session/bridge/素材闭环与生产授权分开。
- `RenderSnapshot` / `MediaTaskGate` / `MediaArtifacts`：冻结修订与素材摘要、拒绝旧任务提交、会话缓存身份和文件校验、暂存文件成功后原子替换；取消只回收本实例登记的文件。当前不是通用项目数据库或跨进程任务恢复。

## 接入 DSHA 前必须完成

1. 在获准的 ARM64 实体手机验证解码器、Surface、精确导出与异步预览；软件模拟器不代表手机性能。
2. 评审首次缓存等待与修改后的局部失效体验；继续单独调查直接 CompositionPlayer 的剩余接缝延迟，缓存成功不等于直接预览通过。
3. 扩展任意 B 帧/VFR/60 fps 成片、变换和设备/故障矩阵；当前全成片样本是重复的低复杂度自制 A/B 30 fps 素材。
4. 在共享adapter源码基础上，验证实际手机DSH proot→同机Android闭环、完整UI/系统返回/键盘及保存目标。当前模拟器经adb reverse读取Windows隔离宿主字节，编码/索引确在Android，但不能称已验证手机生产拓扑。后台持续导出未实现。

本轮修改了 `WebPreviewActivity`的独立桥生命周期接缝与根构建模块声明；没有修改`HarnessController`、`HttpShellService`或增加3090媒体端点。模块自有FileProvider只开放专用cache子目录。`--software-preview`仅是显式诊断对照：当前模拟器未得到可用视频软件解码帧，失败原件保留，不能当默认降级能力。
