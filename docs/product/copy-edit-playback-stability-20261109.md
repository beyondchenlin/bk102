# 播放、尾音和 WebView 恢复 · mobile.22

2026-11-09。沿用 `E:/dsha` 和既有预览源码快照；只操作独立 `emulator-5580 / DSHA_API30`、`dsh.copyedit.spike`。未操作生产手机，未提交、推送或发布。以下区分应用修复、内核对照和实际验收范围。

**当前结论：修复已进入 mobile.22 预览 APK，两轮 review 完成；持续播放的严格逐帧门槛仍未关闭。** 无解码失败、结束位置和崩溃恢复的通过，不等于零丢帧或所有播放间隔均低于150ms。此包供隔离预览，不作为播放稳定性全部通过的发布结论。

## 交付

- APK：`E:/dsha/build/copy-edit-mobile/20261109/stability22/BK102-copy-edit-mobile22-preview-20261109.apk`
- 独立身份：`io.github.beyondchenlin.bk102.copyedit.preview`，`0.2.0-mobile.22-preview.20261109 / code19022`，Android 11+、ARM64、非调试。
- 307,115,630 字节；SHA-256：`35bd497ee0bf6559f9a8d135e219c9ac59d61dc5d3f33eb7ceb9108d89e3fa5b`。
- 沿用预览测试证书 `5833e632216fa67d9df78137c366fabb32e5332131e8529697fb81b1f31b1f7f`，不是生产 E7E3 签名。v2 签名和 16 KiB zipalign 检查通过。
- 内置插件 `0.2.0-mobile.22`，TGZ SHA `5a719ba240cd15e87fcb2ce8e7cd47aedcef3c9b33a0b41ebb87ecef1c43fd58`。24 个成员与实际 APK 逐字节一致，完整离线宿主和原生插件注册保留。
- 受管 runtimeId：`291087ca6e34dcd34c0c48fdbaaec483c6711cf83ecb1d02bde445d6183c09e8`。

## 修复及两轮 review

两轮由同一代理先后执行，不冒称两位独立审查者。

第一轮检查原生音频、资源生命周期和退出恢复：

1. 旧 4 秒输出的视频完整，但 AAC 解码只有 189888 个 48kHz 样本，比工程短约 44ms。临时编码入口计数证明完整 192000 样本已经送入编码器，缺口发生在排空阶段。最终组合补齐工程静音并追加 4096 个保护样本，再由封装器按工程端点关闭音轨；编码器诊断包装已移除。
2. 补齐器的复用 ByteBuffer 在最后小块仍保留旧 limit，首轮测试发现实际静音过量；明确设置 limit 后修复。输出读回增加 AAC 时长、包 PTS 顺序和尾部覆盖校验；MediaExtractor 的媒体时长需扣除 encoder-delay 后比较。缓存身份升级为 `native-plan-v3`。
3. 页面退役与读取并发时，旧 Range 流可能继续读取；现在每条流绑定页面代次，读取/关闭同步，新代次立即退役旧流。
4. `WebPreviewActivity` 在旋转/语言切换交接窗口曾换成默认 WebViewClient，渲染器退出会失去处理入口。补上交接期回调和销毁逻辑；复核又发现不能对仍将复用的 Retained 调用永久 `onCleared()`，因此拆分退役和最终关闭，清除旧脚本句柄并仅失效上传请求状态。

第二轮检查实际播放、错误恢复和精确 APK：

1. WebView 首帧已提交后，同帧 seek 不保证再发 rVFC。保留已知目标帧；挂载前已提交的未知首帧通过相邻定位再返回，仍等待真正目标帧。补齐同帧定位、迟到取消、首帧遗漏的回归。
2. 持续播放的错误/缓冲状态和 `video.play()` 未结算 Promise 原先可能一直等待。现在准备、播放启动、缓冲都有截止和取消；失败停止等待并报告，不自动重复业务或播放。
3. WebView128 把原生 60 秒成片报告成 60.032 秒。播放器以冻结工程端点收尾，重新播放由用户触发。
4. 强制终止渲染器后，原生成片重开出现 AAC 解码失败。文件摘要、等待释放、重新 load、独立 FFmpeg 对照及仅重新封装对照将问题缩小到字节读取；最终确认 WebView 对拦截流会再按请求 Range 调用 `skip()`，原实现已经预先 seek，非零范围被跳过两次。
5. 新增 `WebViewRangeStream`：首次 available 报完整资源长度，skip 仅执行一次；直接读取者也只得到约定范围。保留代次失效、并发关闭和有界读取。真实 WebView 校验头部、中段、末尾、后缀范围逐字节相同，HEAD 无正文、非法复合 Range 拒绝、分享/后台/旧任务退役通过。
6. 补跑历史四秒门禁发现实验 `SpikeEngine` 仍调用旧三参数编码入口，没有传入冻结工程帧数，触发 `OUTPUT_AUDIO_DURATION`。仅修正实验入口传入 snapshot；生产 `NativeMediaSession` 已正确传值。失败原件 `build/copy-edit-spike/android-20261109-150832` 保留；修正后的导出正确，但后述连续播放门槛仍失败，没有将其写成全绿。

