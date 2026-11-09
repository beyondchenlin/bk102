# 原生缓存播放与工作台验收 · mobile.23

> 2026-11-09 后续更正：用户安装后报告 `TRIAL_NATIVE_MODULES_FAILED`。精确 mobile23 APK 的两个插件模块虽然在 ZIP 内，却漏入实际安装清单；本页原来的注册夹具从源码复制完整插件，未发现漏装。旧 APK 按实际清单展开已复现 `audio-timing.mjs / ERR_MODULE_NOT_FOUND`。此版本不能继续作为首装可用交付；修复、负控和新的安装清单验收见 [mobile24 记录](copy-edit-mobile24-20261109.md)。以下播放证据保持原历史范围，不替代完整 ARM64 APK 首启证明。

2026-11-09。只使用独立 `emulator-5580 / DSHA_API30 / dsh.copyedit.spike`。复用既有仓库、依赖、只读 AVD 和预览构建快照，没有新建 worktree，没有操作生产手机或既有用户工程数据；没有提交、推送或发布。

本轮在指定模拟器环境通过原生连续播放和实际显示严格门禁。最终实现仍须区分播放中间隔与点击后的准备等待，不能表述为所有设备零丢帧。两轮 review 由同一主代理先后完成，不冒称两个独立审查者。

## 本轮改变

1. 缓存预览原来的约200ms停顿与音频结束时钟切换有关。按实际接受的PCM计数，等待真实AudioTrack playback head消费完毕后才stop；固定1倍速的相位插值替代逐次取最小值的漂移算法。暂停不冲洗缓冲，退出释放资源。
2. Android工作台仍保留网页控件，缓存画面改由共享Media3原生Surface呈现。首次准备绑定精确目标帧、后续真实解码缓冲和两个界面帧；使用异步codec及100ms提前提交，由原始时间戳安排显示。没有改变视频PTS、播放速度、丢帧策略或150ms门槛。桌面继续使用HTML播放器。
3. 新旧播放器、命令及页面代次隔离。遮挡、后台和渲染器退出暂停或退休对应对象，不自动重放。播放时保持屏幕点亮，关闭恢复原状态。沿用mobile22的Range读取与WebView交接退出修复。
4. 实际107帧工程暴露PCM末块越过时间线导致导出失败。按精确样本预算截断块内超界部分，工程内样本逐字节保留，原有AAC保护样本及封装裁切继续使用。44.1k/48k、单/双声道和提前结束新增回归。
5. 本模拟器的Surface解码没有正确应用缓存MP4旋转元数据。预览改成直接360×640编码，核验旋转为0；1080P成片仍保持原兼容策略。缓存身份升为`native-plan-v4/media3-1.11.1/`，避免复用旧结果。

