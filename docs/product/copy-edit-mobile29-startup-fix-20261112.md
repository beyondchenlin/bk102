# mobile29：修复文案剪辑客户端加载失败

mobile28 回传的诊断明确显示：proot 后端约 27 秒完成启动并给出鉴权链接；进入页面后，`dsh-copy-edit/client.js:675` 报 `SyntaxError: missing ) after argument list`，随后宿主报告该插件未激活。运行时身份和受检查文件均与 mobile28 APK 匹配，不能把这次失败继续解释成旧包未更新或后端进程退出。

从交付的 mobile28 APK 直接取出客户端脚本，用 JavaScript 解析器复现同一行错误。源头是 `src/selection-import.cjs` 的嵌套元素调用缺少一个右括号。TypeScript 只编译后端，之前的检查也只执行后端导入和注册，没有解析拼接后的完整浏览器入口，因而漏检。

本次补齐括号，插件升为 `0.2.0-mobile.29`。构建在写入客户端前解析完整生成脚本，合同测试前自动构建；精确 APK 校验也读取包内完整脚本并解析。新增两项客户端加载/导入面板测试；旧 APK 被新门禁以对应语法错误拒绝，修复 APK 通过。常驻诊断功能保留。

## 精确交付

| 项目 | 值 |
|---|---|
| APK | `BK-Harenss-mobile29-startup-fix-20261112.apk` |
| 身份 | `io.github.beyondchenlin.bk102.copyedit.preview`，code `19029` |
| 版本 | `0.2.0-mobile.29-startup-fix.20261112` |
| 条件 | Standard、ARM64、minSdk 30、debuggable=false |
| 字节数 | 307,195,571 |
| SHA-256 | `be821c143dae33180bfbccd8dc4a1fcc6fe034c2bbda0968cb2e04f12bb53436` |
| 证书 SHA-256 | `5833e632216fa67d9df78137c366fabb32e5332131e8529697fb81b1f31b1f7f`，与现有预览包一致 |
| 运行时身份 | `4bdc4b5ac7a7ccd77f2a3536842d5aed6ec504edc888e6429097e3c63cab1f70` |

## 验证范围

- 新增完整客户端执行与工作台/侧栏注册、导入对话框绘制测试，以及原有选片导入回归，共 11 项通过，无失败/跳过。
- Standard Preview 构建及 Lint Vital、签名、ZIP 对齐通过；实际 APK 28 个插件成员、完整安装清单、后端 ESM 导入和真实注册/启停夹具通过。
- 独立 Windows DSH `0.2.1-rc.2` + ego-browser Chromium 真实进入文案剪辑工作台，打开导入对话框，验证非法 JSON 友好提示；412×915 窄视口也可打开对话框。记录到的页面错误为零。正常关闭本任务浏览器空间和独立宿主。
- 浏览器实际接收的合并脚本可解析，包含与 APK 完全相同的插件客户端字节（SHA-256 `0ccb5c77e4a55473f4701187ed92415de135864accc36189f0c4feae529b0de2`）。未带 revision 的探测 URL 返回 404，已使用浏览器真实加载的带 revision 合并 URL 复核，不把该 404 当作成功。
- 未连接 OPPO，不称目标手机首启已验收，也不把桌面 Chromium 视口模拟写成 Android WebView 或完整媒体测试。当前证据支持修复回传中的确切语法错误；覆盖安装后的手机结果仍待用户确认。

## 资源和证据

复用 `build/copy-edit-mobile/20261112/diagnostics/source/`、现有 SDK/JDK 和缓存，未新增工作树、未下载工具链；原 mobile28 APK 和冻结回执不变。新 `--receipt` 选项让成品校验明确引用本轮清单，避免覆盖旧清单。

本轮证据保留在 `build/copy-edit-mobile/20261112/client-fix/`：精确 APK、插件包、11 项测试日志、旧 APK 拒绝证据、签名/对齐、浏览器结果与绑定证明、必要截图、构建配方和冻结清单。用户原始诊断不提交 Git。受前轮清理拒绝影响的构建快照继续保留供复查；独立宿主已停止，临时连接凭据已移除，小型隔离浏览器测试数据随本轮证据保留到目标手机反馈或 2026-11-19 复查，由本维护任务负责，不新增自动清理任务。
