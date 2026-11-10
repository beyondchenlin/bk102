# BK 素材库接入 T01：整份草案导入与四轨往返

2026-11-11。范围：新素材库向 BK Harenss 交付可编辑候选工程的最小契约。用户授权完成原子导入、能力检查、裁切映射，验证 30 秒、7 镜头四轨导入／编辑／保存重开，并做两轮 review。未下载模型，未调用真实 AI／配音服务，未操作手机、已有服务或用户数据；不代表新 APK 已发布。

## 已实现的流程

1. 用既有媒体通道登记选中的文件。桌面使用 `upload`，手机沿用 `native-upload` 与原生索引提交；本轮实际走了桌面登记流程。草案不接受路径、URL、下载凭据或调用者自填的 PTS 索引。
2. `GET /api/copy-edit/draft/capabilities` 返回库身份、协议版本、支持能力与边界。调用方先检查能力；服务端仍再次检查，未知必需能力、字段和画幅不能默默忽略。
3. `POST /api/copy-edit/draft/prepare` 完整检查一份草案。素材的稳定 ID 映射到本库已登记文件，核对 SHA-256、长度、类型、真实 PTS 边界、四轨时间范围及空间余量。准备结果有 15 分钟票据，尚无可见新工程。
4. `POST /api/copy-edit/draft/commit` 再验票据、正文摘要、索引和文件字节，在一次存储提交中发布新候选工程与持久回执。不能指定已有工程作为覆盖目标。
5. `GET /api/copy-edit/draft/receipt?workspaceId=…&operationId=…` 查询最终结果。丢回执时先查询，再使用相同请求重试；不重新生成整个业务。已经编辑的工程不会因重放导入而回退。

入口沿用 DSH 已有的连接路由及鉴权边界，没有新监听端口。`workspaceId` 只做库身份校验，不是认证凭据。能力表描述导入／存储能力，不代替 Android 或桌面媒体提供方的实际播放、导出能力检查。

源文件：[协议类型](../../plugins/dsh-copy-edit/contracts/draft-import.d.ts)、[服务端校验与事务](../../plugins/dsh-copy-edit/src/draft-import.mjs)、[插件注册](../../plugins/dsh-copy-edit/src/index.ts)、[状态存储](../../plugins/dsh-copy-edit/src/store.mjs)。

## 协议与边界

请求为 `{workspaceId, operationId, plan}`。`plan` 的全部数组必填，空数组明确表达没有该轨内容；不能用未知字段偷渡“必需扩展”。计划包括 `schemaVersion:1`、草案 ID／revision、requiredCapabilities、画布、原文、素材清单，以及 clips／stickers／voices／music／warnings／gaps。BK 内部工程仍是 schemaVersion 2。

准备返回 ticketId／planHash／expiresAt；提交请求只携带 workspaceId／operationId／ticketId／planHash。提交回执包含新 projectId／revision、实际导入能力、素材 ID 映射、源裁切映射、偏差及缺口。文案生成服务未来的句段、选片与审阅数据留在素材库，不把这些服务内部字段直接塞进 BK 工程；T06 接口另行实现。

| 项目 | 本次规则 |
|---|---|
| 项目时基 | 1080×1920，30/1 fps；实际 BK 上限 1800 帧／60 秒。30 秒、6—8 镜头是主案例，不会把超时文案静默截到 30 秒 |
| 源视频裁切 | 微秒 PTS，源首帧归零，与登记索引一致；`[inUs,outUs)`。入点必须存在，出点必须是下一帧 PTS 或 endUs。拒绝猜测或扩大范围 |
| VFR 映射 | 源索引精确取帧；按既有 outputFrames 转为工程帧，回执记录原 PTS、实际索引、工程帧数及量化差的整数分子／分母。容忍已存在的最多 1μs PTS 量化误差，不用平均帧率推源索引 |
| 音频与贴片 | 配音保留独立 startFrame 和源 inUs/outUs；BGM offsetSamples 是 48kHz 归一化样本偏移；贴片可全程或分段，图片沿用 1080×400 PNG |
| 体积与数量 | 计划 256 KiB，请求包另有 4 KiB 封套预算；一份草案最多 64 个引用、120 个镜头／每类片段，单文件最多 512 MiB、合计 2 GiB；文件必须已登记，不在提交阶段复制 |
| BK 容量 | 既有本机 BK 库仍最多 100 个工程、200 个素材文件。新素材库 10 万镜头的目标不等于把所有文件塞入 BK，仅传最终选用素材 |
| 准备与重放 | 同时最多 16 份有效准备；最多保留 256 个未提交操作身份，满时明确拒绝。过期正文可压缩，操作→内容绑定不丢；同内容可续领新票据，旧票据失效。提交回执不进入旧编辑操作的 100 项轮换窗口 |
| 空间 | 准备、提交都检查可用空间，至少覆盖两份当前状态快照大小＋64 MiB；实际写入失败仍回滚。本轮测试未触发用户磁盘阈值，也未创建大副本 |
| 身份与并发 | 新候选按库身份＋operationId 稳定命名；同操作不同内容拒绝。后续编辑仍使用 BK 原有 expectedRevision，过期编辑拒绝 |

