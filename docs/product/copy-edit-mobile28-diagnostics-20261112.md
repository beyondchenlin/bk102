# mobile28 常驻诊断导出交付

2026-11-12。用户暂时不能连接报错的 OPPO，明确要求先提供诊断 APK，安装后反馈文件；并要求今后所有 APP 构建保留此维修功能。功能契约见 [APP 常驻故障诊断](app-diagnostics.md)。

旧 mobile26 诊断文件明确排除了原始启动输出，只保留阶段和退出码；它无法证明真正的退出原因。mobile27 的插件锁异常处理已保留，用户仍报告不能启动。本次补齐最近三次及当前启动日志的脱敏尾部、安装包与手机运行时身份/固定文件摘要对照，并在原生启动恢复页增加一键导出和分享。不声称已修复 OPPO 的未知根因。

## 精确 APK

- 文件：`BK-Harenss-mobile28-diagnostics-20261112.apk`
- 包名：`io.github.beyondchenlin.bk102.copyedit.preview`
- 版本：`0.2.0-mobile.28-diagnostics.20261112`，code `19028`；Standard / ARM64 / minSdk 30 / debuggable=false。
- 大小：307,195,567 字节；SHA-256：`3f627564c2dd7c9ef5d307cb92a2d67186fbdce642488fdd08c497847746c192`。
- 签名沿用现有预览 APK，证书 SHA-256：`5833e632216fa67d9df78137c366fabb32e5332131e8529697fb81b1f31b1f7f`，v2 验证通过。它是独立预览签名，不是上游 E7E3 正式签名。
- 运行时身份保持 `fc907aae250c3c714c5fe7691a6859a16a889fe5957c71ebbc38c801dd48ad2b`。与 mobile27 对照，442 个资产/原生库成员逐字节相同；仅两份 DEX 优化 profile 随原生代码重新生成。

## 验证与限制

Standard Debug 选定四类 19 项 JUnit，0 失败/错误/跳过，其中新增诊断证据 6 项。精确 Standard Preview 全编译、APK 内诊断代码/入口标记、运行时安装清单、28 个插件成员、真实注册与启停夹具、ESM 导入及 ZIP 对齐检查通过。最终 native 分享/旋转状态处理补改后重新编译并执行完整 Standard Preview Lint。

Lint 为 0 错误/致命、238 条警告；四个受改生产 Java 文件没有 Lint 条目，未声称全项目零警告。

初次调用了不存在的 Preview UnitTest 任务，随后因 Python 可执行文件未配置失败；改用 Standard Debug 测试和已有 Python 后通过。原失败日志保留。没有新建依赖环境、工作树或重新下载 SDK。

没有连接、安装或操作目标 OPPO；未运行 Android 真机/布局仪器测试，不把软件检查当作手机恢复证明。诊断代码在主源码中，无 preview/debug 开关。覆盖安装后启动一次，失败页选择「一键导出诊断」和「分享诊断文件」，将新文件反馈后继续归因。

本地交付证据位于 `build/copy-edit-mobile/20261112/diagnostics/`：APK、构建日志、JUnit/Lint、签名、对齐、`preview-verification.json`、`diagnostic-apk-verification.json` 和最终源码补充摘要。生成物不提交 Git；旧交付与用户诊断原件保留。

本轮未新增工作树。测试临时夹具由测试自身回收；源码快照与编译缓存 `diagnostics/source/` 有 10,571 个文件、逻辑大小 2,649,601,377 字节，复用工具链，不含新下载 SDK。证据保全后尝试定向回收，自动审批以“blocked by policy”拒绝，命令未执行，目录保留、不计释放。保留用途为 mobile28 复核/重建，负责人为当前维护任务；收到用户诊断或 2026-11-19 时复查，不自动定时删除。操作前 C/E 可用约 28.78/41.10 GiB，实际空间回执见本地 `cleanup-plan.json`、`cleanup-result.json`。
