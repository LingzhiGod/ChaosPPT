# ChaosPPT

**面向 Agent 的 HTML 演示文稿引擎与 Skill。** 在 HTML/CSS/JS 中设计，由 Chromium 排版、检查并导出 PDF / 图片式 PPTX。

当前版本 v0.4.0，Node.js 20+。可直接运行，默认离线素材，无服务端账号。

Skill 推荐采用 [主题先行设计流程](skills/chaosppt/references/design-workflow.md)：先确定全稿美学方向、统一背景/配色和各级字体（含各级标题的字号与颜色），写入项目 `design-spec.md` 与共享 `theme.css`，再开始代表页和整稿设计。默认不逐页交替深浅主题；需要变体时，先定义其适用页面角色。

Skill 默认内置 [PPT 通用设计原则](skills/chaosppt/references/design-principles.md)：跨页共享主题与语义色、清晰的层级与留白、按比较/趋势/构成/分布/关系等任务选图、表格精确查数、数据编码准确性和全稿视觉审阅。具体视觉样式继续由用户品牌与项目主题决定，规则由 Agent 在规划、编写和交付前执行。

Skill 默认内置防御性文案约束：页面呈现有证据支持的观点，省去 Agent 自行追加的“待测”“待补充”“真实材料待补充”等占位角标和免责小字。缺材料时收窄结论或重组页面，制作待办进入备注；用户要求的业务状态、必要来源和数据口径按语境保留。规则与改稿示例见 [PPT 文案风格](skills/chaosppt/references/copy-style.md)，生成时由 Agent 执行，渲染器保留用户的原始文字。

## 快速开始

在仓库目录执行：

```sh
npm ci
npx playwright install chromium
node src/cli.js init ./my-deck
node src/cli.js dev ./my-deck --port 4173
```

浏览器打开终端返回的本机 URL。修改源文件后自动刷新，左右方向键翻页，F 切换演示布局。画布始终保持逻辑尺寸，预览只做整体缩放。

```sh
node src/cli.js inspect ./my-deck --json
node src/cli.js render ./my-deck
node src/cli.js export ./my-deck --format pdf,pptx
node src/cli.js verify ./my-deck
```

仓库提供 `examples/demo` 三页完整中文演示，可直接运行 `npm run demo`。示例字体为本地 Noto Sans SC（OFL），包含中文、长标题、SVG 与显式等待的异步 Canvas 图表，数据均为合成数据。

若系统 npm 缓存存在权限问题，可使用 `npm ci --cache /tmp/chaosppt-npm-cache`；无需修改用户全局缓存权限。

## 安装为自带引擎的 Skill

```sh
npm run install-skill
# 或指定一个尚不存在的目标目录
node scripts/install-skill.mjs /absolute/path/to/skills/chaosppt
```

默认安装到 `$CODEX_HOME/skills/chaosppt`，未设置 CODEX_HOME 时使用 `~/.codex/skills/chaosppt`。安装器复制 Skill、引擎、模板和锁文件，并安装运行依赖与 Chromium。为保护已有技能，目标已存在时停止而不是覆盖。更新时可先安装到新目录验证，再由用户替换旧目录。

之后可以请求：

> 使用 $chaosppt，把这些材料做成 12 页演示文稿，统一风格，导出 PDF 和 PPTX。

安装后的 Skill 自带引擎，不依赖当前仓库的路径。仅手动复制 `skills/chaosppt` 文件夹时，需通过 `CHAOSPPT_ENGINE` 指定本仓库。应用若尚未显示新 Skill，重新打开会话加载技能列表。

## 已实现能力

- 严格 `deck.json` 协议、稳定页面 ID、显式页序、大纲/来源/讲稿元数据。
- 每页独立 HTML 或片段，保留完整文档的 head / body 属性，支持原生 JS、ES modules、SVG、Canvas。
- 固定画布、CSS Grid/Flex 基础布局类、共享 CSS 变量主题。
- 母版 content 插槽、标题/页码/总页数占位符。
- 本地自定义字体与变量字体，主动加载和失败诊断。
- 本机预览、键盘翻页、淡入换页、文件变化刷新。
- Promise 就绪协议、捕获钩子、图片解码、字体等待、晚发起资源等待、布局稳定采样、超时保护。
- 越界、裁切/滚动容器溢出、小字号、资源/脚本/字体失败的结构化诊断。
- PNG（1–4 倍）、浏览器文本/矢量 PDF、截图 PDF、图片背景 PPTX（含讲稿与来源备注），支持原生 MP4/GIF 嵌入。
- 导出错误阻断，旧产物保护、构建锁、原子目录替换。
- 导出验证：源文件指纹、文件哈希、尺寸、页数、PPTX 顺序、内嵌图片与铺满位置。
- 配套可独立运行的 Skill、中文示例、单元/浏览器/集成回归测试。