原子性范围是“一份工程与其提交回执”，由既有串行写队列、临时文件同步和原子重命名完成。媒体已在此前登记，导入失败不会删除它们或把已有媒体入库也回滚。突然断电、文件系统损坏和异常退出残留写锁不在本轮故障注入证明范围内；残留锁沿用原先核验规则，不自动抢占别人的进程。

名称冲突可以导入，但回执与工程保留提醒。没有素材时保留原文及明确的 pendingGaps；这是一份未完成候选，预览／导出编译拒绝。此轮没有实现缺口可视化、缺口人工补齐编辑器或警告 UI；完整候选可正常四轨编辑，缺口方案需重新生成完整候选后导入，T08 再补界面。旧字幕／叠加字段按合成副本逐字段保留，不宣称新增了字幕／叠加渲染。

错误处理：协议／范围／能力错误先修输入；OPERATION_CONFLICT 不能用同操作号换内容；TICKET_EXPIRED 可用同内容重新准备；ASSET_CHANGED／ASSET_NOT_READABLE 必须重新核验素材；INSUFFICIENT_SPACE 先处理空间；未知 I/O 失败先查回执。查询 not_committed 仅表示尚无已提交结果，不授权换输入。调用方不得对这些错误无限重试。

## 实测与两轮 review

复用已有 Node 24、TypeScript、FFmpeg，没有安装依赖。所有执行写入任务独占的 mkdtemp 目录，成功及失败 teardown 回收；构建只更新 Git 忽略的插件 lib。当前产物没有部署进正在运行的服务。

| 检查 | 结果与证据边界 |
|---|---|
| 真实媒体往返 | 7 个 7 秒色块视频，分别选取第 1 秒起的 4/4/4/4/4/5/5 秒，共 900 帧；另有 30 秒测试配音、7 秒循环 BGM、PNG，10 文件共 3,587,629 字节。实际 DesktopMedia.importStream 登记与探测，再走生产共用草案 HTTP 处理器，不用内部 write 假造媒体登记 |
| 编辑及保存 | 视频／配音／BGM／全程贴片分割、替换镜头、移动分段贴片、撤销重做、文案保存、两次关闭重开；导入时 7 镜头，分割后 8 段，仍 900 帧。工程及编译结果重开一致，原件及登记文件摘要不变 |
| 边界负例 | 不支持能力／画幅、未知字段、畸形输入、VFR 非帧边界、缺资产、字节／索引变化、错库／错摘要、过期票据、同操作换内容、深层 JSON、超长时间、空间不足、写入／同步／重命名失败均拒绝；旧 state 与工程不出现半提交 |
| 幂等与旧副本 | 20 个并发提交只有一个新工程；105 次编辑轮换后仍能查询／重放原回执；旧 revision 拒绝。合成旧工程四轨内容及字幕／叠加扩展字段保留，未借用用户工程 |
| 实际构建入口 | 构建后的 CopyEditService 经真实 Cordis 生命周期注册路由、提交、重开、撤销路由；连接注册表为隔离替身，不是网络鉴权或手机测试 |
| 最终软件门禁 | typecheck 与 build 通过；完整插件测试＋构建入口共 **137 项通过，0 失败／取消／跳过**。其中真实媒体用例不因缺 FFmpeg 而静默跳过 |

第一轮 review 聚焦事务、身份和恢复：修复过期准备丢失操作绑定、写入／同步异常遗留临时文件、已准备正文缺少提交前摘要重验、缺口分支时间边界不足；对应负例通过。

第二轮 review 聚焦接入与范围：补足空间不足、畸形列表／颜色、请求封套预算、文件路径重新核验、VFR 量化回执；检查编译产物、正式路由注册／撤销及旧副本保真。两轮均由同一执行者完成，未冒称独立审阅者。

入口验收脚本首跑误用了此版本 Cordis 不存在的 start/stop API，属于测试夹具错误；按已安装包的生命周期 API 修正为 fiber.dispose 后通过。该次遗留的 96 字节临时夹具已核验进程退出、文件锁、边界及无链接后回收。未将本轮描述为第一次运行即全绿。

本机证据目录：`E:/dsha/build/bk-media-library-t01-import-20261111/`。保留 final-tests.log、typecheck.log、build.log、package-members.json 和 cleanup.json；测试源码已入仓。此前 `bk-media-library-t01-20261111` 的命令级探针是历史有限证据，本轮未覆盖或删除。

复现（插件目录、使用已有 FFmpeg）：

```powershell
$env:COPY_EDIT_FFMPEG='E:\ffmpeg\bin\ffmpeg.exe'
$env:COPY_EDIT_FFPROBE='E:\ffmpeg\bin\ffprobe.exe'
npm run typecheck
npm run build
node --test tests/*.test.mjs scripts/verify-draft-import-entry.mjs
```

T01 的本次最小导入闭环通过，可以进入 T02 服务与任务底座。T03 四来源真实传输、T06 文案与选片、T07 真配音、T08 手机两尺寸交互与完整缺口编辑、T09 播放／ARM64／12GB 均仍按原门槛独立验收。未用这些单元／接口结果替代 UI 截图、手机丢帧、音频尾音或 AI 匹配精度。

本次未递增 APK／插件发布版本、未更新冻结 APK 资产。以后打包手机版本时，需将新增 `lib/draft-import.mjs` 和 `contracts/draft-import.d.ts` 纳入该次精确成员允许清单及受管安装映射，再验最终包；本轮没有执行历史 update-copy-edit-preview.py 或修改旧回执。
