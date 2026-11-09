# 文案剪辑最小插件与媒体可行性验证

日期：2026-11-07。范围：最小 DSH 插件 + 隔离 Android 媒体试验。**没有开发完整编辑器，没有把媒体试验接入 DSHA 生产宿主。**

> 本文保留首次失败原貌。后续已定位模拟器 Surface 丢帧并完成 4/60 秒准确导出与缓存预览，见[后续修复报告](copy-edit-media-fix-report.md)。不要把下方历史失败当作最新结果，也不要把缓存预览通过写成直接 CompositionPlayer 已通过。

## 本轮结论

| 项目 | 实际结果 | 结论 |
| --- | --- | --- |
| DSH 正式插件接入 G0 | 正式 CLI 安装实际 tgz；真实 Web 宿主、侧栏、主面板、认证 RPC 均工作 | 通过本轮最小范围 |
| 生命周期与工具 | 两轮关闭/开启，关闭后 RPC 404，重开恢复；实际 Cordis ToolRuntime 两轮调用并释放；服务/工具对象身份一致 | 通过；没有调用付费模型 |
| 手机页面 | 使用当前随包 `dsh-web-mobile` 3.2.1；Android UA/触摸/320、390 宽浏览器检查；文案→工程结构→返回会话可用 | 浏览器模拟通过；不等于 DSHA 真机 WebView 验收 |
| 精确选帧 G1 子项 | 5 个素材、30 次定向解码，实际 PTS 与可见条码匹配；包括 B 帧、VFR、60 fps、反向及末帧 | 选帧样本通过；完整剪裁 G1 尚未通过 |
| 连续预览 G2 | 能从选中位置跨到下一片段，但回调呈现间隔最大约 20.4 秒 | **失败，不能称为流畅连续预览** |
| 1080P 导出 G3 | Android 本地生成 H.264/AAC；4 秒成片应有 120 帧，实得 112 帧 | **失败，不能作为准确导出交付** |
| 音轨和贴片子项 | 220 Hz BGM 与 880 Hz 脉冲测试音混合读回符合预期；多行 PNG 有透明/不透明像素 | 子项通过；不等于完整成片通过 |
| 60 秒、实体手机、性能 | 4 秒准确性门禁未过，因此 60 秒用例未执行；未操作实体手机 | 未验证 |

**公允判断：** 插件规范和页面入口不是当前障碍。真正未解决的是 Android 媒体输出正确性和跨素材预览。现阶段不应继续堆时间轴界面，也不应承诺“手机 1080P 导出已经可用”。

## 代码与制品

- [插件源码与使用](../../plugins/dsh-copy-edit/README.md)：`dsh-copy-edit@0.1.0-spike.2`，Host/Client 分离、`dsh.bundle.patch`、`./client`、`main` 与 `sidebar.panellist`，共用宿主 React/Cordis；没有新增 HTTP 监听端口。
- [Android 试验工程](../../experiments/copy-edit-media/README.md)：独立 `settings.gradle`，包名 `dsh.copyedit.spike`，仅自制素材。不是修改正式 DSHA 包名或签名。
- 插件包：`build/copy-edit-spike/dsh-copy-edit-0.1.0-spike.2.tgz`。
- Android APK：`experiments/copy-edit-media/app/build/outputs/apk/debug/app-debug.apk`；测试 APK 位于 `outputs/apk/androidTest/debug/`。属于 debug 验证包。
- 摘要与大小：`build/copy-edit-spike/artifacts.json`。

最小插件暂时只读固定示例：文案、V1、贴片样式与工程轨道结构；“打开完整示例工程”已接通结构页，媒体播放尚未接入。版本写入、团队库、模型调用、资源索引、真实示例成片均不在此次最小实现中。插件返回的本地剪辑/预览/导出能力保持 false，不能让界面假装已接入原生引擎。

## 基线与验证方式

源码基线为 `f90082e5c43df03851add0b0e9451069f74fbe50` / `bk102-brand`。开始时已有 45 个 tracked 文件修改；结束核对这 45 个文件的 SHA-256 全部与开始一致，见 `production-preservation.json`。现有未提交品牌/权限等工作没有被覆盖，也没有提交或公开发布。

复用了 Node 24.14.0、JDK 17、现有 Android SDK、根 Gradle 9.3.1 wrapper、AGP 9.1.1、FFmpeg。DSH 测试运行时由现有 `tools/dsh-runtime` package-lock 安装，版本 0.2.1-rc.2，运行在独立 `DSH_HOME`。这是官方 Windows Host，加上当前随包移动插件；不是对 Android 内所有 DSHA 补丁的完整复测。pnpm 对由宿主提供的 peer 打印了缺失提示，实际 Loader 解析与运行通过，不把安装输出称为“无警告”。

用户本轮明确恢复的设备范围是**空闲现有 Android 模拟器**。复用了 `DSHA_API30`，启动前无正在运行的模拟器，以 `-read-only -no-snapshot -no-window` 启动并使用 `emulator-5580`；Android 11 / x86_64 / Google API 30 镜像。没有使用实体手机，没有操作现有 DSHA 应用。模拟器由本任务正常关闭。

