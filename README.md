# ChaosPPT

**用 HTML/CSS 设计，用显式控件定义编辑边界，导出 PDF 与 PowerPoint。**

ChaosPPT 包含一个面向 Agent 的设计 Skill 和一个本地渲染引擎。新建页面采用显式控件：一段文字对应一个富文本框，一个组件对应一个原生编组；需要保留复杂绘制时，显式使用图片控件。

当前引擎版本 **0.5.0** · Node.js **20+** · Chromium / Playwright

[快速开始](#快速开始) · [安装-skill](#安装-skill) · [控件模型](#控件模型) · [导出模式](#导出模式) · [能力边界](#能力边界) · [更新日志](CHANGELOG.md)

## 核心能力

- **主题先行**：先确定美学方向、全稿背景/配色和字体层级，再设计页面
- **显式控件**：文本、形状、图片、编组、媒体和栅格化六类控件
- **完整富文本**：一个文本控件保留为一个文本框，支持局部强调与框内换行
- **原生编组**：支持嵌套组、组件整体移动和取消组合后的独立编辑
- **双模式导出**：兼容模式侧重外观，可编辑模式侧重原生对象
- **媒体嵌入**：本地 MP4/GIF 可随 PPTX 内嵌，PDF/PNG 使用静态画面
- **稳定捕获**：字体/图片等待、显式异步任务、捕获钩子、超时和布局诊断
- **可追溯验证**：源指纹、文件哈希、页序、控件、编组、富文本及媒体关系检查

已有 HTML 项目仍可使用旧推断路径；**新项目推荐显式控件，而不是任意网页自动转 PPT**。

## 快速开始

```sh
git clone https://github.com/LingzhiGod/ChaosPPT.git
cd ChaosPPT
npm ci
npx playwright install chromium

# 在空目录中创建两页中文显式控件模板
node src/cli.js init ./my-deck
node src/cli.js dev ./my-deck --port 4173
```

打开终端返回的本机地址。预览支持保存后刷新、方向键翻页，以及显式声明的控件动画和页面转场；窗口变化只缩放画布，不改变页面布局。F 切换演示布局。

在另一个终端中检查并导出：

```sh
node src/cli.js inspect ./my-deck --json
node src/cli.js export ./my-deck --format pdf,pptx --pptx-mode editable
node src/cli.js verify ./my-deck --json
```

输出在 `my-deck/dist/`。如果 npm 缓存存在权限问题，可指定独立缓存：`npm ci --cache /tmp/chaosppt-npm-cache`。

## 安装 Skill

```sh
npm run install-skill

# 或选择另一个尚不存在的安装目录
node scripts/install-skill.mjs /absolute/path/to/skills/chaosppt
```

默认安装到 `$CODEX_HOME/skills/chaosppt`；未设置 `CODEX_HOME` 时使用 `~/.codex/skills/chaosppt`。安装器会复制 Skill、引擎、模板及锁文件，并安装运行依赖和 Chromium。

安装后可以请求：

> 使用 $chaosppt，先确定整份 PPT 的统一主题、配色和字体层级，再把我的材料做成 12 页显式控件演示稿，导出可编辑 PPTX 和 PDF。

**更新已有 Skill：** 安装器不会覆盖既有目录。先安装到新的临时目录，验证后备份并替换旧目录，避免丢失本地定制。已安装的 Skill 自带引擎，更新仓库不会自动更新该副本。必要时重新打开会话以加载新指令。

如果只手动复制 `skills/chaosppt` 文件夹，需要将 `CHAOSPPT_ENGINE` 指向已安装依赖的引擎仓库；仓库内的 Skill runner 可直接定位本仓库。

## 推荐设计流程

**任务与大纲 → 美学方向 → 配色/背景 → 字体层级 → 共享主题 → 代表页 → 全稿 → 一致性审阅**

在开始第一张页面的视觉设计前：

1. 在项目 `design-spec.md` 中记录美学方向、背景政策和完整配色方案
2. 为封面标题、H1/H2/H3、正文、图表标签、图注和页脚确定字体、字号、字重、行距及颜色
3. 将决定落实到共享 `theme.css` 和母版，再开始设计页面
4. 默认全稿统一背景；需要变体时，预先规定其页面角色和文字/强调色映射
5. 通过构图和留白产生变化，不逐页临时换字体、换配色或缩字号

Skill 还包含图表选型、数据编码、可读性和文案规范：短标题、标签、要点和独立短句默认不加句号；不额外附加制作占位与防御性小字，必要来源和业务信息按语境保留。

这些是 **Agent 的创作与审阅规则**，不是已经实现的自动审美校验器。

详细参考：[设计流程](skills/chaosppt/references/design-workflow.md) · [设计原则](skills/chaosppt/references/design-principles.md) · [文案规则](skills/chaosppt/references/copy-style.md)

## 控件模型

```html
<section class="slide" data-pptx-layout="controls">
  <div
    data-pptx-group="card"
    style="position:relative;width:640px;height:300px"
  >
    <div
      data-pptx="shape"
      data-pptx-id="card-bg"
      style="position:absolute;inset:0;background:#e4ebdc;border-radius:12px"
    ></div>
    <div style="position:relative;padding:28px">
      <div
        data-pptx="text"
        data-pptx-id="body"
        style="font-size:28px;line-height:1.5"
      >
        一个完整段落，包含 <b>局部加粗</b><br />
        换行仍在同一个文本框内
      </div>
    </div>
  </div>
</section>
```

| 控件   | 标记                 | 可编辑模式的输出                              |
| ------ | -------------------- | --------------------------------------------- |
| 文本   | `data-pptx="text"`   | 一个富文本框，保留段落、内联样式和换行        |
| 形状   | `data-pptx="shape"`  | 一个原生矩形、圆角矩形或椭圆                  |
| 图片   | `data-pptx="image"`  | 一个可替换图片对象，保留渲染后的裁剪结果      |
| 编组   | `data-pptx="group"`  | 一个真实 PPT 编组，支持嵌套                   |
| 媒体   | `data-pptx="media"`  | 一个内嵌 MP4/GIF 对象，另需 `data-pptx-media` |
| 栅格化 | `data-pptx="raster"` | 一个图片对象，按非透明内容裁紧边界            |

- 每个控件需要页面内唯一的 `data-pptx-id`；`data-pptx-group="card"` 是 group + ID 的简写
- 未标记容器可以使用 Grid/Flex 布局，但不能直接承载可见文字、背景、边框等内容
- 编组背景应另设 shape 控件；文本控件本身可以有受支持的填充、边框和 padding
- 文本框内使用文字、`span`、`b/strong`、`i/em`、`u`、`s/strike`、`br`，不嵌套其他控件
- 不支持的显式结构返回 `CONTROL_INVALID`，不再静默拆成大量碎片或图片

详见 [控件契约](skills/chaosppt/references/controls.md)。

## 导出模式

```sh
# 默认：兼容模式
node src/cli.js export ./my-deck --pptx-mode compatible

# 显式控件推荐：可编辑模式
node src/cli.js export ./my-deck --pptx-mode editable

# 截图式 PDF；默认 vector 尽可能保留文字和矢量
node src/cli.js export ./my-deck --format pdf --pdf-mode raster
```

| 内容                | 兼容模式         | 可编辑模式（显式控件）                 |
| ------------------- | ---------------- | -------------------------------------- |
| 文字/形状           | 页面截图         | 原生文本框、形状                       |
| 组件编组            | 烘焙在页面截图中 | 原生嵌套编组                           |
| 普通图片            | 页面截图         | 独立图片对象                           |
| Canvas/SVG/复杂效果 | 页面截图         | 显式 `raster` 图片控件                 |
| 标记的 MP4/GIF      | 原生媒体         | 原生媒体                               |
| PDF/PNG             | 浏览器静态输出   | 同一浏览器静态输出，不受 PPTX 模式影响 |

旧的未标记 HTML 在 editable 模式下仍走推断路径，可能将文字拆成视觉行/片段。这是迁移兼容能力，不是新控件规范的行为。

可编辑模式会输出 `conversion.json`，列出控件、编组、字体和栅格化记录。**对象数量不是视觉还原率，也不代表已经达到 95% 原生化。** 兼容模式优先保留浏览器静态外观；可编辑模式需检查实际 Office 渲染和字体可用性。

## MP4/GIF 与异步内容

```html
<video
  data-pptx="media"
  data-pptx-id="demo-video"
  data-pptx-media
  src="assets/demo.mp4"
  poster="assets/poster.png"
  controls
  preload="metadata"
  style="width:640px;height:360px;object-fit:fill"
></video>

<img
  data-pptx="media"
  data-pptx-id="demo-gif"
  data-pptx-media
  src="assets/demo.gif"
  alt="演示动画"
  style="width:640px;height:360px;object-fit:fill"
/>
```

MP4 需要本地 PNG/JPEG 封面。原始媒体字节内嵌到 PPTX；PDF/PNG 使用视频封面或 GIF 首帧。HTML 的自动播放、静音、循环设置不自动映射为 PPTX 播放设置。

异步数据或 Canvas 绘制在脚本初始化时注册：

```js
ChaosPPT.waitUntil(
  (async () => {
    const response = await fetch("../assets/data.json");
    if (!response.ok) throw new Error("数据加载失败");
    const data = await response.json();
    await document.fonts.load('400 24px "Noto Sans SC"');
    // 完成绘图后再结束 Promise
  })(),
);

ChaosPPT.onCapture(() => {
  // 停止自己管理的动画循环，设置导出的静态状态
});
```

Canvas/SVG 应放在显式 raster 控件内。仅等待页面加载或网络空闲，无法推断任意图表已经绘制完成。

## 项目与输出目录

```text
my-deck/
  deck.json          页面、画布、字体、主题、母版与讲稿
  design-spec.md     设计方向、配色和字体层级
  theme.css          共享主题
  slides/            页面 HTML
  masters/           可选母版
  assets/            本地字体、图像、脚本、媒体和数据
  dist/              引擎生成的输出，不保存源文件
```

```text
dist/
  deck.pptx
  deck.pdf
  slides/            参考 PNG；不是原生 PPTX 的渲染截图
  report.json        布局/资源检查结果
  build.json         源指纹与产物记录
  conversion.json    可编辑模式的转换清单
  editable/          可编辑模式的场景和图片资源
  media/             使用媒体时的原文件与封面
```

实际文件取决于命令和导出格式。**成功的 render/export 会替换整个引擎专属 dist**；只运行 render 会移除旧的 PDF/PPTX。需要保留两个版本时，先复制到项目目录之外。失败的 export 保留上一份产物；无引擎标记的既有 dist、文件或符号链接受保护。

## 命令与检查

| 命令      | 用途                                   |
| --------- | -------------------------------------- |
| `init`    | 创建默认显式控件项目，目标目录需为空   |
| `dev`     | 本机预览、键盘翻页、保存后刷新         |
| `inspect` | 页面运行、布局、资源与显式控件规范检查 |
| `render`  | 生成 PNG 与诊断记录                    |
| `export`  | 导出 PDF/PPTX 与参考 PNG               |
| `verify`  | 对已生成产物进行结构和完整性验证       |

- `--slides id1,id2` 仅用于 inspect/render，保持 manifest 页序；export 始终导出完整文稿
- `--scale 1..4` 控制截图分辨率，不改变逻辑布局
- `--json` 输出机器可读结果；退出码 0 为成功、1 为检查/验证失败、2 为参数/配置/运行错误
- inspect 检查显式声明；editable 导出阻止非法控件，compatible 不要求原生控件映射成立

浏览器可能修复不规范 HTML、忽略无效 CSS，因此这里不是完整的 HTML/CSS 静态语法检查器。verify 检查页序、尺寸、哈希、原生对象、富文本、组坐标和媒体关系，也不等于视觉审稿或播放验收。

## 示例与详细文档

| 目录                                   | 内容                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| [examples/controls](examples/controls) | 推荐入口：两页显式控件、富文本、嵌套编组和裁紧的 Canvas |
| [examples/editable](examples/editable) | 旧 HTML 推断路径与局部栅格化对照                        |
| [examples/media](examples/media)       | MP4/GIF 嵌入示例                                        |
| [examples/demo](examples/demo)         | 原始三页中文 HTML 示例；`npm run demo` 启动此示例       |

[引擎/API 参考](skills/chaosppt/references/engine.md) · [控件规范](skills/chaosppt/references/controls.md) · [验证记录](docs/verification.md) · [Changelog](CHANGELOG.md)

## 能力边界

- 尚无原生数据图表、Table、任意 SVG 路径、公式或 WordArt 控件；可以组合基础控件或显式 raster，但两者不等价
- 可编辑 PPTX 不内嵌字体；HTML 加载了自定义字体，不代表接收端 Office 已安装该字体
- 不保证任意 HTML/CSS 转译或跨软件像素一致；特殊字体、复杂效果和媒体需要实际目标软件检查
- **媒体兼容性观察**：一次复杂 Demo 测试中，LibreOffice 导入编组内 MP4 失败，静态导出也未显示原生视频封面。推荐媒体先作为页级对象；必要时另放静态封面图片。该问题尚未在引擎层自动限制或根治，不能据此推断所有 PowerPoint/WPS 版本的行为
- 声明式动画支持 Fade/Fly/Wipe 和原生 Morph；任意 CSS 动画、复杂路径、循环与媒体播放命令尚未映射。Morph 需目标软件支持，旧软件使用 Fade 兼容分支；PDF 为静态输出
- 不提供自动拆分任意网页、拖拽编辑器或主题编辑 GUI；JSX/TypeScript/bare imports 需作者自行预编译
- 默认导出阻止远程 HTTP/WebSocket；服务只监听本机并限制项目路径，但不构成恶意脚本沙箱。项目内不要存放凭据，不可信项目应额外隔离

导出阶段由本地代码完成，不需要模型 API Key；模型主要参与材料理解、设计、源码编写和根据报告修订。首次安装依赖需要网络，准备好本地素材与运行依赖后可离线导出。

## 开发与验证

```sh
npm test
npm audit
node src/cli.js --help
```

测试覆盖配置、路径边界、浏览器生命周期、布局、控件声明、富文本、编组、媒体、产物篡改和旧输出保护。安装了 Codex skill-creator 时，还可用其 `quick_validate.py` 验证 `skills/chaosppt`。

代码模块：`project` 管协议，`server` 管页面组装，`browser-runtime` 管就绪，`diagnostics` 管测量，`editable` 管控件映射/组装，`media` 管媒体，`renderer` 管构建，`verify` 管产物检查。

示例随附 [Noto Sans SC 字体的 OFL 许可](templates/controls/assets/OFL.txt)，分发字体时保留该文件。引擎依赖的许可由各依赖包提供。

## 控件动画与跨页平滑过渡（v0.5）

```html
<div
  data-pptx-group="card"
  data-pptx-motion='{"effect":"fly-in","direction":"left","durationMs":600,"trigger":"on-click"}'
>
  <div data-pptx="text" data-pptx-id="title">整个编组一起进入</div>
</div>
```

- `fade-in/out` → 网页透明度动画 / PPT 原生 Fade
- `fly-in/out` → 网页平移 / PPT 原生 Fly
- `reveal-in/out` → 网页裁切揭示/擦除 / PPT 原生 Wipe，适合条形与面板
- `data-pptx-shared="key"` + 后一页 `transition:{"effect":"morph","durationMs":900}` → 网页共享元素过渡 / PPT 原生 Morph

同一配置驱动双方的目标、方向、时长、延迟、点击顺序。编组是原子目标；不同时动画组及其后代。完整参数、限制与示例见 [动画契约](skills/chaosppt/references/motion.md)。

```sh
node src/cli.js dev examples/motion --port 4176
node src/cli.js export examples/motion --pptx-mode editable --motion-mode native
node src/cli.js verify examples/motion
# 明确静态化，制作兼容版对照
node src/cli.js export examples/motion --pptx-mode compatible --motion-mode static
```

PDF/PNG 保留作者静态布局，不隐藏尚未入场或已经离场的内容。`motion.json` 给出时序和对应关系；verify 检查真实 PPTX 时间线，而非只检查源标记。对支持的效果做到语义对应，不承诺不同播放器逐帧像素一致；PowerPoint/WPS 的实际播放仍应验收。
