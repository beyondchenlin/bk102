# Intel Windows 上完整 ARM64 APK 的替代验收环境调查

2026-11-10。用户要求先确认可行再下载，不反复重试；只使用独立模拟器，不操作生产手机或现有用户数据。本报告延续 [上一轮完整 ARM64 验收记录](copy-edit-arm64-startup-20261109.md)。

**结论：本轮未找到已确认能在当前电脑上完成 BK Harenss 完整 ARM64 首启和运行时更新验收的替代方案。没有新增模拟器安装包或系统镜像下载，没有安装 APK，没有修改应用实现或重新打包。首次启动、运行时更新和维护恢复继续为 NOT RUN，不能宣称维护页问题已完成设备验证。**

这不是“所有 Windows 模拟器都绝对不能运行”的结论。商业模拟器的 ARM64 应用兼容与本应用所需的独立原生进程、proot/ptrace、ARM64 glibc/Node 运行链不是同一项证明；本轮没有取得覆盖后者的证据，因此未通过用户要求的下载前可行性门槛。

## 本机条件与复用

- Intel i7-12700KF / Windows，现有 Google Android Emulator 37.2.13，缓存中已有 API30 x86_64 Google APIs 镜像。
- 未发现已安装的 BlueStacks、MuMu、Nox、LDPlayer、MEmu、Genymotion、VirtualBox 或 VMware；检查范围为卸载注册表和相关安装路径，不据此宣称扫描了所有便携程序。
- 已有 Docker Desktop / WSL2 的 docker-desktop，宿主架构仍为 x86_64。现有 reachflow PostgreSQL、Temporal 容器仅做只读清单核对，没有停止、重启或修改。没有新建 Linux 发行版或修改 WSL 内核。
- 复用 E:/dsha 唯一工作树、既有 SDK、既有 DSHA_API30 基础盘；独立只读写层运行，固定 serial `emulator-5584`，不访问物理设备。
- C 盘开始约 19.31 GiB，已提示低于 20 GiB。D/E 约 35.61/57.20 GiB。本轮模拟器临时目录限定于 `E:/dsha/build/copy-edit-mobile/20261110/arm64-research/emulator-temp`，峰值预算 3 GiB，保留超过 10 GiB 余量。

## 候选比较与下载决定

| 方案 | 已核实事实 | 本任务决定 |
|---|---|---|
| 官方 Google ARM64 Android 模拟器 | 上轮已在本机得到 launcher 的 x86_64/ARM64 架构拒绝；绕过 launcher 的 API30 TCG 探测没有进入 Android 就绪 | 不重复下载或启动相同失败组合 |
| 已缓存 Google API30 x86_64 + libndk_translation | 本轮实测 ABI 列表含 ARM64，但 APK 的原始 proot 在补齐随包依赖后仍报动态库加载失败 | 未通过后端执行探测；停止本轮路径，未安装 APK |
| Genymotion Desktop | 官方支持矩阵将 ARM64 标为 Apple Silicon 支持、PC Intel/x86_64 不支持；PC 社区翻译一节针对 ARM32 | 不下载，无法据其官方支持范围完成此验收 |
| BlueStacks 5 | 官方提供 ARM64 应用库 ABI 选择；新版本实例支持随版本变化，不能沿用旧 Android11 教程 | 未找到完整 proot/ptrace + ARM64 Linux 后端成功证据；暂不下载，不能认定绝对不兼容 |
| MuMuPlayer | 官方文档确认 Android12/15 实例；Android 系统版本满足要求只是一个前提 | 没有本 APK 后端链路的兼容证明；暂不下载 |
| lhns/android-arm-tcg | 项目明确验证的是 API28 / Android9 系统启动；安装文档承认大型 APK 成功不稳定，可能多次冷启动，并提供跳过一项签名验证的补丁 | 低于 APK minSdk30，且验收方式不符合“不放宽标准、不反复重试”；不下载 |
| Ccccccccvvm/qemu-android-arm64 | 主验证平台是 Apple Silicon/HVF 与 ARM64 Linux/KVM；文档有 TCG 后备选项 | TCG 参数存在不等于 Intel Windows 上 API30+ 完整应用已经成功；不下载新系统栈 |
| ReDroid / Waydroid / Docker ARM64 | Linux 容器或 ARM 应用翻译不等于 ARM64 系统内核；普通跨架构 Docker 还可能依赖 QEMU 用户态仿真 | QEMU 用户态官方说明未实现 ptrace，而 proot 依赖 ptrace；据此不能把此组合当作完整 proot 验收替代品 |
| Cuttlefish | 官方以 Linux、KVM、匹配的主机包和系统镜像为前提 | 没有取得在当前 Intel Windows 上运行完整 ARM64 Android 的可行证明；不下载 |

原始项目和官方资料（2026-11-10 查询）：

