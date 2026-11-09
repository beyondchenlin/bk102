# 文案剪辑独立手机预览 APK

2026-11-09。本轮只制作本地安装包，没有操作生产手机、覆盖安装、公开发布或提交。

## 交付

- 文件：`E:/dsha/build/copy-edit-mobile/20261109/apk-preview/BK102-copy-edit-mobile12-preview-20261109.apk`
- 应用名：**BK102 文案预览**；包名：`io.github.beyondchenlin.bk102.copyedit.preview`。
- 版本：`0.2.0-mobile.12-preview.20261109`，versionCode `19012`。
- Android 11/API30 以上，ARM64；307,099,099 字节，约 292.87 MiB。
- SHA-256：`a02593405ce9cf26ede560a609ba6442e43506037b263ea04afb1ea30a835557`。
- APK v2 签名验证通过；采用独立预览用途的本机 Android 测试证书，SHA-256 `5833e632216fa67d9df78137c366fabb32e5332131e8529697fb81b1f31b1f7f`。不是 E7E3 正式发布包。实际 Manifest 未声明 debuggable，默认关闭；不含 debug 源集。

手机安装后打开“BK102 文案预览”，按引导准备自己的离线环境，进入工作台侧栏“文案剪辑”。插件自动注册，不依赖电脑上的 61328 服务，也不需要另行安装插件。新应用从空白数据开始；此前电脑和模拟器测试工程未放入 APK。文案页、剪辑页可以创建自己的测试内容。

## 内置方式与隔离

复用当前工作树源码、已有 SDK/JDK/Gradle 缓存和固定离线输入，在任务独占的 `apk-preview/source` 快照中改变应用身份、显示名称、公共导出目录和预览构建类型。原项目应用实现没有因本次打包再修改，也没有新增 worktree。独立导出目录为 `BK102-CopyEdit-Preview`；五个 Provider authority 全部使用预览包名前缀。

冻结插件为 `0.2.0-mobile.12`，原包 SHA-256 `1cf956b59ccacb5e9eadf9aa315c5d026af5386756b12b57796a04bf776ac28e`。23 个成员进入 APK 的 `builtin-plugins/dsh-copy-edit`，安装目标 `/root/dsha-copy-edit`；同时更新 JSON/Java 注册表、默认启用名单和受管安装清单。原生成器生成并校验运行时描述符 `cf0ddc8b6dcab2da80feb5a46445caa7662948b9525635324942ad4afd5b1b8c`。

原生媒体仅在此预览快照中通过独立 `PREVIEW_MEDIA_ENABLED=true` 开放试用。正式源码的 `HOST_DEVICE_VERIFIED=false` 保持不变，预览开关不表示生产手机或 ARM64 已验收。Low 未构建、未交付。

## 检查结果与边界

- `assembleStandardPreview` 与完整 `lintStandardPreview` 离线构建成功，103 个任务执行，3 分 33 秒。Lint 零错误/致命、237 条警告保留；不是零警告。
- 精确 APK 签名、应用身份、Android 最低版本和唯一 ARM64 ABI 已核验。
- 全部 23 个插件文件与冻结包逐字节一致；98 个受管安装文件与实际 APK 描述符摘要一致；插件注册表/默认名单一致。
- 从真实随包 DSH 归档核验 Node 依赖、三个界面注入模块和浏览器共享 React。首次检查误把浏览器 React 当作 Node 包而失败，纠正检查后通过；APK 本身未因此重建，失败原件保留。
- 实际 `register-builtin-plugins.py` 在小型隔离文件系统夹具中完成首次注册、依赖链接、重复注册不改 profile、原生禁用后保持禁用及重新启用。夹具退出即清理。这不是 Android/proot 首启证明。
- 保全审计通过：原 45 个修改文件仍为此前的 43 个字节相同、2 个已记录集成差异；25 个原工程全部不变，本任务 4 个测试工程保留。

**待手机验证**：未对本次 APK 做 ARM64 手机首启，也未解决此前播放连续性门禁和 WebView 偶发崩溃。先供外观/交互试用，不作为播放稳定性通过证明。系统 WebView 需支持 DSH 当前网页；此前 WebView83 不能解析上游入口，独立模拟器使用128完成过网页验收。

新增内置插件尚未纳入 DSH Web 设置开关的重启保持补丁；如需关闭/开启，请使用宿主原生插件页。本轮未更改既有 DSH 大运行归档补丁链来扩展此功能。

## 证据、重建与空间

证据集中在 `build/copy-edit-mobile/20261109/apk-preview`：APK、`.sha256`、`build.log`、`apksigner.txt`、`badging.txt`、`manifest-tree.txt`、`lint-results-standardPreview.xml`、`apk-verification.json`、原始检查失败日志、`preview-inputs.json`、`source-overrides` 与冻结重建/检查脚本。

制作入口为 `tools/prepare-copy-edit-preview.py`，要求新的任务独占输出目录、固定插件摘要和至少10GiB余量；精确 APK 检查入口为 `tools/verify-copy-edit-preview.py`。构建使用 `:app:assembleStandardPreview :app:lintStandardPreview --offline --max-workers=2`，无需生产签名密钥；生产构建门禁未跳过。

开始 C/D/E 可用约 23.87/34.23/31.33 GiB；预估峰值新增4GiB。最后一次清理前记录约23.85/34.23/29.17GiB。本轮创建的源码快照/编译目录 `E:/dsha/build/copy-edit-mobile/20261109/apk-preview/source` 逻辑大小 **2,001,434,956 字节**，7,125 文件；检查无重解析点、无文件锁且构建已结束。删除命令被自动审批策略拒绝，只返回 `blocked by policy`，因此**未执行删除、未释放该目录空间**。目录仍保留供复核，不改用其他工具绕过。未单独测量硬链接去重后的物理占用；本任务没有创建硬链接。旧证据、现有 SDK、缓存、工作树和运行服务均保留。
