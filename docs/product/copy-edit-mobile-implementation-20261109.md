# 文案剪辑手机适配：实施与验收边界

09:10更新：当前mobile.12经过[两轮review与修复](copy-edit-title-review-twice-20261109.md)。版本切换先保护修改，菜单区分草稿/版本，只读查看复用副本；18项相关检查与最终桌面/Android有限检查通过。保留内核崩溃原件，不扩称稳定性完成。

08:25更新：当前隔离安装mobile.10；按用户要求去掉桌面/手机独立标题，以正文首句作所有作品展示名，其他草稿合入V1菜单。实现、截图和13项单测/浏览器/独立Android有限结果见[本轮记录](copy-edit-titleless-20261109.md)。播放与生产能力边界不变。

07:25更新：隔离安装已到mobile.9，用户指定优先外观。手机文案与剪辑布局重排、实际Android截图和7次成功/3次崩溃的有限矩阵见[最新外观记录](copy-edit-mobile-visual-review-20261109.md)。默认播放稳定性与生产验收仍未完成；下文mobile.6作为早期阶段记录保留。

本轮完成手机布局/触摸/草稿恢复和原生媒体源码接入，隔离工作台安装版本为 **0.2.0-mobile.6**。原生素材索引、精确取帧、真实工程RPC、Android编码、取消和分享经过独立模拟器验证。**默认连续播放尚未稳定通过150ms门禁，完整手机界面与ARM64生产拓扑仍未验收，因此Standard生产能力保持关闭。** 没有生产APK安装、公开发布或Git提交。

## 已交付实现

界面使用插件局部字号与间距，常用手机按钮44px。窄屏与横向短屏将素材、属性放入抽屉，保留桌面三条分隔线；调序需明确进入触摸模式，多指、取消、失焦不提交。裁切和贴片拖柄复用现有工程命令，±1帧/数值入口保留。正文不会随着超宽视口放大，作品PNG字体与像素尺寸不变。

草稿按文案库、工程、编辑者分开持久保存；多个窗口各有独占副本，恢复前保存当前副本。导航、版本、镜头与播放头保留，存储损坏/被禁/满额明确反馈。每工程最多100份副本，不自动丢弃用户草稿。宿主可选panel导航契约只回退一层；旧插件行为保留，插件不伪造宿主DOM或自行叠加pushState。

`components/copy-edit-media`承载共享Android实现，Standard工厂与`WebPreviewActivity`只持有桥生命周期；Low工厂返回null。未向HarnessController、HttpShellService或3090桥塞入媒体业务。根构建和独立实验模块输出目录分开，复用既有工具链/缓存。

客户端通过同源主帧WebMessage能力探测选择提供方。NativeImports只接收有界原始字节，Android MediaExtractor/MediaCodec负责实际索引与精确帧；方向/尺寸/PTS只索引一次，后续复用元数据并核验完整SHA。快速请求合并为最新待执行位置，迟到帧不能覆盖新位置。媒体二进制不经过消息桥base64。

`FrozenRenderPlan`核对项目、修订、计划hash、资产hash、实际PTS、帧预算和输出规格。后台、旧页面、旧请求、取消或计划变化不能发布成片；暂存输出经过帧数/PTS/方向/编码检查后提交，旧完整成片保留。start超时仅查询原身份，无桌面重发。结果通过随机身份的同源GET/HEAD与单Range读取；分享有accepted、opened、failed状态，打开系统选择器不表示用户已发送。

原生当前限制为CFR30、最长60秒、1080×1920 AVC/AAC导出与360×640预览，最多30个1080×400 PNG。支持独立配音、循环BGM、分时PNG和声音超出画面时的黑尾。VFR/非30fps映射、需要桌面限幅器的高增益组合明确拒绝。单素材256MiB、素材会话512MiB/240条、精确帧缓存64张/32MiB；后台取消，不做后台续导。公司TTS、素材检索、个人模型和团队同步仍需外部接口。