## 项目结构

```text
deck.json           页面顺序、画布、字体、母版、讲稿
slides/*.html       每页设计源
masters/*.html      可选共享页面骨架
theme.css           全局视觉语言
assets/*            本地字体、图像、数据、脚本
materials/*         用户提供的资料（自行添加）
dist/               全部由引擎生成
```

完整配置、API、错误码与资源路径规则见 `skills/chaosppt/references/engine.md`。

### 异步图表

```html
<script>
  ChaosPPT.waitUntil(
    (async () => {
      const response = await fetch("../assets/data.json");
      if (!response.ok) throw new Error("数据加载失败");
      const data = await response.json();
      await document.fonts.load('400 24px "Noto Sans SC"');
      // 在这里使用 data 绘制图表，绘制完成后让 Promise 结束。
    })(),
  );
  ChaosPPT.onCapture(() => {
    // 停止自己管理的动画循环，设置导出时的最终静态状态。
  });
</script>
```

在脚本初始化阶段注册任务。对于 Canvas、未来定时器或自定义动画，仅等网络空闲不足以知道内容已完成。

### 导出与输出目录

默认输出 2 倍 PNG，PPTX 页面为一张高清图。PDF 默认走浏览器打印，尽可能保留文字和矢量；Canvas 等内容仍以位图呈现。`--pdf-mode raster` 使用页面截图生成 PDF。所有格式使用相同比例，PDF 使用屏幕媒体布局以减少打印样式差异。

**成功的 render/export 会替换整个引擎专属 dist。** 请勿在 dist 保存源文件。只 render PNG 会移除上一次的 PDF/PPTX，交付前最后执行 export。失败的 export 保留前一次产物；`verify` 会发现源文件已变化。无 `.chaosppt-output` 标记的既有 dist、文件或符号链接受保护。

`--slides` 仅用于 inspect/render，按大纲顺序选择页；export 始终完整导出。`verify` 返回 `partial`，用于识别局部渲染。

退出码：0 成功；1 检查/验证失败；2 参数、配置或运行环境错误。`--json` 下结果与错误都是 stdout 上的 JSON。

## 当前边界

- 兼容模式的 PPTX 基础页面为图片；可编辑模式映射原生文字、基础形状和独立图片。复杂图表/表格仍可能栅格化；标记的 MP4/GIF 是原生媒体对象。换页动画仅在 HTML 预览中实现。
- 无任意 HTML 自动拆页、拖拽编辑器、复杂图层面板、主题编辑 GUI。
- 浏览器直接运行 JS；JSX/TypeScript/npm bare imports 需创作者自行预编译。
- 布局诊断不等于视觉审稿：刻意重叠、滤镜、缺字、图表内容与信息准确性仍需检查。
- `fonts[].sample` 触发字体加载，不是全面字形覆盖检查；元素报告的 fontFamily 是 CSS 字体栈而非逐字实际使用字体。
- `verify` 验证结构、尺寸、哈希和 PPTX 图片顺序，并非 PDF 像素比对或 PowerPoint/WPS 的真实应用兼容性认证。
- 随机数可复现，日期、外部接口和作者未停止的 JS 动画仍可能变化。
- 默认导出阻止外部 HTTP/WebSocket；预览是可信本机创作环境。对于不可信代码请使用操作系统/容器隔离，避免在项目根存放凭据。
- 服务器仅监听 127.0.0.1，拒绝跨项目路径和逃逸符号链接；这不等同于恶意脚本隔离。

## 开发与验证

```sh
npm test
npm audit
node src/cli.js --help
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/chaosppt
```

测试覆盖配置、路径边界、浏览器预览与刷新、异步任务、延迟背景图、字体/图像失败、长标题裁切、WAAPI 捕获一致性、HTML 属性保留、PDF/PPTX 封装、产物篡改与旧输出保护。测试使用临时目录，不修改示例源文件。

主要模块：`project` 协议、`server` 页面组装、`browser-runtime` 生命周期、`diagnostics` DOM 测量、`renderer` 构建、`verify` 产物校验、`cli` 命令入口。锁文件固定依赖；对 PptxGenJS 的 image-size 依赖使用修复版本覆盖。

