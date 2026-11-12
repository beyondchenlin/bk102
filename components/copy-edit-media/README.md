# Android 文案剪辑媒体模块

Standard和独立验收APK复用同一实现。模块minSdk30、Java17、Media3 1.11.1，根工程与实验工程使用不同build目录。Low工厂返回null。生产工厂保留`HOST_DEVICE_VERIFIED=false`，独立测试通过不自动开启生产能力。

`NativeWebMediaBridge`只注册当前回环同源主帧；页面代次/前后台/当前WebView失效时退役会话。固定RPC解析冻结计划与授权素材，不接受页面传入文件路径或任意URL。`NativeMediaSession`在单一worker准备，在前台主线程调度编码；提交前重查修订/计划hash和输出，失败或取消保留上次完整成片。超时重试身份幂等，不重放新业务。

`AuthorizedAssets`流式复制并核验SHA，`NativeAssetProbe`一次记录实际尺寸/方向/PTS，后续取帧复用索引，仍核验文件完整性。`NativeAssetTasks`只缓存本会话已拥有的图像；任务结果只通过随机身份的同源GET/HEAD读取，支持单Range，拒绝多Range。分享用仅cache/copy-edit-shared目录的FileProvider；accepted、opened和failed分别记录，系统选择器打开不代表用户已完成发送。

mobile.31：按真实源PTS映射到30fps工程，最长10分钟；竖屏1080×1920输出，预览直接在360×640画布合成。保留视频原声及其裁切/分割时间，可单独静音；原声、配音、音乐按活跃音轨统一预留峰值。PNG最多30张，每张1080×400；单资产256MiB、素材总计512MiB/240条，成片512MiB，图像缓存64张/32MiB。CFR/VFR/60fps定向样本、2913帧长视频和短片原声预览/导出有独立模拟器证据；不代表全部格式、10分钟满载或ARM64手机性能矩阵。前后台切换取消活动任务，不提供后台续导。

构建：根工程`:copy-edit-media:compileDebugJavaWithJavac`；定向HTTP Range测试`:copy-edit-media:testDebugUnitTest`。Android实际门禁位于`experiments/copy-edit-media`，最新结果见`docs/product/copy-edit-mobile-progress.md`，包括未通过的默认播放稳定性与完整WebView界面门禁。没有修改Media3二进制、编解码降规格或放宽准确性/150ms播放间隔门槛。