## 本轮验证

证据根目录为`build/copy-edit-mobile/20261109/`，详细项目见[验收矩阵](copy-edit-mobile-acceptance.md)。

| 验证 | 结果和证据 |
|---|---|
| 插件build/typecheck与完整业务检查 | mobile.4的92项通过、0失败/跳过，包含真实Windows FFmpeg；plugin-final-tests.log。mobile.6 build/typecheck通过，包逐成员对比仅CSS、版本及README改变，去除唯一CSS常量后client字节相同；本次按CSS影响执行浏览器复验 |
| 手机网页操作 | 多尺寸首页/文案、抽屉返回、调序/多指取消/裁切、贴片移动/缩放/时间、分割删除撤销及草稿跨标签恢复通过；layout-matrix、touch-cancel-trim、sticker-touch、concurrent-draft-reopen等JSON |
| 桌面回归 | 三条分隔线缩小/还原，Windows预览与导出，既有HMR协调补丁保全和10项测试；desktop-layout-regression、edit-flow等JSON |
| 宿主软件 | Standard/Low Java编译通过；两版WebPreviewPolicy/PreviewNavigation各6项通过；Range JVM2项通过；实验Lint零错误、13警告保留 |
| Android实际会话/计划/桥/导入 | native-final-035032：4+2+1+1共8项通过。APK SHA `9d45863e361ef6554c7d6ca11be0ec993d5bc18da52d57c43fce6d7e0632a022`；该精确APK保留在该目录 |
| 缓存与取消 | android-20261109-035250：缓存命中、V1/V2/V3修订失效、取消不替换旧成片、后台取消不重放通过；这是功能门禁，不替代播放性能门禁 |

8项Android路径实际经过插件客户端、当前DSH只读/写入RPC和共享模块，不是只构造假响应。上传13,574字节自制素材后往返取帧17/18/19/18/17/76/75/76，PNG条码和PTS逐次核对；建立本任务工程并由Android导出120帧。另验6秒独立配音/180帧黑尾、206前32字节/416多Range、系统分享opened、iframe拒绝、后台拒绝、新WebView退役旧任务和旧结果404。

拓扑是模拟器经adb reverse访问Windows隔离DSH，宿主供应原始素材/工程数据，Android执行索引、解码和编码。**这不证明实际手机proot后端与同机Android桥已联调，也不代表大视频或ARM64性能。** 原生导入服务另有不依赖FFmpeg的3项测试。

## 未过门禁：默认连续播放

先前690be5…APK在020546/020705通过严格4秒及60秒：预览/导出各120/1800帧，完整PTS、条码、双PNG和独立音频脉冲通过。这是历史包的有限结果，不能替代共享模块当前构建。

351373…APK在032009发生349.945ms间隔，032655发生466.701ms，均位于3.233→3.267秒，已经进入playing，不是暂停首帧预滚。首次同时有意外扩大的Standard单测；第二次该测试已停止仍失败，因此不把并发负载当作已证实根因。模拟器随后崩溃。重启同一只读AVD后034029两轮通过，034127缓存续播丢一帧，不能以偶然通过覆盖失败。

9d4586…诊断APK在034752仍有283ms间隔；实际解码器为OMX.android.goldfish.h264.decoder，未报告audio underrun事件。宿主25次CPU样本平均27.73%、范围13.21–47.19%；这不足以排除局部线程/模拟器调度问题。软件解码器显式对照034508没有得到视频帧并超时，不能当可用降级。所有读回内容检查与播放时序分开，严格150ms阈值和全PTS连续要求没有放宽；**当前60秒未准入**。

追加`playback-controls-040152`使用同一个已生成代理（SHA `e91264544e3f9430b6eabe84e43bde4e7b43144e2cfa26228f6486d61942c5f0`），本机和Android复制后SHA逐字相同。独立诊断APK为`dc60e90dbc7ad3b0989c8e492021486be157982ee201cb6c505d865dfbf98e54`，只新增非导出诊断Activity，未更改共享编码器。8次交错顺序对照结果：