软件检查：插件 TypeScript typecheck、3 个 domain 测试通过；Android 3 个 JUnit 测试通过，应用/测试 APK 构建通过，最终 Lint **0 errors / 12 warnings**。警告包括验证 UI 硬编码文字、图标/布局等，未用 Lint baseline 隐藏错误。媒体仪器化与读回检查为失败，不能与软件构建合并写成“全绿”。

## 媒体失败证据及对照

主要证据目录：

- `build/copy-edit-spike/android-20261107-211913/`：最初含 B 帧样本，112/120 帧，跨段长停顿。
- `build/copy-edit-spike/android-20261107-212322/`：尝试仅在模拟器选软件解码器；实际没有匹配的软件 AVC 解码器，返回 `NO_EMULATOR_SOFTWARE_DECODER`。这条试验路径已移除，不能称为成功降级。
- `build/copy-edit-spike/android-20261107-212718/`：改为真实 1080×1920、无 B 帧的 A/B 对照，另保留 B 帧/VFR/60 fps 检查。30 次选帧成功；导出仍 112/120，预览呈现回调最大间隔 20,400.969 ms。
- `build/copy-edit-spike/android-20261107-213151/`：仅重测导出，并移除可选的目标帧率丢帧设置；仍 112/120。最终 app APK 的媒体实现对应此轮。之后只加强了测试门禁与主机读回脚本，未改变 app 实现。

读回程序按完整画面序列检查条码：第一个片段开头为 `17,22,23,24...`，应为 `17,18,19,20...`；第二片段也缺开始后的四帧。末帧正确、总时长仍是 4 秒，因此“时长正确”和“首末帧正确”不能单独作为通过条件。4 秒和 60 秒必须分别达到 120、1800 帧并全序列匹配。

编码存储尺寸可能为 1920×1080 加旋转元数据，显示为 1080×1920；主机 FFmpeg 默认应用旋转后按条码位置检查。输出双音轨已混合为一个 AAC 音轨，测试的 220/880 Hz 成分和时间窗符合预期。PNG 读回含 163,480 个全透明像素、24,404 个不透明像素，原生 Canvas 生成两行文字及描边。

这些现象目前定位到“模拟器上的 Surface 解码/GL 合成/编码组合链”，**尚未确定根因属于模拟器、Media3、配置或实现中的哪一层**。ByteBuffer 精确选帧成功不能证明 Surface 输出可靠；也不能据模拟器失败断言所有手机不可行。

初始兼容错误包括 Android 11 不支持 `InputStream.transferTo`、`Files.writeString`、`BigInteger.longValueExact`；现已改用兼容实现，并显式 opt-in Media3 实验 API。原 Lint 错误报告保留在 `failures/lint-before-api-fixes.txt`。较早 runner 将 `adb exec-out cat` 的错误文本误存为不存在的 60 秒 MP4，历史目录中保留该失败现场；当前 runner 校验文件签名，报告明确为“未生成”，不把它算成导出失败成片。

## 宿主边界与下一步

本次新增代码只在 `plugins/`、`experiments/`、产品文档内。生产 `app/`、根构建、`HarnessController`、`HttpShellService`、`WebPreviewActivity` 和已有移动插件均未改动。现有功能未被接入试验逻辑；没有做生产 APK 全量回归，因此不作“所有旧功能已再次验收”的声明。

下一工作包应该是媒体链路定位：对同一帧的 decoder output、Surface/GL input、encoder output 分别记录 PTS，找出四帧在哪个边界丢失；对预览接缝分别记录下一素材 decoder ready 与首帧呈现，定位约 20 秒等待。修复后复用当前失败样本、再执行 60 秒及实际 ARM64 测试。需要实体测试机时再按授权范围操作。

真实宿主媒体桥继续留在后续独立 adapter：只暴露版本化 JSON 命令与素材句柄，校验页面来源/代次、管理资源与取消、实现 Surface 布局和后台导出。现在没有把这些要求伪装成已实现接口；`MediaProvider` 只是边界草案。只有媒体关口通过，才接通插件按钮和宿主媒体能力。

## 证据与空间收尾

无新 worktree。浏览器 TaskSpace 已关闭，独立 DSH Host 正常停止，临时认证文件已删除，模拟器正常退出。没有清理其他任务的依赖、AVD 或历史证据。

保留 `build/copy-edit-spike`（约 1,292 MiB 逻辑大小，含单套固定 DSH runtime 和本轮失败证据）、插件 node_modules（约 33 MiB）、独立 Android build（约 93 MiB）、生成夹具（约 22 MiB），供下一轮媒体定位复用；均未进入 Git。任务负责人为当前开发任务，媒体问题解决后复核保留必要证据、再按本机规则定向清理。

初始峰值估算约 3 GiB；现有 AVD 首次初始化额外生成运行文件，后续按约 5 GiB 预留。AVD 文件逻辑大小约 12.1 GiB，包含稀疏/qcow2，不能当实际新增占用。C 盘可用空间约从 31.95 到 31.40 GiB，E 盘从 85.36 到 81.44 GiB（关闭前观测）；含其他并发任务和系统缓存变化，不把差值声称为本任务独占量或“已释放”。最终磁盘观测及制品摘要另存 `artifacts.json`。
