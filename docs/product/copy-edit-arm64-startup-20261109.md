# 完整 ARM64 首启/更新续验：本机环境阻塞

2026-11-09 23:40。用户要求完整 ARM64 APK 首启、运行时更新和维护页恢复验收，限定独立模拟器，禁止生产手机和现有数据；随后确认目前只有本机 Intel Windows。

**结果：应用验收尚未执行，不能确认“不再卡维护页”。** 本轮在 Android 模拟系统就绪前遇到平台阻塞，没有安装任何 APK，没有改动应用实现或重新打包。交付仍为 mobile25，SHA-256 `84a0a4fc50fbb1285f3b7aad8db2555c3fe01c6f9e2ec2497a5552582f82d2dc`，与上一轮相同。

## 已做的环境检查

- 本机 Intel i7-12700KF / Windows；SDK Emulator 37.2.13。已有 DSHA_ARM64 只有配置和 1 MiB 初始盘，系统镜像已不存在。现有在线远程连接也只有这台 Windows 主机。
- 复用 SDK、QEMU 后端和同一仓库；本任务建立独立 `BK_Harenss_ARM64` AVD，所有 ADB 请求固定 `emulator-5582`。没有查询或操作物理手机。
- 从 Google 官方地址取得 API30 ARM64 r16，1,244,324,730 字节，官方 SHA-1 `0e66987d6b4db2e278af83d453ce5d74a7e6ced3` 校验通过；另记录 SHA-256 `097c2808a738ba4c19038b75a085750dd61a7178c0234b14ac5f8270dd8cff54`。展开 3,360,036,656 字节。
- 官方 launcher 在该精确镜像上实际退出 code1：`Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on x86_64 host`。与 [Google 启动器源码](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/emulator/main-emulator.cpp) 的架构检查一致。
- 附加 QEMU TCG 软件全系统仿真探测确实启动了 ARM64 内核，但没有进入 Android 就绪状态。第一轮图形库路径异常；按官方 launcher 的 `ANDROID_EMULATOR_LAUNCHER_DIR` 设置修正，并关闭 Vulkan 后只追加一次启动探测。第二轮仍停滞，观察到 CPU 累计 54.375 秒后连续 75 秒不变，ADB 始终 offline。
- 两轮控制台停止均超时；核对记录中的进程路径、PID、启动时间及本任务 AVD/端口后，仅终止本轮空白模拟器进程。最终已确认无 qemu/emulator/netsim 进程遗留。没有继续更换镜像或反复构建碰运气。

## 应用用例状态

| 用例 | 状态 |
|---|---|
| 精确 mobile25 全新安装与 RuntimeTrial | NOT RUN：Android 来宾未就绪 |
| 冷启动后正常进入主界面和文案剪辑 | NOT RUN |
| 健康旧版覆盖更新，测试数据摘要不变 | NOT RUN |
| mobile23 缺模块失败现场恢复后升级 | NOT RUN |
| 受控中断后的维护恢复 | NOT RUN |
| 最终包重新验收与打包 | 未执行；没有应用改动，没有新增通过结论 |

上一轮按实际安装清单展开及 ESM 导入通过的结论继续有效，但不能替代上表的设备证据。要继续这些用例，需要能运行 API30+ ARM64 Android 的独立模拟器环境，例如具备虚拟化支持的 Apple Silicon Mac 或兼容 ARM64 Linux 主机；不需要授权生产手机。

## 留存证据与空间

目录：`E:/dsha/build/copy-edit-mobile/20261109/arm64-acceptance`。

- [完整验收步骤](E:/dsha/build/copy-edit-mobile/20261109/arm64-acceptance/acceptance-plan.md)
- [官方启动器实际错误](E:/dsha/build/copy-edit-mobile/20261109/arm64-acceptance/official-launcher.log)
- [第二轮有界观察回执](E:/dsha/build/copy-edit-mobile/20261109/arm64-acceptance/boot-observation.json)
- 两轮原始小型日志、启动参数、停止回执、镜像来源/摘要、空间预算和清理清单均保留。

本轮开始 C/D/E 可用约 18.43/35.37/57.21 GiB；已提示 C 低于 20 GiB，下载和临时数据固定 E，预计峰值新增 12 GiB。收尾仅删除清单中本轮新下载镜像及全新空白 AVD 的可重建文件，执行前后验证精确边界、无重解析点、无使用进程、无文件锁和未变化的大小/时间戳；未递归删除目录。

共清理 32 个文件，逻辑长度 14,799,939,648 字节（约 13.78 GiB，含稀疏盘），Windows 文件占用计数 8,401,659,968 字节（约 7.82 GiB）。E 盘观察可用空间增加 8,538,050,560 字节（约 7.95 GiB）；差值可能含延迟回收及并发写入，不全部归因于本次删除。结束 C/D/E 可用约 18.48/35.37/57.21 GiB。

没有新增 worktree，继续仅 E:/dsha；保留小型失败证据、配置和脚本，新增大镜像及空白盘已回收。SDK、已有 AVD、历史 APK/验收证据和冻结源码未删除。测试状态文件摘要保持 `c3c2d3fdaea84dd895df1621af4660f26db222e7429fca2f17041c7907f53e40`；没有源码提交、上传或公开发布。