| 单变量对照 | rendered/dropped（每次输入120帧） | 播放中最大release间隔 |
|---|---|---|
| 保留音频、异步队列 | 120/0、119/1、120/0 | 各66.667ms |
| 禁用音轨、异步队列（仅诊断） | 118/2、119/1、120/0 | 66.667、66.667、33.459ms |
| 保留音频、同步队列 | 119/1、118/2 | 66.667、66.668ms |

播放器实际rendered/dropped计数与逐帧回调数量完全一致，缺帧不是观察脚本漏记。禁用音轨仍丢帧，切同步队列也未消除，不能单独归因于音轨或异步队列。AudioTrack在有声各轮启动时记录timestamp stall correction；没有捕获中途position-discontinuity、audio underrun或sink error事件。该对照未复现原283–467ms长间隔，不能把启动校正或解码器名字直接宣布为长间隔根因。诊断测试的“OK”仅表示8个条件均完成并保存证据，**不代表8轮帧连续通过或产品门禁通过**。

首次诊断输入通过Windows adb stdin传输被截断，文件SHA门禁正确拒绝，未启动播放；改用adb push并在测试前比对设备SHA后再执行。035959/040123失败留存，不把工具输入失败归咎编码器。

## 未过门禁：完整WebView界面

真实API30 WebView83进入工作台前报错：`/assets/index-CN7NIWNw.js:2`。本机来源为`@deepseek-ai/dsh-web-frontend@0.2.1-rc.2/dist/assets/`，该入口SHA `4bc914bfbb6adbdd63953a29f63835eb7127defd2a973149d64cdab489f1a9a5`；第2行9077列的`??=`首先无法解析，文件另有静态块和WeakRef要求。文件不属于本次插件改动。

WebProbe最初没有DSHA宿主兼容注入。追加`web-capabilities-034708`实测将既有`es-compat.js`与`compat.js`注入同一内核：AbortSignal.timeout、crypto.randomUUID已可用，插件完整client可解析；逻辑赋值和静态块仍SyntaxError，WeakRef仍undefined。现有兼容链补充API，不转译整个上游入口，也没有可保持垃圾回收语义的WeakRef实现。这不是“插件最小桥页面已过，所以完整UI已过”。

继续完整UI的最小条件：获准的独立模拟器/测试设备上，内核能解析逻辑赋值和类静态块，并提供WeakRef；复用当前隔离工作台与测试工程即可，无需生产宿主安装。需单独验证真实软键盘、文字130%放大、系统返回、新WebView进程恢复及完整编辑器长标题/错误态。不更新系统WebView、不操作实体手机或生产DSHA。

用户随后明确允许新建验收工作区。按[ego-browser技能](C:/Users/ai/.agents/skills/ego-browser/SKILL.md)建立空间29，仅使用其p1完成补验，最后finish({keep:[]})一次，回执ego-space29-finished.json。未接管其他空间。

补验发现并修正：844px触屏、长标题和130%文字组合将导出按钮挤到x=850.5、右界960.84px，顶部部分按钮36px；下载链接还受旧桌面34px规则覆盖。mobile-layout.css补横屏换行、两行标题截断、44px控件和40dvh提示限高，下载链接提高样式优先级。失败证据font-stress-before-fix.json、editor-layout-matrix-resumed.json保留。初次脚本对多个按钮使用不唯一选择器失败，改用已聚焦抽屉的Escape；不是产品失败。

临时CSS预览24项通过后，mobile.5同版本重装被包管理器判为Already up to date，安装client仍6fa91410…，与当前60f8b7e3…不符；未将该安装算通过。保留client-mobile5-cache-evidence.js及失败回执，升至mobile.6后六个关键安装文件逐SHA匹配，再加载实际安装版完成24项。editor-layout-final-mobile6.json覆盖320×740、360×800、390×844、430×932、844×390、768×1024，每组普通编辑、长标题130%文字、素材/属性抽屉130%文字；无横向越界，所检查关键控件至少44px。

