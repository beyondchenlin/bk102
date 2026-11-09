# 文案剪辑插件技术方案

版本：0.1 · 日期：2026-11-07 · 状态：评审方案，未实现、未进行媒体性能验收。

依据：[PRD v0.1](copy-edit-plugin-prd.md)；执行顺序见[开发计划](copy-edit-plugin-development-plan.md)。本稿复用 `build-spec` 的组件、数据流、接口及验证结构，不引入黑客松工作流。

## 1. 结论与关键决定

推荐采用 **标准 DSH 插件负责产品与业务，DSHA 提供通用原生媒体能力** 的组合。文案库、AI 修改、版本、服务器检索、工程、时间轴和贴片设计放在插件中；Android 文件授权、精确解码、原生预览画面、媒体合成及导出任务由宿主能力提供。桌面使用同一插件和工程格式，连接桌面媒体适配器。

这条路线有可行的基础，但不是一个纯前端插件就能完整交付的工作。主要风险为：逐帧与可变帧率的对应、多轨连续预览、WebView 与原生画面的协作、编码器差异及后台生命周期。**先做媒体可行性验证，再投入完整编辑器开发。**

| 决定 | 建议 | 原因 / 条件 |
| --- | --- | --- |
| DSH 接入 | 同一 npm 插件组合包，包含 Host 与 Client 两个运行面 | 保持 DSH 插件、插槽、服务和工具生命周期，不另造宿主 |
| 第一批手机 | Standard / Android 11+ 路线 | 与现有 Standard minSdk 30 一致；Low 保持文案和工程阅读能力，媒体另行验证 |
| Android 引擎 | 优先验证 Media3 Transformer + CompositionPlayer，精确选帧另有控制层 | 利用系统解码、编码与 GPU；实验性预览隔离在适配器中 |
| 依赖基线 | Media3 1.11.1 作为调研后的候选锁定版本，不使用动态版本 | 当前官方稳定版；仍需 AAR、API、设备行为验证，不等于已采用 |
| 预览显示 | 原生 Surface 显示画面，Web UI 显示时间轴和工具 | 不把每帧转 PNG / Base64 经 JS 桥传输 |
| 首版视频输出 | 提议 MP4 / H.264 / SDR / 30 fps，音频 AAC；画布支持 1080×1920 与 1920×1080 | 先保证常用短视频闭环；编码参数仍需目标设备测试 |
| 多轨范围 | 完整编辑模型；首批验证主视频 + 一路叠加视频 / 图片、贴片、字幕、配音、BGM | 不承诺无限并行解码；六条逻辑轨道不等于六路视频解码 |
| 桌面媒体 | 可选 Node 媒体提供方 + 受控 FFmpeg 适配器；网页只负责 UI | 可随插件交付，具体操作系统、二进制与许可须锁定；纯远程网页不能冒充本机执行 |
| 未支持能力 | 显示限制并保留工程；不得静默降分辨率或转移到服务器 | 用户目标是手机本地完成，服务器输出不能顶替验收 |