Range 行为依据为固定 Chromium128 的 [InputStreamReader 源码](https://chromium.googlesource.com/chromium/src/+/refs/tags/128.0.6613.88/components/embedder_support/android/util/input_stream_reader.cc)。未通过的“改 MP4 元数据位置”试验已撤回，最终仍用原来的可流式封装；没有引入 FFmpeg 到 Android 生产链。

## 声音证据

原生 14 项实际 Android 测试通过，涵盖计划/任务状态、配音分割、BGM 源尾循环、补齐器的 44.1k/48k PCM、小块缓冲以及 4/60 秒输出。输出与测试为共享模块代码，完整 ARM64 APK 没有在该 x86 模拟器运行。

- 7 份实际输出的音轨展示时长为 4.000000 或 60.000000 秒。
- 最后 24.5ms 窗口两声道相关系数最低 `0.9999552712644258`，共同编码相位偏移 12 样本（250µs）。BGM 删除间隔峰值 0；配音分割与基线 PCM 完全相同。
- AAC 裸解码仍包含 960 个尾部填充样本，4 秒为 192960、60 秒为 2880960；不能将它表述为裸 PCM 样本数严格等于工程时长，也不外推所有外部播放器均精确处理 padding。

原件与结果：`stability22/native-nohw.log`、`final-audio.json`、`tail-*.mp4`、`segmented-*.mp4`、`voice-*.mp4`、`music-wrap.mp4`、`stability-proxy.mp4`。一次诊断通过 adb shell stdin 复制二进制被截断，已保存失败记录；后续改用 adb push + 私有目录复制 + SHA-256 核验，不能把该夹具失败归因于产品。

## 内核与设备边界

模拟器复用只读 AVD，先用软件图形，随后对照宿主 GPU；启动参数禁用模拟器 HardwareDecoder/Vulkan。中途有一次整个模拟器退出，原因未证实；早期“读视频导致”的猜测经核对当时页面实际被403阻止而纠正，不能当作根因结论。

WebView128 的原生成片三次强制退出/手动重开已在 Range 修复后通过，三轮60秒播放、六处定位、后台返回不自动播放也通过。然而完整工作台仍复现一次32位内核 SIGSEGV 空指针，故没有宣称应用代码可以消除所有第三方内核崩溃。

内核对照均限独立模拟器，保持同签名覆盖及原应用数据：

- AOSP128：保留初始失败和修复后的播放证据。
- 官方 Chromium snapshot `1738780 / 159.0.8153.0`：两屏 UI 和8次工作台重开通过，但媒体返回 `DEMUXER_ERROR_NO_SUPPORTED_STREAMS`，不作为最终播放环境。只从官方 ZIP 提取 WebView 成员，未下载整个环境。
- 最终采用 LineageOS WebView `156.0.8078.47`。来源是 [LineageOS 固定提交 a71893b](https://github.com/LineageOS/android_external_chromium-webview_prebuilt_x86_64/commit/a71893ba05acc77405e46262d458b47ab2b11e54)，实际358,908,264字节与 LFS SHA `a98312a1427ca5c029e30009cc4a002e90affe9370e42b7f93a88ee6425c1278` 一致。证书与先前官方测试包一致。安装 ABI 选项没有改变 WebView 的32位 primary ABI，不将版本更新误写成64位切换。

这些内核没有放入交付 APK。用户手机依然使用其系统 WebView。

156内核的软件图形阶段 `web-provider156-full.log` 同次3项通过（225.109秒）：真实RPC原生导出/Range逐字节/分享/退役；8次只读工作台重开；三轮60秒、六处定位、后台暂停且恢复不自动播放、主动重开退出的渲染器。另一次 `web-provider156-recovery.log` 连续3次强制退出和手动重开通过。三次播放结束位置都是60秒，解码错误列表为空。上述128与159结果保留各自版本，不混为同一矩阵。

## 图形对照与仍未通过的流畅度

- 软件渲染的独立60秒诊断排除准备/暂停时间后，最长活动帧回调间隔483.3ms，仅收到1768次回调。`web-active-frame-diagnostic.json` 保留。
- 切换 `-gpu host`、仍保持默认 GLES2 时，回调达到1800且最长50.1ms，但截图视频区域白屏、WebView报告丢1793帧；这不是通过。SDK37.2.13 的 `lib/advancedFeatures.ini` 明确说明默认 `GLESDynamicVersion=off` 会限制 GLES≤2；WebView日志出现 GLES3上下文创建失败。
- 仅本次启动增加 `GLESDynamicVersion`，设备报告GLES3.1（196609），视频截图恢复实际条码与字幕。未改全局SDK或基础AVD配置。第一次60秒：1788个唯一PTS，丢13帧，最长249.8ms；不能用环境修正宣称已解决所有掉帧。
- 同环境后续三轮60秒和恢复同次2项通过（196.253秒），三次结束位置60秒、错误列表为空；累计5392次回调/5400总帧，WebView丢帧计数8，最长活动间隔66.7ms。六处定位、后台返回不自动播放，以及3次强制退出/手动恢复通过。原件在 `host-gles/web-stability.json`、`web-renderer-recovery.json` 和 `host-dynamic-functional.log`。保留冷轮失败，不能仅取后一次间隔较小的数据宣布零掉帧。
- 原生四秒严格门禁在实验适配修正后：首轮120帧全PTS、最长133.38ms；缓存续播119帧全PTS、最长200.02ms，因此 **150ms门槛失败**。`build/copy-edit-spike/android-20261109-150938` 保存原件。独立 `--export-only` 读回通过：120帧、所有条码/PTS、贴片及音轨、4.000000秒；报告明确 `strictFourSecondGate=false`，没有准入或声称最新原生60秒严格播放通过。

帧回调与WebView计数均不是屏幕/扬声器录测。宿主GPU对照证明了一个环境配置错误，并没有把剩余卡顿归因已定为模拟器，更没有通过静音、删音轨或放宽150ms门槛过关。实验适配后的APK摘要为 `d6f32022be3953afacd39641a7d14914e9395b04044d0742fe1d088d8e48dd7d`；交付APK的11项冻结输入仍逐字节一致，交付字节未改变，见 `post-gles-inputs.json`。

两种手机配置在同一个独立模拟器顺序验收，均通过首页/文案/空剪辑/有素材剪辑、130%字体、边缘MotionEvent、横向溢出检查；结束恢复size/density。不是两台真机，也不是完整ARM64 APK截图。最终GLES3与实验适配更新后的文件在 `stability22/phones/narrow-151058/`（360×800）与 `large-151108/`（约412×915），其中 `android-editor.png` 为剪辑页，`android-home.png` 和 `android-copy.png` 为首页和文案页。软件图形阶段的143903/143914截图仍保留。

## 软件验证与未扩称范围

- 插件111项测试全部通过、0跳过，包含真实 Windows FFmpeg；typecheck/build通过。一次未设置媒体工具环境变量的运行有3项失败，设置既有路径后重跑通过，原失败保留。
- 范围解析/流生命周期4项 JVM 测试通过；宿主上传状态/导航等15项定向 JVM 测试通过。没有把这些测试写成完整 Activity 设备验收。
- 最终 `assembleStandardPreview`、`lintStandardPreview`、快照模块单测通过。Lint 0错误/致命、238警告，其中新增1条是交接期 `RequiresApi(26)` 对 Standard minSdk30 的冗余提示；该注解仍用于共享源码 Low 范围，未为消警告删除。
- 11个关联冻结源文件与当前工作树对应文件一致；实际 DEX 包含新媒体类；插件、受管安装文件、离线依赖和注册/重复注册/原生启停夹具通过。临时注册目录自动回收。
- ARM64完整 APK 首启、OEM后台/功耗、小时级耐久和所有系统WebView版本均未验收。`HOST_DEVICE_VERIFIED=false` 保留，Low 未交付。
- 三轮60秒属于无解码失败、定位、结束和恢复的功能验收，**没有放宽或宣布通过历史“全PTS/150ms”逐帧门槛**。帧回调不是实际屏幕/扬声器录测，不声称零掉帧。
- 新增内置插件在 Web 设置中关闭后的重启保持仍未适配；应使用原生插件页启停，范围同前版。

## 数据与空间

官方插件安装前后，隔离库 `state.json` 的 SHA 均为 `c3c2d3fdaea84dd895df1621af4660f26db222e7429fca2f17041c7907f53e40`，移动宿主文件摘要也相同。没有创建或改写工程来做本轮验收。

该摘要不同于上一轮交付记录：一个既有工程在本轮期间13:05:29被更新，来源未证实；发现时即保留当前内容，没有拿旧快照覆盖。安装前后以当前完整摘要核验，不能宣称原25个工程仍与上轮全部相同。

未新增 worktree/clone。`apk-preview/source`、已有依赖、历史 APK/截图继续保留；此前快照删除被拒绝，本轮继续复用，未重试删除。本轮证据根为 `E:/dsha/build/copy-edit-mobile/20261109/stability22`。APK、SHA、两套最终截图、WebView复现下载、必要失败原件和构建快照保留；隔离宿主61328继续运行。

独立模拟器已正常停止；待其20秒退出辅助进程结束后，核验精确边界、祖先无重解析点、无运行引用、独占文件锁和更新时间，回收16个本轮COW/启动临时文件。逻辑5,271,800,818字节（约4.91GiB），Win32压缩存储字节返回相同；E盘空闲实测净增5,272,068,096字节，含分配舍入和并发写入，不冒充完整硬链接去重精算。清理前后E盘约21.53→26.44GiB，最终C/D/E约21.55/34.23/26.44GiB。未删除基础AVD、源码快照或历史证据。回执为 `emulator-stopped.json`、`cow-cleanup-plan.json`、`cow-cleanup-result.json`、`closeout-space.json`、`final-acceptance.json`。
