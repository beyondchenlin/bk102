# APP 常驻故障诊断

2026-11-12 用户决定：诊断导出是 BK Harenss 的常用维修功能，应随后续 APP 默认提供，不能只存在于临时诊断安装包，也不能要求用户连接电脑或手抄日志。

首个包含此改进的交付见 [mobile28 记录](copy-edit-mobile28-diagnostics-20261112.md)。

## 使用入口

- 启动失败后的原生「启动恢复」页：点击「一键导出诊断」，保存完成后选择「分享诊断文件」。Web 无法启动时仍可使用。
- 平时进入设置中的诊断页面，选择「下载错误日志」或「另存为」；可为本次反馈附上问题描述。
- 标准版默认保存到 `Download/DSHA/DSHA-diagnostics-<versionCode>-<时间>-<UUID>.tar.gz`。用户将此文件发给 AI 或维护者；APP 不自动上传。

这不是用户数据备份，也不是修复执行器。导出不会启动 guest、重置环境、清理工程或变更插件。

## 文件内容与边界

| 文件 | 用途 |
|---|---|
| `status.json`、`summary.txt` | 包名、版本、Android API/架构、运行方式及已有状态摘要；`diagnosticFormat=2` |
| `startup-1.json` 至 `startup-3.json` | 最近三次已持久化启动记录，包含实际记录的错误、阶段和脱敏日志尾部；重开 APP 后仍可导出 |
| `startup-current.json` | 当前进程中的启动记录、代次及就绪状态；独立标注来源，不与历史记录混为一次启动 |
| `runtime-evidence.json` | APK 期望与已安装运行时的身份对照，以及固定受管文件的摘要；读取失败或缺失明确记为不可用 |
| `operations-tail.jsonl` | 已有原生操作记录尾部；此前已轮换的记录无法补回 |
| `additional-context.txt` | 用户明确选择时才附加本页填写的说明 |
| `manifest.json`、`README.txt` | 各成员摘要、采集范围、容量限制、非备份及不自动上传标记 |

导出使用原有脱敏规则，先脱敏再截取尾部。每份启动日志保留最多 12 KiB 字符，单个启动 JSON 上限 96 KiB；归档内容总上限 1 MiB，使用 tar/gzip。固定文件只记录大小与 SHA-256，不读取工程、对话、配置或凭据文件；不跟随链接读取受管文件。不保证识别第三方插件输出中的所有私人内容。

异常链只在启动记录原本包含时导出，不推测缺失异常，不采集系统级完整 logcat，不声称覆盖所有原生崩溃或业务过程。受管文件摘要不等于完整运行时健康检查；导出失败不得把上一次文件作为本次新诊断报告。

## 维护约定

实现位于 `ErrorLogRepository`、`StartupDiagnosticEvidence`、`StartupRecoveryActivity` 和 `DiagnosticActivity` 的主源码中，不受 preview/debug 构建开关控制。以后打包需保留这两个入口和归档格式说明；增加新故障证据时保持有界、脱敏、只读及来源明确。

关联回归覆盖重启后真实错误保留、旧运行时/文件不一致、运行时证据损坏时仍能导出错误、链接拒绝、凭据脱敏、Unicode 截断和大日志归档。APK 的构建、签名和软件检查不能代替目标手机实际反馈。mobile28 回传已定位客户端语法错误，修复及验证见 [mobile29 记录](copy-edit-mobile29-startup-fix-20261112.md)，目标手机覆盖后的结果仍待确认。