截至查阅日，Media3 稳定版本和预览 API 的成熟度是两个问题：发布页列出稳定 1.11.1，但该版本 `CompositionPlayer` 源码仍带实验性标记。多视频序列在官方预览说明中仍列为开发中的能力。因此本方案推荐“验证后采用”，不宣称无风险。[版本记录](https://developer.android.com/jetpack/androidx/releases/media3)、[1.11.1 源码](https://github.com/androidx/media/blob/1.11.1/libraries/transformer/src/main/java/androidx/media3/transformer/CompositionPlayer.java)、[预览限制](https://developer.android.com/media/media3/transformer/compositionplayer)。

## 2. 当前代码核查与不能误用的现有能力

本轮核查工作区 HEAD 为 `f90082e5`，但工作区已有其他任务未提交修改；本稿不是该提交的完整冻结快照。当前 README 为 BK102 分支说明，尚未完成 ARM64 真机运行时验收。实际目标仍应由实施前的冻结清单确认。

| 核查对象 | 当前事实 | 本方案判断 |
| --- | --- | --- |
| [DSH 运行时清单](../../tools/dsh-runtime/package.json) | 锁定 DSH 0.2.1-rc.2 | 插件先针对该版本，不把最新上游文档当成现有 API |
| [移动插件](../../app/src/main/assets/builtin-plugins/dsh-web-mobile/package.json) | 3.2.1；有 Host、Client 和组合补丁 | 可参考真实包结构，不能复制其全部宽泛兼容声明 |
| 当前运行时 UI 包 | `sidebar.panellist` 为 root list；`main` 为 keyed；`selectPanel()` 验证面板存在 | 单入口与主面板可由插件注册，无需新增原生业务底栏 |
| [移动返回实现](../../app/src/main/assets/builtin-plugins/dsh-web-mobile/lib/client.js) | `createPanelExit` 汇总系统返回、侧栏重复点击和 FAB；对子页存在既有 DOM 特判 | 需要通用子路由返回扩展；不能假冒插件管理页类名 |
| [Gradle](../../app/build.gradle) | Java 17；Standard minSdk 30、Low minSdk 23；当前无 Media3 / ExoPlayer 依赖 | 原生媒体引擎是新增工作，不能算已具备 |
| Java 源码媒体检索 | 未找到 MediaCodec、MediaExtractor、MediaMuxer、Transformer、CompositionPlayer 的剪辑实现；虚拟屏使用 ImageReader | 虚拟屏截图不是视频编辑引擎，也不能拿录屏充当导出 |
| [WebFileActions](../../app/src/main/java/com/deepseekharness/app/ui/WebFileActions.java) | `DshaFiles` 限当前可信顶层网页，接收 Blob 保存 / 分享；分享请求限 32 MiB | 可复用文件交付经验，但不适合把整部成片反复传进 JS Blob |
| [WebTransferPolicy](../../app/src/main/java/com/deepseekharness/app/util/WebTransferPolicy.java) | 下载限额 2 GiB、选择文件限额 5 GiB，有暂存余量检查 | 这是传输限额，不是手机可编辑视频大小或性能承诺 |
| [WebPreviewActivity](../../app/src/main/java/com/deepseekharness/app/ui/WebPreviewActivity.java) | 已有文件选择、页面身份和生命周期处理；不可见时会暂停 WebView | 原生预览和导出不能只绑在网页播放或 JS 定时器上 |
| [BridgeRoutes](../../app/src/main/java/com/deepseekharness/app/util/BridgeRoutes.java) | 有文件导出、分享、设备等路由，无媒体编辑路由 | `/app/export` 是文件交付，不是视频编码 |
| [HttpShellService](../../app/src/main/java/com/deepseekharness/app/HttpShellService.java) | 当前代码 `BRIDGE_PROTOCOL = 3`，与部分历史文档中的 2 不同 | 能力探测优先；不能以协议号等于某值判断媒体支持 |
| [AndroidManifest](../../app/src/main/AndroidManifest.xml) | 有现有服务类型，无专门媒体处理服务 | 若要求后台编码，需新增适当服务和生命周期，不能借用既有保活承诺 |

本轮只读了实际代码、运行时选定模块和官方资料，没有安装依赖、构建 APK、启动 DSH、调用模型或操作手机。

## 3. 方案对比与职责划分

### 3.1 四条媒体路线

| 路线 | 可以做到 | 主要代价 | 结论 |
| --- | --- | --- | --- |
| HTML video / Canvas / WebAudio | 轻量播放、贴片编辑、时间轴 UI | 多播放器同步、精确落帧、编码器与后台差异需要自行解决 | 适合 UI 和降级预览，不能作为全部手机媒体保证 |
| WebCodecs + 自建合成 / 封装 | 支持环境中可逐帧解码和编码 | 还要解封装、混音、合成、封装、流量与资源管理；硬件偏好不等于硬件保证 | 可保留桌面浏览器适配方向，不作为 Standard 首发主引擎 |
| 插件内 FFmpeg / WASM 或 proot FFmpeg | 软件处理和格式工具链较完整 | WASM 性能、内存；proot Linux 程序不能假定直接使用 Android MediaCodec / Surface | 不选手机主要导出路径；桌面可用原生 FFmpeg |
| Android 原生 Media3 / MediaCodec | 可接系统编解码、GPU 及原生生命周期 | 需改宿主；多轨预览及精确时间语义仍须验证 | 推荐优先验证，插件保持平台中立 |

WebCodecs 的硬件选项是偏好，浏览器可不采用；其 API 也不是现成编辑器。[W3C 规范](https://www.w3.org/TR/webcodecs/)。ffmpeg.wasm 官方自身提示其性能不同于原生 FFmpeg，不能用桌面 FFmpeg 成绩推算手机 WASM。[官方性能说明](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/apps/website/docs/performance.md)。

### 3.2 哪些需要修改宿主

| 功能 | 插件可完成 | 宿主变化 | 公司服务 |
| --- | --- | --- | --- |
| 侧栏入口、两卡首页、文案库、AI 修改、版本 | 是 | 无业务 UI 改动 | 公司模型为可选 |
| 多行贴片源、Canvas 生成 PNG、模板与历史 | 是 | 首版无需专用字体引擎 | 无 |
| 文案检索视频、候选、下载、任务状态 | 是 | 可先复用文件通道；大媒体注册需媒体桥 | 必须提供相应接口 |
| 工程、时间轴、撤销 / 重做、分镜关联 | 是 | 不在原生写第二套工程业务 | 无 |
| 子页面 / 系统返回一致 | 插件负责内部导航 | 修改随包 `dsh-web-mobile`，增加通用返回契约；不必改 DSH 核心 | 无 |
| 普通文件选择与已有文件分享 | 部分可复用 | 已有通道；不等于零拷贝大视频流程 | 无 |
| Android 素材句柄、精确帧、连续混合预览 | 插件发命令和展示状态 | 新增媒体适配器、原生画面承载和安全桥 | 无 |
| Android 1080p 本地合成导出 | 插件提交工程快照 | 新增编码引擎、任务持久化、输出交付 | 无 |
| 后台导出 | 插件查询状态 | 服务、通知、超时、取消、资源释放 | 无 |
| 桌面本地导出 | 媒体提供方可随插件安装 | 通常无需改 DSHA；依赖桌面实际 DSH Host 权限 | 无 |
| 团队发布、TTS、字幕、远端生成 | 插件消费服务 | 不应塞进原生宿主 | 需要提供任务与资源协议 |

这里的“需要宿主变化”针对推荐的可靠手机实现，不是宣称所有浏览器都绝对不能处理视频。若坚持完全不改 DSHA，可以交付文案和工程 UI，但目前没有依据承诺 PRD 的完整手机媒体体验。

## 4. 总体架构与运行边界

```text
同一个 dsh-copy-edit 插件（暂定包名）
  Client：侧栏 / 文案 / 时间轴 / 贴片编辑 / 本机交互
       │ DSH 既有 RPC / 状态服务
  Host：CopyEditService、版本库、工程事务、工具注册、任务编排
       ├─ CompanyAdapter → 检索 / 素材 / TTS / 团队服务
       ├─ DesktopMediaProvider → 受控 FFmpeg / 预览缓存
       └─ AndroidMediaProvider → 已认证的 DSHA 原生媒体桥
                                  ├─ MediaAssetBroker
                                  ├─ NativeFrameInspector
                                  ├─ NativePreviewSession → Surface
                                  └─ MediaExportJobs → Transformer

Android Client 的本地画面承载 / 低延迟控制 → 有界 WebMessage 通道
业务真相仍在 Host；原生任务只处理已冻结工程与已授权素材
```

### 4.1 平台与执行位置

必须区分浏览器所在设备、DSH Host、原生媒体执行设备和公司服务器。桌面独立运行 DSH 时，可以使用桌面媒体提供方；电脑访问手机工作台时，Host 仍在手机。远程浏览器不能得到手机 Surface，也不能把手机执行称为电脑本地导出。

能力返回必须包括 `executionLocation` 和 `surfaceMode`。本机 Android 使用原生 Surface；远程访问手机时可播放宿主生成的代理预览、请求手机导出，必要时要求手机前台接纳任务。纯远程网页默认不承诺背景唤起手机执行编码；如需电脑独立计算，应连接电脑本地的 DSH / 媒体提供方。

### 4.2 插件与宿主的变化粒度

DSHA 新增的是通用媒体原语，不认识“文案库”“老师”“模板分类”。插件停用后文案业务入口撤销，宿主通用能力可由以后其他插件复用。DSH 核心不新增该业务分支；安卓能力升级需 APK 更新，普通文案 UI 和模板变更仍走插件更新。

## 5. 严格遵循 DSH 插件规范

### 5.1 包、构建与依赖

暂定一个 `dsh-copy-edit` 发布包；名称在正式发布前核对冲突。包的组成如下，代码片段仅表达目标结构，不表示已存在文件：

```text
package.json       name/version，dsh.bundle.patch，dsh.client，明确 exports
cordis.patch.yml   insert 本插件条目，稳定 id；不覆盖宿主其他条目
lib/index.js       Host：业务服务、工具、RPC 和媒体提供方
lib/client.js      Client：DSH 认可的浏览器模块构建产物
lib/types/         类型及相应服务 / slot 声明
assets/            图标及确有分发权的基础资源
```

遵循本地[安装合同](../plugins.md)：`dsh.bundle.patch` 所指文件真实存在；声明的入口与导出必须存在；完整发布包经过真实宿主安装和加载检查。客户端声明 `dsh.client.platform = web` 及需要的依赖，导出 `./client`。Host / Client 分开编译，浏览器 bundle 不引入 Node fs、凭据或桌面二进制。

DSH 依赖、Cordis、React 与构建工具以目标 0.2.1-rc.2 的实际契约锁定。不能额外打包第二份 React 或 Cordis，也不能照搬最新上游工具链去改全仓。插件可有独立构建目录与锁文件，沿用其确定后的包管理器。发布前检查 npm pack 内容，避免携带素材库、缓存、密钥和本机路径。

### 5.2 服务、界面和工具

- Host 注册 `CopyEditService`（拟定服务名），负责文案、版本、工程、任务、素材授权；Client 通过目标版本正式通信机制访问，不新增绕鉴权的裸 HTTP 端口。
- UI 注册到 `sidebar.panellist` 与 `main`，入口和主面板使用相同稳定 id；共享宿主主题、本地化与原语。依赖声明、插槽类型和注册回收须在锁定运行时实测。
- 模型工具使用 `@deepseek-ai/dsh-tools` 的 `defineTool` 与工具 registry。已在随包模块核对到 `defineTool()` 和 `register(definition)`；输出 schema、权限、结果呈现和 disposer 必须按该版本合同提供。
- 工具只调业务服务，不让模型直接拼 FFmpeg shell、传原生任意文件路径或控制 UI 坐标。查询与变更分开，传入 `projectId`、`expectedRevision`、`operationId`。
- 挂载 / 停用遵循 Cordis 可撤销副作用：释放自身注册、定时器、订阅、预览与未提交操作；已经被原生明确接纳的导出按独立任务记录收尾，不能丢成孤儿。

Host / Client RPC 的具体注册签名应从 rc.2 类型和随包实例冻结，不能因为最新上游使用某个服务名就直接调用。第一阶段以最小服务往返、事件重连和热停启证明该接缝。

### 5.3 手机返回契约

拟新增一个通用、可选的面板导航提供方（名称待确定，例如 `PanelNavigationProvider`），由随包移动适配插件消费，提供活动面板 id、子路由深度、关闭弹层、回退一层及生命周期回收。此名称是提议，不是声称上游已有 API。

三种返回入口优先处理弹层，再回插件子路由，最后调用现有面板退出。没有提供方的其他插件继续走原逻辑。浏览器 history 由唯一协调器管理，禁止移动插件和业务插件各 push 一套记录。预览原生层在离开、抽屉或弹层遮挡、页面身份失效时撤销显示，不得覆盖宿主聊天和错误页。

正式 DSH 设计参考：[架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md)、[客户端模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)、[UI Slots](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.md)。这些浮动文档只说明方向，兼容证据以当前包为准。

## 6. 工程数据、存储与统一渲染描述

### 6.1 一份可版本化工程

采用 JSON Schema 约束的 `ProjectSnapshot`，经过验证后编译为平台中立的 `RenderPlan`。UI 操作、AI 工具、原生预览与桌面导出不能分别拥有自己的剪辑真相。

```text
ProjectSnapshot
  schemaVersion / projectId / revision / baseRevision / documentVersionId
  canvas: width, height, fpsNumerator, fpsDenominator, colorPolicy
  assets: assetId, contentHash, mediaInfo, stickerRevision, availability
  tracks: role, order, enabled
  clips: clipId, assetId, startFrame, durationFrames,
         sourceInUs, sourceOutUs, transform, opacity, volume
  captions: cueId, startFrame, endFrame, text, styleRevision

RenderPlan
  schemaVersion / projectRevision / planHash / assetHashes
  timebase / renderPolicyVersion / ordered visual layers / audio schedule
```

该模型是拟定合同，数值范围、schema 与迁移要在开发中落成。所有帧号为整数，时间戳为有界的整数微秒；禁止用字符串形式时间码或 CSS 位置作为存储真相。输出帧时刻由有理数计算，转换边界才取整，不能反复累加 `33.333` 毫秒。

剪裁范围统一为半开区间 `[sourceInUs, sourceOutUs)`，工程区间为 `[startFrame, startFrame + durationFrames)`。替换素材必须重新验证范围。项目分辨率或帧率变化形成新修订并显式重映射，不直接重解释旧数据。

### 6.2 存储与事务

初期文案和工程规模较小，建议 Host 使用不可变 JSON 修订 + 原子 HEAD / 索引 + 单写者队列，避免为了文案引入另一套原生数据库依赖。更新带 `expectedRevision`，不匹配返回冲突；临时写入、同步落盘、原子替换与崩溃恢复须验证。大规模检索由公司服务承担。

保存根由用户选择的工作区明确授权，插件只管理自己的子目录；工程引用素材身份，不把绝对路径塞入可分享文件。内容摘要用于去重与失效检查，不能替代文件访问权限。

素材原件、生成 PNG 和已提交修订与缩略图 / 波形 / 代理缓存分开。原生任务记录在 rootfs 外的私有目录，使 DSH 重启后可查询；这不意味着应自动把大视频加入现有宿主备份。首版提供插件工程导出 / 导入清单，明确哪些素材携带、哪些只是公司引用；现有 v5 备份与外部工作区规则保持不变，是否增加原生恢复适配需单独审查。

### 6.3 贴片与字幕

Client 在用户编辑时用 Canvas 与实际可用字体生成带 Alpha 的 PNG，保存原文字、换行、样式、字体摘要、渲染版本和 PNG 摘要。以保存后的 PNG 作为跨端视觉真相，导出时不再让 Android 和桌面各自排一次字。

生成前等待所需字体实际加载，按素材画布尺寸绘制而非直接套用屏幕 DPR。字体加载失败保留草稿并说明原因，不把浏览器回退字体生成的图片当成指定字体成品。

未提供源的 PNG 只能进行图片操作；AI 改字形成新的源与成品，不篡改旧资产。字幕以独立 cue 表存储，首版可将每个 cue 也渲染为缓存图片，由同一层调度显示；避免 Web DOM 字幕和最终字幕采用不同字体布局。

PNG 坐标以工程画布为基准，转换为合成矩阵；透明度、预乘 Alpha、sRGB 与视频 SDR 转换集中处理。棋盘格不进入纹理。生成任务失效键至少含源、样式、字体及渲染版本。后台 Agent 无 Client 渲染能力时明确返回 `RENDER_PENDING`，下次打开由受控渲染器完成；不得把只有文字的贴片谎称为可导出 PNG。

## 7. 手机逐帧剪辑

### 7.1 两种“帧”不能混用

工程时间轴的前后按钮默认移动一帧项目画面：`t(n) = n × fpsDenominator / fpsNumerator`。源文件可能是 25、29.97、30、60 fps 或可变帧率，源帧有自己的展示时间戳 PTS。30 fps 工程中移动一帧，不保证恰好跨一个 60 fps 源帧。

剪裁详情可提供源帧检查模式，以实际源 PTS 前后移动，确定精确源入点 / 出点。最终仍按项目帧率输出；不同帧率会丢帧或重复帧，不能承诺保留全部源帧。设置后立即显示按工程采样规则得到的首尾画面，让用户检查实际结果。

### 7.2 精确选帧路径

1. 导入探测获得轨道、方向、时长、色彩、关键帧和时间信息；索引使用实际样本 / 解码 PTS，不用“秒数 × 标称帧率”估算源帧身份。
2. 跳到目标前的同步样本，使用解码器顺序解码到目标。B 帧要按展示时间处理，不能把压缩包读取顺序直接当展示顺序。
3. 通过解码输出 `presentationTimeUs` 确认选中的源帧，返回源帧身份、请求序号和工程修订；迟到回执不能覆盖最新播放头。
4. 目标画面进入同一渲染计划的合成路径，叠加当时应出现的贴片、字幕和其他画面。UI 在画面真正就绪后更新“已显示帧”，不以发出 seek 请求冒充完成。
5. 源入点包含选中帧；用户以当前源帧设结束时，内部出点取其下一个展示边界，确保半开区间含义一致。最后一帧按已验证时长确定边界；异常时间戳须明确失败或先规范化。

首选复用系统 / Media3 解封装和解码组件；`NativeFrameInspector` 管精确 PTS、取消及缓存。`FrameExtractor.getFrame(positionMs)` 可用于缩略图或初步验证，但它接收毫秒并返回代表帧，不能仅凭方法名宣称满足所有源帧定位；验收不满足时使用基于 MediaExtractor / MediaCodec 的定向解码。其默认精确模式也需从前一关键帧解码，不可能保证所有拖动都瞬时完成。[FrameExtractor 文档](https://developer.android.com/reference/androidx/media3/inspector/frame/FrameExtractor)。

### 7.3 时间映射与性能

项目帧时刻映射到片段源区间，选择覆盖该时刻的展示帧；映射规则及取整策略写进 `renderPolicyVersion`。源剪裁时长不能整除项目帧时长时，按确定规则量化项目持续帧数，并预览实际末帧；不在预览与导出各自四舍五入。

拖动时可以显示低分辨率临时预览，但释放或按逐帧按钮后必须等待精确帧。快速移动取消旧解码，复用同一解码会话，限制缓存和解码器数量。反向逐帧可从邻近缓存或前一关键帧重解，不把倒序读压缩包当成倒放解码。

1080×1920 的 RGBA 单帧约 7.9 MiB，一分钟 30 fps 全部常驻约 13.9 GiB，仅像素就不适合手机。初期建议精确帧缓存上限约 32 MiB、缩略图单独有界，最终预算随实测调整；任何长视频输入都不能先全量展开成帧图片。

### 7.4 导出也必须精确

首版走解码、合成、重新编码，不走 `-c copy` 或只切关键帧的捷径。Media3 ClippingConfiguration 提供微秒边界，但微秒参数存在仍不等于整个实现已满足帧语义。[裁剪接口](https://developer.android.com/reference/androidx/media3/common/MediaItem.ClippingConfiguration.Builder)。

注意单素材可能触发自动直通；不能只设 `setTransmuxVideo(false)` 就断言一定编码。候选 1.11.1 的 `Codec.EncoderFactory.videoNeedsEncoding()` 可用于明确要求重编码，适配器需委托实际编码器并记录最终执行路径。[固定版本接口](https://github.com/androidx/media/blob/1.11.1/libraries/transformer/src/main/java/androidx/media3/transformer/Codec.java)。

验证用嵌入连续帧号的视频，在非关键帧起止、B 帧、可变帧率、混合帧率、最后一帧和镜头边界比对预览与导出。正常播放或 API seek 无报错都不能代替该验证。

## 8. 连续预览与多轨合成

### 8.1 共用时间轴和时钟

将已冻结 `RenderPlan` 编译成 Media3 `Composition`：主视频顺序拼接；图片 / PNG 作为有时间区间的效果层或图像序列；声音按工程时间调度。播放从全局播放头开始，跨片段继续，所有轨道按一个媒体时钟同步。禁止用几个 HTML video 和 audio 的独立定时器拼出“同步”。

优先验证 `CompositionPlayer`。其默认单输入视频图不等于任意多视频叠加；需要多输入时明确配置相应 graph，并检查性能与功能。逻辑六轨可以先编译为一个视频图和统一音频计划，而不是为每条字幕或贴片启动一个播放器。[Composition 概念](https://developer.android.com/media/media3/transformer/composition)。

### 8.2 先满足真实业务，再扩展视频叠加

首轮验证主视频、静态 PNG 贴片、字幕、配音与 BGM，这是用户主要出片形态。对声音，先验证原生混音的多序列；若对应预览组合不稳定，可把配音 / BGM / 原声按同一音频计划预混成一条可缓存 PCM 音轨。修改音量或区间使混音缓存失效；不在 UI 假装已实时生效。48 kHz 双声道 16-bit PCM 一分钟约 11 MiB，适合有界磁盘缓存，不必为了预混重新编码全部视频。

再验证主视频 + 一路叠加视频，包含叠加片段进入 / 退出、间隙、透明 PNG、镜头衔接和音频。实测不能过时，不把“已有多轨 UI”写成多视频预览已完成，也不悄悄从 PRD 删除叠加轨。

### 8.3 预加载和编辑生效

预读后续片段的元信息、压缩数据、纹理及音频。解码器数量按实际设备预算分配，不为了“预加载”同时打开全部镜头；在两路视频叠加时，下一片段未必还有独立硬件解码器可用。

拖动或改工程产生新的预览代次，撤销旧请求、纹理和预加载结果。暂停时可以更新当前合成画面；播放中修改先形成新修订，在受控边界切换。切换有真实等待时展示准备状态，不播放旧修订却更新新时间轴。进度回调低频推送给 JS；合成和播放时钟不受网页渲染帧率支配。

### 8.4 原生画面与 Web UI 协作

在 WebPreviewActivity 的现有容器中增加独立 `MediaPreviewHost`。推荐验证 TextureView 持有 SurfaceTexture，再把生成的 Surface 交给播放器显式 Surface API；不假定 CompositionPlayer 接受所有 View 类型。也比较 SurfaceView 的功耗和层级行为，阶段 A 确定一种，不保留两套长期分叉。

插件预留预览矩形，可信本机顶层页面通过有界消息提交位置、安全区和可见性；宿主检查页面代次、尺寸范围及会话句柄，只在授权区域显示原生画面。播放、逐帧和时间轴按钮在该矩形之外。抽屉、弹窗、键盘、旋转、错误页、PiP 和返回必须触发正确的布局 / 隐藏 / detach，避免原生层挡住 DOM 或截图泄露旧画面。

PNG 和字幕最终在原生合成图上绘制；不能为了画面方便在 Web DOM 上叠一层、导出再按另一套坐标计算。高频视频帧不通过 HTTP / JS / Base64 回传。

### 8.5 可接受的备选路线

若实验性实时预览在目标设备上失败，备选是按工程修订生成低分辨率代理成片，由单播放器连续播放。精确静帧仍从源帧与统一合成规则获得；代理存在完整、明确的源时间映射，最终导出用原素材。

短期可先整段生成，避免分块 AAC 编码延迟与接缝；之后才评估按依赖失效范围重算。界面如实显示“预览准备中”。该备选能满足连续试听结果，但不具备即时编辑反馈，必须经过体验评审。若代理等待也无法接受，应重新选择媒体引擎或调整范围，不能继续堆 UI 掩盖底层失败。

## 9. 手机本地 1080P 导出

### 9.1 导出流水线

```text
用户发起 → 固定 projectRevision / planHash
  → 检查素材、字体成品、空间及设备编解码能力
  → 原生接纳任务并落盘 jobId
  → 解码源媒体 → 时间裁切与视频层合成 / 音频混合
  → H.264 / AAC 编码 → MP4 封装到任务私有临时文件
  → 验证实际分辨率、方向、时间戳、轨道和时长
  → 标记完成 → 用户保存 / 分享
```

Media3 Transformer 使用系统 MediaCodec 和图形处理能力，但系统是否提供、选中并成功运行硬件编码器仍需验证；应记录真实编码器名称与能力，不把调用 Transformer 等同于硬件导出。[官方简介](https://developer.android.com/media/media3/transformer)、[支持格式](https://developer.android.com/media/media3/transformer/supported-formats)。

### 9.2 能力探测与输出合同

查询编码器的尺寸、对齐、帧率、码率与格式支持，随后以短样本真实启动验证。能力表声明不代表长时、多解码器并行仍可达到同样性能；不能用手机 RAM 大小单独决定支持等级。[VideoCapabilities](https://developer.android.com/reference/android/media/MediaCodecInfo.VideoCapabilities)。

首版目标 SDR H.264、实际显示画布 1080×1920 或 1920×1080、30 fps、AAC 48 kHz。默认视频码率可从 8–12 Mbps 实测选取，不写死成画质保证。按 10 Mbps 估算，一分钟视频约 75 MB，另加音频及容器；导入原件、中间文件、代理和最终保存副本另算。

Media3 有编码回退行为，必须关闭不符合合同的静默回退，或捕获回退并停止待用户选择。1.11.1 的 `DefaultEncoderFactory` 提供 `setEnableFallback`。输出竖屏时可能使用编码尺寸交换和旋转元数据，应核对显示尺寸与真实解码画面，不只判断文件宽字段。[固定编码器实现](https://github.com/androidx/media/blob/1.11.1/libraries/transformer/src/main/java/androidx/media3/transformer/DefaultEncoderFactory.java)、[Transformer 导出合同](https://github.com/androidx/media/blob/1.11.1/libraries/transformer/src/main/java/androidx/media3/transformer/Transformer.java)。

仅设置最大帧率不一定产生期望的恒定输出时间网格。适配器须证明输入 VFR、混合帧率映射到 RenderPlan 时间网格的行为；需要时先做本地规范化中间文件并记录映射，不能在导出后随意改时间戳掩盖帧内容错误。HDR、10-bit、异常旋转和不支持编码先拒绝或经明确的规范化流程；不隐式改色。

### 9.3 资源、后台与失败

- 首版每设备最多一个导出，导出时暂停耗解码器的实时预览，仍可编辑文案或保存工程新修订；当前任务继续使用原快照。
- 独立 `MediaExportJobs` 持有任务，不由 Activity 或 WebView 销毁直接丢失。用户可见启动时接纳任务，通知提供进度和取消；不通过开机广播重放历史导出。
- Android 15+ 使用 `mediaProcessing` 前台服务和权限，处理系统超时并释放资源；Standard 的 API30–34 候选使用适用于本地文件处理 / 导出的 `dataSync` 服务类型，按版本选择启动类型并验证权限。两者由独立媒体任务服务承担，不挪用既有 `specialUse` 保活；若后台启动条件不满足，返回需要前台接纳的状态，不偷偷启动。前台服务仍不保证所有 OEM 息屏行为。[前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types)。
- 取消完成以编码器、文件和任务均进入终态为准。进程死亡后的旧任务标记中断 / 待核验，不假装续编码；用户重试生成新的 attempt，保留关联，除非该组合已证明可可靠恢复。
- 输出先在私有任务目录完成，成功后交付 MediaStore / SAF 或原生分享。避免将大 MP4 全部读入 Web Blob；复用现有交付逻辑的安全部分，不放宽 32 MiB Blob 分享入口来绕过内存问题。
- 预检峰值至少计算原件新增量、代理 / 中间文件、输出及发布复制，流式写入途中也检查空间。成功后只定向清理当前任务已不被引用的临时文件；保留可用成片和工程。

## 10. 拟新增媒体接口与错误合同

本节为设计合同，所有名称、端点和 schema 均尚未实现，不是现有 DSHA API。

### 10.1 MediaProvider 统一接口

| 操作 | 关键输入 | 返回与约束 |
| --- | --- | --- |
| `capabilities` | 执行目标、输出请求 | 协议、引擎、执行位置、可用格式、功能及未验证项 |
| `importAsset / registerAsset` | 用户选择的句柄，或授权工作区中的受控引用 | opaque assetId、摘要、媒体信息；不接受网页任意绝对路径 |
| `inspectFrames` | assetId、目标源位置、请求序号 | 实际 PTS / 帧身份、就绪状态，不返回整段帧列表 |
| `openPreview / updatePreview` | 已校验 RenderPlan、期望修订 | previewId、generation、当前状态 |
| `seekFrame / play / pause` | previewId、generation、整数帧 | 已显示帧及工程时间；旧代次失效 |
| `startExport` | planHash、输出合同、operationId | jobId、是否已接纳、执行位置 |
| `getJob / cancelJob` | jobId、任务权限 | 真实状态；取消请求与取消完成分开 |
| `deliverOutput` | outputId、保存 / 分享意图 | 系统交付结果；不返回私有 token 或裸路径 |
| `disposePreview` | previewId、generation | 清理该会话资源，不误关其他任务 |

能力至少细分：精确帧、顺序预览、静态叠加、多视频叠加、混音、1080p 导出、原生 Surface、后台执行。区分 `unsupported`、`available`、`verified`，实际机型验证结果必须带范围；不能只返回一个 `supported: true`。

### 10.2 两个通道，各有职责

**Host → Native：** 建议复用现有认证和路由基础，新增 `/app/media/v1/capabilities`、有界命令及任务查询路由，由专门 `MediaBridgeController` 处理。大媒体走文件句柄和流式传输，命令仅传小型 JSON；首版建议 256 KiB 上限，超限明确拒绝。现有 HttpShellService 的解析、长度和权限合同须单独适配，不直接在大类中塞编码逻辑。3090 凭据仅由 Host 读取，不交给浏览器。

**本机 Client → 原生画面：** 拟增加 `DshaMedia` WebMessage 通道，仅用于已创建预览会话的附着、位置、可见性和播放控制。沿用 `DshaFiles` 的可信来源、顶层、当前页面与导航身份检查，并增加 native session nonce / generation。离开后旧页面不能重新附着 Surface；外部浏览器和 iframe 无此能力。

同一个应用 UID 下插件不是强隔离安全边界，因此不能宣称 nonce 能防住所有恶意同 UID 代码。其用途是防止网页来源混淆、过期页面和误操作；能力与授权仍由宿主和用户意图确定。

### 10.3 素材与幂等

Node 下载的文件若要交原生读取，经过专门路径映射和 `NOFOLLOW` / 打开后身份核验：仅当前授权工作区或插件自有媒体目录。[GuestPaths](../../app/src/main/java/com/deepseekharness/app/util/GuestPaths.java) 当前只提供限定 rootfs 内的宿主到 guest 路径转换，不是现成的 guest 到宿主媒体访问授权器；新资产注册必须处理已授权挂载与打开后身份，不能简单拼接 rootfs 或把“存在 guest 路径”当授权。

原生 SAF 输入应流式导入到用户授权的受管媒体位置或保留有效 URI 授权；返回素材句柄，不能让网页直接操作 `content://` 私有映射。每个 RenderPlan 对所需素材做完整可用性检查，禁任意 URL / shell / 全盘扫描。

`operationId + planHash + outputContract` 共同约束导出幂等：同 operationId 同内容返回原 jobId，不同内容报冲突。状态包含 `QUEUED / RUNNING / SUCCEEDED / FAILED / CANCEL_REQUESTED / CANCELLED / INTERRUPTED / UNKNOWN`。错误至少区分能力不足、素材失效、空间不足、旧修订、权限拒绝、解码失败、编码失败和用户取消。未知结果先查询，不切执行设备自动重跑。

## 11. 桌面与公司服务器适配

### 11.1 桌面媒体提供方

首版桌面建议实现受控 FFmpeg 提供方，与 Android 实现同一个 MediaProvider 合同。Node 只通过参数数组启动已识别二进制，滤镜描述从已验证 RenderPlan 生成，不拼接用户 shell；字体效果仍使用已生成 PNG。源时戳、裁剪、变换、叠加、混音及时间网格规则不得在桌面重新定义。[FFmpeg 官方滤镜文档](https://ffmpeg.org/ffmpeg-filters.html)。

精确静帧由桌面引擎取得并回传受控图片资源；连续全效果预览先可用代理成片，按工程修订生成。若要桌面实时多轨预览，再评估 WebCodecs / 本地原生窗口，这不是 Android Surface 自然延伸出的能力。必须明确桌面首版反馈延迟，不把浏览器里能播放原片等同于能预览全部编辑。

验证 Windows 本机为首个建议桌面目标，其余系统逐个建立二进制来源、版本摘要、许可清单和运行回收记录。桌面只有远程浏览器而没有本机媒体提供方时，计算发生在已连接的 Host，UI 必须标明。工具退出核验进程身份、关闭输出句柄，不能按进程名结束其他 FFmpeg 工作。

### 11.2 公司接口草案

下面是待与公司服务器对齐的接口，不声称服务器现已实现；插件通过适配器映射已有接口优先，不强迫服务器照搬路径。

| 草案接口 | 最小合同 |
| --- | --- |
| `GET /v1/capabilities` | 可用检索、TTS、字幕、视频生成、同步能力，协议版本及用户权限 |
| `POST /v1/material-search` | 输入文案版本、句子 / 分镜 id、查询与数量；返回 assetId、建议 PTS 区间、来源、摘要、可用性；评分只作排序 |
| `GET /v1/assets/{id}/content` | 内容、总大小、摘要、ETag；声明是否支持 Range，不保证任意来源可续传 |
| `POST /v1/tasks` | TTS / 字幕等类型、输入版本和幂等键；返回 taskId，不长连接一直等待生成完成 |
| `GET /v1/tasks/{id}`、取消请求 | 返回真实进度、结果资产、错误及取消状态；结果未知仍可按原 id 查询 |
| 文案 / 工程读取与提交 | 不可变版本、资源依赖清单、ETag / expectedRevision、访问 / 发布权限；冲突保留双方内容 |

公司 API 认证与个人模型凭据分开，前者不放在项目包中。个人模型走 DSH 已配置且支持的 provider；不同工作区可有不同可用性，不能覆盖用户宿主默认模型设置。公司文案发送到个人模型的范围须遵守 PRD 的明确选择与公司规则。

### 11.3 一次创作的数据流

用户选文案 V3 → Host 以 documentVersionId 创建检索任务 → 公司返回按句关联的候选 → 用户选择并下载，完整性核验后注册素材 → Host 保存工程 R1 → Client 编辑得到 R2 → RenderPlan 绑定 R2、素材及 PNG 摘要 → 原生预览 → 用户发起导出，原生返回 jobId → 验证完成交付 outputId → 用户选择把 V3、R2 和成片发布。

任务结束时用户可能已经切到 V4 或另一工程；通知只附原对象入口，不跳转或覆盖当前编辑。AI 工具与手动按钮都执行这条数据链。

## 12. 拟定代码结构与变更范围

下列均为拟新增目录，当前未创建。插件最终可独立仓库发布；实施初期可放在当前仓库明确边界下，避免复制整个 Android 工程。

```text
plugins/dsh-copy-edit/
  package.json / cordis.patch.yml / lockfile
  src/domain/          版本、工程命令、时间映射、RenderPlan、JSON Schema
  src/host/            CopyEditService、存储事务、工具注册、目标版本 RPC
  src/client/          DSH 注册、路由、文案、时间轴、贴片与状态展示
  src/providers/       company、android、desktop 媒体适配器
  tests/               纯规则、真实 DSH 接入、跨引擎合同夹具

app/src/main/java/com/deepseekharness/app/media/
  MediaBridgeController / MediaAssetBroker / MediaJobStore
                       不依赖具体业务，统一能力及任务边界
app/src/standard/java/com/deepseekharness/app/media/
  Media3Engine / NativeFrameInspector / MediaPreviewHost / MediaExportService
                       Android Standard 实现，独立线程和资源生命周期
app/src/low/java/com/deepseekharness/app/media/
  UnavailableMediaEngine
                       显式报告未支持，不让依赖升级破坏 Low API23
app/src/main/java/com/deepseekharness/app/util/
  MediaRequestPolicy / MediaPathPolicy
                       纯逻辑与单元测试；不包含 Android import
```

保留现有 Java 17 工具链，优先以 Java 编写宿主适配；不为此引入整个 Compose 或新 App 框架。Media3 依赖先限定 Standard source set；共同接口不能直接引用 Low 无法加载的类。

需要小范围接入的现有位置包括：`app/build.gradle`、Manifest、WebPreviewActivity、原生页面消息与布局承载、BridgeRoutes / HTTP 正文合同、移动返回扩展和必要的 i18n。业务不加到 HarnessController，不让 HttpShellService 直接拥有编解码器。移动插件的本地差异通过既有受管补丁流程维护，不直接修改生成文件后丢失来源。

UI、原生能力和工程 schema 各自版本化，使用特性检测。旧宿主缺媒体能力时仍能读写文案；新宿主也不能把旧工程默默升级到不可回退格式。恢复、迁移和导出有独立版本，不借 APK 版本推导数据格式。

## 13. 风险、验证关口与范围判定

### 13.1 必须先做的四个验证

| 关口 | 最小实验 | 成功条件 | 失败后动作 |
| --- | --- | --- | --- |
| G0：DSH 接入 | rc.2 安装真实最小包，侧栏打开，服务往返，工具返回对象，停启 / 返回 | 注册可回收、无重复工具、无核心改写、手机路由不丢状态 | 先调整契约，不开始完整 UI |
| G1：精确帧 | 帧号 / 长 GOP / B 帧 / VFR 素材，正反逐帧、非关键帧剪裁 | 源 PTS 与已显示帧可核对，成片边界符合统一采样政策 | 独立原生精确解码或规范化；不使用 keyframe seek 顶替 |
| G2：连续预览 | 多镜头 + PNG + 字幕 + 配音 + BGM，再加一路叠加视频 | 从任意位置跨镜头，合成与音画同步正确；资源有界 | 验证单音轨预混 / 代理预渲染；不能满足则重新评估引擎 |
| G3：本地导出 | 同一工程做 60 秒 1080p 输出，含不完整取消与重开查询 | 文件可解码，显示尺寸和帧内容正确，设备执行、状态与资源记录完整 | 明确不支持设备 / 格式或改实现，不能用服务端代替 |

G1—G3 在原生小型验证界面通过后，还需在真实 WebView 混合 UI 中复测关键链路，单独 Activity 成功不证明与现有工作台兼容。

### 13.2 候选体验预算

以下是制定验证的建议预算，**不是已达成结果，也不是跨设备承诺**。在冻结首批机型后确定正式门槛，不能看到失败后再无记录放宽。

- 暖缓存逐帧可见响应 P95 先以 150 ms 为候选，冷跳转以 800 ms 为候选；统计请求到正确帧实际显示，不统计仅更新文字。
- 连续预览单次 60 秒观测不出现意外黑帧 / 错片，音画偏差先以不超过一项目帧为候选；另记录掉帧比例与最长卡顿。
- 精确输出的帧边界、轨道时间和选定贴片没有“允许差一帧”豁免；不同编码器的像素压缩差异不要求文件字节一致。
- 导出耗时、内存及温度先记录真实值；在目标机型上形成可接受范围后才写产品承诺。稳定性覆盖取消、失败、返回和多次重开，不用一个成功文件概括全部能力。

### 13.3 测试矩阵与证据

至少选择两种不同 SoC 的 Standard 真机，其中包含一台目标中端机；设备名单未提供前不宣称“普通手机都支持”。覆盖现有最低目标 Android 与较新后台限制版本、系统 WebView、短屏和字体放大；Low 独立记录降级范围。桌面先固定一个实际环境，不默认覆盖 Windows / macOS / Linux 全部。

素材矩阵先包括 H.264 / AAC、无音轨、44.1 / 48 kHz、25 / 30 / 60 fps、VFR、B 帧、旋转元数据、带 Alpha 的 PNG、字幕跨镜头、缺失素材、长 GOP；HEVC / HDR 按能力另列支持或明确拒绝。

纯逻辑验证时间有理数、区间边界、版本 CAS、任务幂等、路径与请求政策；Android 集成验证实际解码 / 合成 / 编码、服务回收与输出可播放。UI 验证入口、返回、软键盘、安全区、Surface 遮挡、旋转和错误页。宿主布局修改遵守 AGENTS.md 的 `LayoutAuditInstrumentation` 验收要求。

设备验证仍受当前仓库设备操作暂停规则约束。本次只制定步骤，不进行手机安装、启动、停止或故障注入；后续得到恢复设备操作的明确授权后，使用测试数据和适当隔离，不在生产数据上做破坏性实验。

## 14. 实施判断

文案与工程管理适合按插件实现，风险可控。难度集中在媒体：逐帧、连续合成预览和正确导出共同构成一个小型非线性编辑器，不能按普通聊天插件的工作量估计。

优先验证 Media3 是为了复用系统能力；若必须从底层自写完整解码调度、GPU 合成、混音和恢复，则工程规模会显著增加。该分支应在 G1—G3 后单独评审，而不是默认藏在“适配移动端”四个字里。

推荐继续条件：G0 确认插件规范可落地，G1 与 G3 证明准确性，G2 在实时或用户可接受的代理模式下通过。否则可独立推进文案模块，但不能以文案上线宣称完整剪辑目标完成。

本轮只创建技术方案和开发计划；既有应用修改、六张设计图、APK 和运行环境均不由本轮变更。没有新增工作树、下载媒体依赖、启动临时服务或产生测试视频。
