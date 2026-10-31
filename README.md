# 黄果TV (huangguoTV)

参考 [N3urda/hongguoTV](https://github.com/N3urda/hongguoTV) 的 kotlin-tv 原生电视端方案开发的**黄果短剧** Android TV / 手机播放器。

- 内容来源：`huangguoai.com`（黄果短剧网站），抓取规则移植自 [jinshengchan/huangguo-fongmi](https://github.com/jinshengchan/huangguo-fongmi) 站点脚本
- 纯 Kotlin + 原生 View（RecyclerView 焦点导航），无 Compose，低配电视盒子也能流畅跑
- 播放：media3 ExoPlayer，直接播放网站下发的 HLS（.m3u8）地址，自动带 UA/Referer

## 下载与安装

### Android App（手机 / 电视 / 盒子）

1. 到 [Releases](https://github.com/lifeiyu-44/huangguoTV/releases) 下载最新 `huangguoTV-v1.0.3.apk`
2. 安装方式任选：
   - 手机：文件管理器里直接点 APK 安装（首次需在系统里允许"安装未知来源应用"）
   - 电视/盒子：`adb install -t huangguoTV-v1.0.3.apk`，或拷到 U 盘用电视自带文件管理器安装
3. 要求 Android 8.0+，横屏，电视（LEANBACK_LAUNCHER）和手机（LAUNCHER）双入口都有图标
4. v1.0.2 起内置镜像直连（主站不通时自动发现并切换官方镜像），**无需 VPN** 直接用
5. APK 为个人密钥签名，不能覆盖安装其他签名的版本；升级请先卸载旧版（卸载会清收藏和续播记录）

### PC 版（Windows，浏览器界面）

1. 安装 [Node.js](https://nodejs.org/)（LTS 即可）
2. 克隆或下载本仓库 ZIP 并解压，双击 `pc\启动黄果TV.vbs`（或在 `pc\` 目录运行 `node server.js`）
3. 浏览器打开 `http://127.0.0.1:8421` 即可使用（部分环境会自动弹出）
4. **无需代理/VPN**：主站 huangguoai.com 被 DNS+SNI 封锁，PC 版自动从官方发布页 `hgai5.com` 发现并直连可用镜像域名，浏览/搜索/详情/播放全部直连；镜像失效时自动重新发现
5. 可选：安装 [ffmpeg](https://ffmpeg.org/download.html) 并加入系统 PATH。"转 MP4 / 下载本集 / 自动缓存"需要它（仓库内已带路径自动探测，装好即可）；没装 ffmpeg 时仍可在线 HLS 播放，只是不能转 MP4 和下载

### 桌面版（Electron 窗口应用）

`desktop/` 是 PC 版的桌面封装，功能与 PC 版完全一致：

```bash
cd desktop
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
node node_modules\electron\install.js   # npm 11 会拦截 postinstall 下载，需手动执行
npm start
```

- 窗口内嵌 `pc/server.js` 本地服务：8421 端口已有服务在跑就直接复用，否则自动启动；关窗即退出
- 单实例锁：重复启动只会把已有窗口带到前台

## 功能

| 功能 | 说明 |
|---|---|
| 首页/分类 | 首页推荐 + AI成人短剧 / AI成人漫剧 / AI换脸 / AI魔改 / 排行榜，滚动自动翻页 |
| 搜索 | `/search/video/{关键词}/` 分页搜索 |
| 详情选集 | 解析详情页 `videoInitialData` 与选集网格，全部集数一键直达 |
| HLS 播放 | `epPlaySrcs[集数]` → `videoSrc` → 页面 m3u8 兜底 |
| 封面解密 | 站点封面为 AES-CBC 加密 base64（key `f5d965df75336270` / iv `97b60394abc2fbe1`），本地解密显示 |
| 自动连播 | 播完自动下一集 |
| 断点续播 | 每部剧记住集数 + 进度，详情页显示"继续播放 第N集" |
| 收藏 | 本地收藏片单，首页"收藏"标签页查看 |

## 遥控器操作

- 方向键移动焦点，OK 确认，返回键回退
- 搜索页自动弹出系统输入法（电视上为屏上键盘）
- 播放中按 OK/方向键呼出播放控制条

## 播放中方向键（遥控器 / 键盘，Android 与 PC/桌面版一致）

- **→ 快进（按住/连点）**：按一次 2 倍速，按住或连点逐级升到 3、4、5，最高 6 倍；**松开即恢复原速**。快进中画面中央大字显示当前倍数（黄色"N倍 快进中"），左上角有倍速角标
- **← 后退**：每按一次后退 10 秒，按住连续后退
- **↑ 上一集 / ↓ 下一集**：边界时提示"已是第一/最后一集"；切集自动恢复正常速度
- 所有提示浮层带淡入淡出/缩放平滑动画

## PC 版更多说明

- **播放与下载均为 MP4 格式**：服务端把 HLS 分片下载解密后用 ffmpeg 转封装成 MP4（缓存在 `pc/cache/`），播放器优先直接播 MP4（可任意拖动），未转好时先用 hls.js 在线播，点播放器右上角"转MP4"即可切换
- "下载本集"按钮直接下载 `.mp4` 文件
- **自动联播**：播完自动弹 5 秒倒计时切下一集（可取消/立即播放/关闭开关），操作行还有上一集/下一集；界面仿官网播放页布局（左播放器 + 右侧"选集"侧栏，黄色主题）
- **自动缓存**（默认开启）：打开播放器后，服务端从当前集起把最近 10 集依次转成 MP4 存到 `pc/cache/`（一次一集，不与播放抢带宽）；选集侧栏显示缓存进度，已缓存的集带 ✓ 标记，之后播放直接读本地文件、不再联网解析。关闭开关即取消队列，状态记忆在本地
- **缓存目录可设置**：播放器选集侧栏"📁 缓存目录"可改成任意绝对路径（如 `D:\hg_cache`），切换时旧缓存文件自动移动到新目录（跨盘符自动复制），设置持久化在 `pc/config.json`，重启后生效；转码进行中会拒绝切换以免搬走半成品
- **清晰度**：官网源为单码率、按剧固定（多数 720p，部分剧仅 480p），官网播放器无清晰度切换；播放地址的 `v=` 参数改档无效（v=2 与 v=3 同画质，v=1/4/5 直接 403），PC 版始终取官网最高画质，无法再提升（除非 ffmpeg 放大插值，属伪高清）

## 构建（Android APK）

任意 JDK 17 + Android SDK（platform 34、build-tools 34.0.0）环境即可：

```bash
gradlew assembleRelease
```

产物在 `app/build/outputs/apk/release/`。

签名：仓库**不包含** `huangguo-release.jks` 和 `keystore.properties`（个人密钥不上传）。自行构建 release 请先 `keytool -genkeypair` 生成密钥，再在项目根目录建 `keystore.properties`（`storeFile/storePassword/keyAlias/keyPassword`），或用环境变量 `HUANGGUO_KEYSTORE / HUANGGUO_STORE_PASSWORD / HUANGGUO_KEY_ALIAS / HUANGGUO_KEY_PASSWORD`。没有签名配置时 release 构建为未签名 APK，自行 `apksigner` 签名即可安装。

## 结构

```
app/src/main/kotlin/com/huangguo/tv/
  HuangguoApi.kt    抓取与解析（卡片网格 / 排行 / 搜索 / 详情 / 播放地址）
  CoverCipher.kt    封面 AES-CBC 解密
  ImageLoader.kt    封面下载 + 解密 + 缓存
  Storage.kt        收藏 / 断点续播（SharedPreferences）
  MainActivity.kt   屏幕栈（Home/Detail/Search/Player）
  HomeScreen.kt     标签页 + 卡片网格 + 翻页
  SearchScreen.kt   搜索
  DetailScreen.kt   详情 + 选集 + 收藏
  PlayerScreen.kt   ExoPlayer 播放 + 连播 + 续播
  CardAdapter.kt    卡片列表
  Ui.kt / Models.kt 工具与数据模型

pc/                 PC 版（Node 本地服务 + 浏览器界面，端口 8421）
desktop/            桌面版（Electron 封装，内嵌 pc/server.js）
```

## 说明

- 视频文件由黄果网站下发的 CDN（如 `yd-hls.hzjvlo.cn`）提供，本应用只做网页解析，不提供任何内容。
- 站点改版可能导致解析失效，解析规则集中在 `HuangguoApi.kt`，按 fongmi 脚本同步更新即可。
- 仅供个人学习研究使用。