ordinary-touch-scroll.json使用真实CDP触摸在调序关闭时横滑，scrollLeft从2变147，浏览器发送pointercancel接管滚动；修订17、镜头顺序、工程完整SHA和撤销/重做状态不变。copy-longtext-layout.json实际输入120字标题与3030字正文，18→23.4px、四组尺寸自动增高无横溢出，最后还原原草稿与V1。empty-error-layout.json包含边界分割实际错误、两个尺寸的长错误DOM文字夹具和三个尺寸的真实空工程；均未写工程。desktop-mobile6-layout.json确认1440鼠标桌面四区和三条分隔线保留。网页CSS文字放大不替代Android系统字体，真实软键盘和非零硬件安全区仍未验。

## 保全与收尾

原25个工程逐项摘要一致，原45个tracked修改中43个逐字节相同；app/build.gradle仅增加Standard依赖及备份三JAR同图定向解析，runtime-descriptor仅按受管生成器更新本任务mobile/helper/manifest摘要与runtimeId。两者编辑前原件保留，脚本对允许增量作精确重建比较。额外保留4份明确本任务工程；不编辑用户B方案V3。

新增37个依赖pin逐项与Google/Maven官方校验文件比对，旧pin不变。Gradle生成排序噪声已收敛为151行纯新增；中间收敛产物受旧XML命名空间/缩进影响而包含重复组件，唯一性检查发现后修正，最终语义集合、旧pin原文及唯一性均检查。最终Standard/Low Java与备份门禁重新通过（host-final-gates.log）。备份版本/SHA/许可门禁未关闭。panel helper新增到受管输入清单，原生成器--check通过。

安装mobile.4及本次mobile.6前后state SHA均为`1e6cf36c4b15576678a9140344c3ff52b892bd23657b1a2b2f72f66dcd5eac6e`，移动宿主SHA均为`d48761e9e2f3528337d970924bca4c47233e703a6ee20b57a55db0e805e531f9`。正常停止服务后使用官方插件安装，再隐藏方式重启隔离服务61328，保持用户可继续查看。最终final-health-mobile6.json检查RPC200、29工程、六关键文件与HMR不变；仅有在用的空导入容器。

仅一个原工作树E:/dsha，未新增clone/worktree。临时模拟器写时复制盘按精确路径、进程、重解析、独占锁和近期写入检查后清理；日志和失败读回保留。初次模拟器崩溃时曾产生248,800,368字节dump，重启后模拟器自身处理使该文件不再存在；本任务未删除它，也不再声称保有dump原件，保留其文件清单与崩溃日志。最终空间及保留目录见收尾回执。

收尾实测：三轮模拟器写时复制盘与确认属于中断单测的1000个夹具文件，逻辑累计清理2,830,193,642字节；分段磁盘空闲量增加2,830,639,104字节，包含并发写入，不视作硬链接/稀疏去重精算。C/D/E可用空间从约27.49/34.29/34.34GiB变为27.052/34.259/33.632GiB。保留本轮证据约39.61MiB（含精确业务APK）、实验app构建约97.61MiB、两个共享构建约5.24MiB，供未完成门禁继续复用；原SDK/AVD/依赖缓存不清理。模拟器进程已退出，隔离工作台保持运行。

当前交付插件包为build/copy-edit-mobile/20261109/dsh-copy-edit-0.2.0-mobile.6.tgz，103,196字节，SHA256为d997c5ca7ebe1770fbc81b08089ebd0f77dde09ca92f7e2b9b7897f424b65900。旧mobile.4包与历史证据保留。final-health-mobile6、preservation-audit-integration、closeout-space-mobile6及delivery-mobile6回执分别绑定当前安装、数据、空间与交付范围。