直接竖屏编码开关行为核对固定版本 [Media3 1.11.1 Transformer源码](https://raw.githubusercontent.com/androidx/media/1.11.1/libraries/transformer/src/main/java/androidx/media3/transformer/Transformer.java)。Surface使用依据见 [Android Media3 Surface文档](https://developer.android.com/media/media3/ui/surface)。API30的帧呈现回调可能延迟或批量到达，因此另取SurfaceFlinger实际呈现记录，不能只以回调数量证明屏幕完整显示。

## 通过的证据

本轮证据根目录：`E:/dsha/build/copy-edit-mobile/20261109/stability23`。
验收APK SHA-256：`2e506729ab1f4c3680ade2f86877736d16b2a7169ec2871d177bb2d10b81f521`。
测试APK SHA-256：`cb275ce66181bc28df69486a2a9d30df1ee2f3810c1929428b0194782c40c919`。

| 检查 | 本轮结果 | 原件 |
|---|---|---|
| 实际显示，3×4秒 | 360/360帧；零缺帧；最大48.1134ms | `host-ready-four-gate.json` |
| 实际显示，3×60秒 | 5400/5400帧；零缺帧；最大64.7097ms | `host-ready-minute-gate.json` |
| 原生4秒播放与完整成片回读 | 首次120帧、缓存119帧（从33334µs起）；播放中最大33.454537/33.379564ms；导出及预览各120帧、4.000000秒 | `build/copy-edit-spike/android-20261109-205005/readback-report.json` |
| 原生3×60秒与完整成片回读 | 每轮1800PTS、正常结束；播放中最大33.513456/33.505789/66.66666ms；导出及预览各1800帧、60.000000秒 | `build/copy-edit-spike/android-20261109-205109/readback-report.json` |
| 原生控制与退出恢复 | 精确定位、快速定位、暂停续播、后台/遮挡、旧身份关闭、三次强制renderer退出和手动恢复通过 | `final-controls.log` |
| 共享逻辑 | 15项JVM测试，零失败/错误/跳过 | `sample-boundary-build.log` |
| 插件 | 118项契约测试，零失败/跳过；typecheck/build/pack通过 | `mobile23-contracts.log` |
| 两种手机布局 | 首页/文案/配音/空工程/剪辑、130%网页字体、点击检查通过 | `phones/narrow-205843`、`phones/large-205852` |
| 两种手机原生工作台 | 原生Surface、HTML无源、暂停位置稳定、缓存续播、rendererExits=0 | `phones/narrow-205920`、`phones/large-205931` |

实际显示与独立原生播放是两条不同证据链，不混用最大值。长测时钟跨度为59933.361305/59933.336191/59933.235147ms，目标59933.333333ms；实际显示跨度59932.9628/59925.0559/59932.8294ms，亦在一帧内。每轮全PTS和实际呈现逐项匹配，150ms上限及零缺帧要求未放宽。

60秒原生测试的启动至首个playing帧仍为208/204/262ms。这是准备等待，不能拿播放中33–67ms的结果声称点击即播。文件回读逐帧解码视频条码/PTS，检查60个配音脉冲、BGM及不同时间位置的贴片；不是只检查duration字段。4秒另外检查30个源帧定位。音频证明来自PCM与文件解码，不是物理扬声器录音；AAC裸解码padding与外部播放器行为的限制沿用mobile22报告。

## 两种手机外观

模拟的是两种尺寸，不是两台物理手机：1080×2400/density480（360×800逻辑屏幕）、1440×3200/density560（约412×915）。系统栏扣除后网页可用高度更小。

最终静态剪辑图：

![360宽剪辑界面](../../build/copy-edit-mobile/20261109/stability23/phones/narrow-205843/android-editor.png)

![约412宽剪辑界面](../../build/copy-edit-mobile/20261109/stability23/phones/large-205852/android-editor.png)

文案、首页及实际原生播放/续播截图均在同一证据目录。栏高沿用前轮统一40 CSS px、底栏含边界41px，BGM距底栏仅6px；360宽工具条可横向滚动。静态截图缩略图已加载完整；快速点击后的播放截图第二个缩略图仍显示加载占位。内部`native-preview-controls.png`属于诊断夹具，不作为产品UI。

## 两轮review与失败记录

第一轮实现/生命周期：`review1-implementation.md`。第二轮回归/交付边界：`review2-regression.md`。第二轮后仅修正打包工具对新增`lib/native-preview.mjs`的精确允许清单，恢复回执只有与当前输入完全相同才允许重试，未改变应用实现。

所有失败原件保留，不能把本轮说成一次连续全绿：

- 旧WebView156 HTML播放器3×60秒5328/5400，缺72帧、最大316.7ms；Android已改原生Surface，不能称HTML内核本身已修好。
- 旧时钟每分钟累积漂移116–133ms，负控仍拒绝旧实现。以首个实际显示时刻计算时钟跨度会混入首帧呈现延迟；已透明改为原始release时钟跨度±一帧，实际跨度另报。更正见`clock-gate-correction.md`，旧失败及`clock-span-negative-control.json`保留；零缺帧/150ms条件未改变。
- SwiftShader上的`final23-four`、`portrait-four`、`surface-ready-four`仍为359/360，早期一分钟5397/5400。PixelCopy试改没有解决，已撤回；不能宣称所有GPU配置通过。
- 实际工程1001错误最初误判为循环音轨释放，真正根因是107帧末块PCM超界。有限循环试改撤回；保留`export-cause.log`及失败设备日志。
- 工具按钮定位曾错误假定aria-label，外层150秒超时；改按真实按钮文案定位并给内部150秒测试190秒回执时间。保留失败，不能算产品测试通过。
- 最后包装预检第一次拒绝新播放器模块，核对仅新增该已冻结文件后修正清单。第一轮Gradle缺DSHA_PYTHON而中止；补回项目指定环境变量，失败日志`final23/build.log`保留。

## 环境与适用范围

最终API30/x86_64只读模拟器，WebView156.0.8078.47，宿主RTX4090/GLES3.1，Android软件codec，禁用模拟器HardwareDecoder/Vulkan；请求8核、系统实际在线6核，内存4GiB。没有以请求参数冒充设备实际值。WebView更新只在独立模拟器，内核不装入交付APK。

完整交付是ARM64独立预览APK；本x86模拟器运行的是相同原生模块和插件的非debug实验宿主，不能写成完整ARM64APK真机首启/长期验收。生产源码`HOST_DEVICE_VERIFIED=false`保持；独立预览快照才显式启用。没有所有厂商系统、旧WebView、Low版或超过本次3×60秒的保证。此前系统WebView128自身SIGSEGV及模拟器退出的历史原因不能统一宣称已消除。

## APK与收尾

- APK：`E:/dsha/build/copy-edit-mobile/20261109/stability23/BK102-copy-edit-mobile23-preview-20261109.apk`。
- 307,145,859字节；SHA-256：`e9e312e6384b60f1db7270258c93065edc2559a7db3ec441de74e58549fbd1ac`。
- 独立包名`io.github.beyondchenlin.bk102.copyedit.preview`，`0.2.0-mobile.23-preview.20261109 / code19023`，Android11+、ARM64、非debug。
- 沿用预览证书`5833e632216fa67d9df78137c366fabb32e5332131e8529697fb81b1f31b1f7f`，不是生产E7E3；APK v2签名、16KiB zipalign检查通过。
- 内置插件`0.2.0-mobile.23`，TGZ SHA-256：`9ef4db39b19c57d12969ed9d5373384a04e822fa40e270561f9d81d856827931`；实际APK的25个插件文件逐字节吻合。DEX包含本轮原生播放器和v4缓存契约，不包含独立实验Activity。
- runtimeId：`5da1ef2e23309fda7f2a303110381441f088d4464802ce7e7d4f18d26bcf4db5`。离线运行依赖、注册清单和受管摘要通过；真实注册脚本的首次注册、重复注册、原生禁用/启用检查通过。Web设置关闭插件后的重启保持仍为既有未适配项，不扩称完整插件管理矩阵通过。
- 最终快照2,108个冻结输入逐项复核，37个本轮原生源/测试文件与已验收源码一致。完整包构建成功（1分49秒），冻结模块15项JVM测试再验通过；Lint零错误/致命、239条警告。日志/签名/摘要/测试XML见`final23`，精确包证据见`apk-verification.json`、`delivery-receipt.json`。

复用`build/copy-edit-mobile/20261109/apk-preview/source`；构建前记录预计新增峰值1GiB，C/D/E可用约18.90/35.42/48.56GiB。C盘低于20GiB，因此没有复制环境或下载依赖；保持高于10GiB。没有新建或归档worktree。

模拟器已通过`adb -s emulator-5580 emu kill`正常退出，本任务只读夹具服务已停止。仅在进程退出、精确目录边界、祖先/文件无重解析点、mtime稳定、独占文件句柄均通过后，逐个删除清单24个COW/启动临时文件，没有递归删除：逻辑8,030,482,916字节、GetCompressedFileSize返回占用同值（约7.48GiB）。具体前后磁盘可用量见`cow-cleanup-result.json`；并发构建写入影响净释放量，不把盘上全部变化算成本任务清理。

清理前后E盘可用字节52,132,941,824→60,161,662,976，观察净增加8,028,721,152字节；这与文件计数占用略有不同。之后复制最终APK并保存证据，收尾C/D/E可用约18.90/35.42/55.37GiB。没有把并发任务引起的其他空间变化计入清理收益。

保留源码快照、mobile22旧包、mobile23交付、截图/必要失败证据、基础AVD和本机已有SDK/JDK/依赖缓存。没有删除或覆盖用户附件。隔离测试工程state.json最终SHA仍为`c3c2d3fdaea84dd895df1621af4660f26db222e7429fca2f17041c7907f53e40`。本机独立DSH验收工作台保留运行供后续查看。