依赖资料：[Playwright](https://playwright.dev/docs/api/class-page)、[PptxGenJS](https://gitbrent.github.io/PptxGenJS/docs/api-images/)、[pdf-lib](https://pdf-lib.js.org/)、[Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)。

## MP4 与 GIF 原生嵌入

在原生 HTML 元素上添加 `data-pptx-media`：

```html
<video
  data-pptx-media
  src="assets/clip.mp4"
  poster="assets/poster.png"
  controls
  preload="metadata"
  style="width:640px;height:360px;object-fit:fill"
></video>
<img
  data-pptx-media
  src="assets/animation.gif"
  style="width:640px;height:360px;object-fit:fill"
  alt="动画示例"
/>
```

- **HTML**：正常视频/GIF 播放。
- **PPTX**：原始 MP4/GIF 真正内嵌，而非视频链接或静态截图。
- **PDF / PNG**：视频显示封面，GIF 固定首帧。

MP4 必须提供本地 PNG/JPEG 封面。媒体采用顶层矩形、匹配宽高比；旋转、裁剪、圆角、透明度或覆盖在媒体上的文字属于受限样式，会触发诊断。HTML 自动播放/静音/循环不自动映射到 PPTX。目标应用的编解码器、放映模式和版本会影响播放；本项目的封装验证不等于 PowerPoint/WPS 实际播放认证。

```sh
node src/cli.js dev examples/media --port 4174
node src/cli.js export examples/media --format pdf,pptx
node src/cli.js verify examples/media
```

更多规则见 Skill 的 `references/engine.md` 媒体章节。当前导出引擎无需 ffmpeg。

## 双模式 PPTX 导出（v0.3）

```sh
# 兼容模式：默认行为不变，保留浏览器页面外观
node src/cli.js export ./my-deck --pptx-mode compatible

# 可编辑模式：优先映射原生对象，复杂局部保留为图片
node src/cli.js export ./my-deck --pptx-mode editable
node src/cli.js verify ./my-deck
```

| 内容                           | 兼容模式       | 可编辑模式                             |
| ------------------------------ | -------------- | -------------------------------------- |
| 文字                           | 页面截图       | 原生文本框，按视觉行/富文本片段拆分    |
| 背景、矩形、圆角卡片、实线边框 | 页面截图       | 支持范围内映射原生形状                 |
| 普通图片                       | 页面截图       | 独立图片对象，保留已渲染的裁剪结果     |
| Canvas、SVG、复杂特效、表格    | 页面截图       | 局部或必要时整页栅格化回退             |
| 标记的 MP4/GIF                 | 原生媒体       | 原生媒体                               |
| PDF/PNG                        | 浏览器静态输出 | 同一浏览器静态输出，不受 PPTX 模式影响 |

转换清单在 `dist/conversion.json`，包含各类对象数量、回退元素及原因、字体要求。需要固定局部外观时，在容器上设置 `data-pptx-export="raster"`。可编辑模式是混合导出，不承诺 95% 原生化，也不把 DOM 文字统计当作整体可编辑率。

**字体与验收：** 可编辑 PPTX 不内嵌字体，接收端需安装报告中的字体；否则可能出现替换、错位或缺字。文字采用视觉行/片段文本框，尚非完整段落自动重排。务必检查实际 PPTX 的渲染，不能仅看参考 PNG。兼容模式继续作为视觉保真优先的选择。

示例源文件：`examples/editable`。两种模式都会替换该项目的 dist；需要保留对照产物时，先复制到项目目录之外。无需修改现有 HTML 即可尝试新模式；复杂 CSS 会被明确回退而非假装已经转成原生对象。

## 显式控件与原生编组（v0.4）

新项目不再依赖自由 HTML 的自动猜测。`init` 默认生成两页显式控件模板；HTML/CSS 负责布局，控件声明负责 PPT 对象边界。

```html
<section class="slide" data-pptx-layout="controls">
  <div data-pptx-group="card">
    <div data-pptx="text" data-pptx-id="body">
      一个完整段落，包含 <b>加粗文字</b>。<br />换行仍在同一个文本框内。
    </div>
  </div>
</section>
```

- `text` → 一个富文本框，不再按行/加粗片段拆成多个对象。
- `shape` / `image` / `media` → 各一个原生形状、图片或媒体对象。
- `group` 或 `data-pptx-group` → 真正的 PPT 编组，支持嵌套；组内对象仍独立可编辑。
- `raster` → 必要时显式保留复杂绘制，并按非透明像素裁紧边界。
- 未标记的可见内容、重复 ID、不支持的控件结构会明确报错；兼容模式仍可输出浏览器外观。

新创作使用显式控件；旧 HTML 的推断式导出保留为迁移路径。详见 [控件契约](skills/chaosppt/references/controls.md)。组容器不直接绘制背景，背景应另设 shape；一个文本框内使用 span/b/strong/em/i/u/s/br，不嵌套其他控件。

```sh
node src/cli.js export examples/controls --pptx-mode editable
node src/cli.js verify examples/controls
```