- [Genymotion 架构支持矩阵](https://docs.genymotion.com/usage/desktop/install_apps/)
- [BlueStacks ABI 官方说明](https://support.bluestacks.com/hc/en-us/articles/360058929011-What-is-Application-Binary-Interface-ABI-in-BlueStacks-5)
- [MuMu Android 版本升级说明](https://www.mumuplayer.com/help/win/how-to-upgrade-mumuplayer.html)
- [android-arm-tcg 范围](https://github.com/lhns/android-arm-tcg)及[安装限制和验证跳过说明](https://github.com/lhns/android-arm-tcg/blob/main/docs/INSTALL.md)
- [qemu-android-arm64 测试平台与方案](https://github.com/Ccccccccvvm/qemu-android-arm64)
- [QEMU 用户态文档](https://www.qemu.org/docs/master/user/main.html)、[PRoot 项目](https://github.com/termux/proot)、[ReDroid 项目](https://github.com/remote-android/redroid-doc)
- [Cuttlefish 官方准备条件](https://source.android.com/docs/devices/cuttlefish/get-started)

关于 QEMU 用户态的结论不外推为 QEMU 全系统 TCG 不支持 ptrace。完整 ARM64 来宾内核理论上是另一条路线；本轮缺少满足 Android11+、完整安装/运行、无需弱化验收的已验证组合。

## 本轮本机实测

只启动一次 `DSHA_API30`，参数包括 `-read-only -no-snapshot -no-window`。基础 AVD 作为复用输入，试验写入位于本任务临时盘。身份核验结果：

```text
serial: emulator-5584
ro.kernel.qemu: 1
uname: x86_64
API: 30
ABI: x86_64,x86,arm64-v8a,armeabi-v7a,armeabi
native bridge: libndk_translation.so
```

从精确交付 APK 提取 `libproot.so` 和依赖，不下载第三方原生文件；ELF 核对为 AArch64，解释器 `/system/bin/linker64`。APK 摘要保持：

`84a0a4fc50fbb1285f3b7aad8db2555c3fe01c6f9e2ec2497a5552582f82d2dc`

步骤及边界：

1. 探测脚本最初的 AVD 名称断言受 Windows ADB 重复 CR 换行影响，修正文本归一化后继续使用同一已启动实例；没有重新启动模拟器。
2. 单独执行 APK 的 proot `--version`，报告找不到 `libtalloc.so.2`；此时尚未布置依赖，所以这一结果本身不能判定模拟器不兼容。
3. 按应用 `RuntimeNativeFiles` 的别名准备 `libtalloc.so.2`、`libandroid-shmem.so` 和原始 loader，设置 `LD_LIBRARY_PATH` / `PROOT_LOADER` 后执行，仍退出 code1，报告同一缺库错误。
4. 用模拟器自带 `/system/bin/arm64/linker64` 做一次加载路径核对。首次传入它不接受的 `--library-path` 参数，保留错误原件；改为环境变量后仍为同一动态库加载失败。每个有效执行命令设有 12 秒来宾侧超时，没有超时后循环重启。

共一轮系统启动，四次短原生命令调用（含缺少依赖的初始观察和不支持参数的一次 helper 错误）。没有安装 APK、提取完整 rootfs、开始 RuntimeTrial 或启动应用后端。proot 尚未成功加载，因此 **没有实际执行 ptrace 测试，不能把加载失败写成已证明 ptrace 不支持**。`/data/local/tmp` 的 shell 探测也不能完全等同于应用 UID 和安装目录环境；当前结论限定为“此探测没有建立可行性”。

所有远端探测文件均在本任务独有 `/data/local/tmp/bk-harenss-*20261110` 目录，存在即拒绝覆盖，finally 逐项移除后用 rmdir 核对空目录。没有覆盖任何已有应用或用户目录。

## 验收及交付状态

| 用例 | 本轮结果 |
|---|---|
| 完整 ARM64 APK 首装、RuntimeTrial、正常进入文案剪辑 | NOT RUN |
| 健康旧版覆盖更新与测试数据保持 | NOT RUN |
| mobile23 缺模块现场升级恢复 | NOT RUN |
| 中断维护恢复、不循环卡维护页 | NOT RUN |
| 新 APK 构建与两轮应用代码 review | 未触发：本轮没有应用代码改动；不重新包装旧字节冒充新修复 |

上一轮精确 APK 安装清单展开与 ESM 模块导入检查的通过结论保持原范围，不能替代上述 Android 执行证据。继续设备验收需要新的有效环境证据，例如匹配的 ARM64 虚拟化主机，或已有证明支持此 proot 原生运行链的 Intel 模拟器；不需要生产手机授权。

## 收尾和留存

- 浏览器调查复用一个独立 Ego 工作区 48，已 `finish({keep:[]})` 关闭；没有登录第三方测试服务、上传 APK、申请云主机或产生租赁费用。
- `adb -s emulator-5584 emu kill` 正常返回。稍后确认 emulator/qemu/netsim 进程清单为空，没有强杀其他服务。
- 停止时观察到的四个临时/COW 文件逻辑大小合计 556,143,360 字节，正常退出后已由模拟器自动移除；人工清理计划为空，没有额外删除文件。没有采集自动删除前的实际物理分配量，不能把逻辑值当净释放量。
- 结束 C/D/E 可用约 19.32/35.60/58.20 GiB。E 盘相对开始观察净增加约 1.00 GiB，包含可能的并发写入和系统回收影响，不全部归因于本任务清理。
- 没有新增 worktree；仅保留 `E:/dsha`。没有删除历史截图、APK、旧验收证据、基础 AVD 或依赖缓存。
- 留存 `E:/dsha/build/copy-edit-mobile/20261110/arm64-research`：查询文本、探测脚本、摘要及少量原生文件，收尾统计约 0.78 MiB 逻辑长度；不是完整运行环境备份。
- 测试状态摘要保持 `c3c2d3fdaea84dd895df1621af4660f26db222e7429fca2f17041c7907f53e40`。没有通过 ADB 查询或操作物理手机；上述摘要是工作区测试数据，不冒充对生产数据的检查。
- 原始证据：`existing-translation-probe.json`、`proot-chain-probe.json`、`explicit-linker-probe.json`、`explicit-linker-env-probe.json`、`emulator-process.json`、`cow-cleanup-result.json`、`final-receipt.json`。原始失败与纠正分开留存。
