# 控件动画与共享过渡 — v0.5

## 同一份声明，两种执行方式

动画是显式控件的附加属性，不新增控件，也不把任意 CSS 动画猜成 PowerPoint 动画。浏览器与导出器使用同一份效果枚举、方向、时长、延迟、顺序和触发模式；浏览器执行 WAAPI，PPTX 写入原生时间线。对应的是效果与时序语义，不是跨软件逐帧像素一致。

```html
<div data-pptx-group="card"
     data-pptx-motion='{"effect":"fly-in","direction":"left","durationMs":600,"trigger":"on-click","order":1}'>
  <div data-pptx="text" data-pptx-id="title">整个组件一起进入</div>
</div>

<div data-pptx="shape" data-pptx-id="bar"
     data-pptx-motion='{"effect":"reveal-in","direction":"left","durationMs":800,"trigger":"after-previous","delayMs":100,"order":2}'
     style="width:400px;height:32px;background:#4e78bd"></div>
```

## 效果映射

| effect | 网页实现 | PowerPoint 原生效果 |
| --- | --- | --- |
| fade-in | 从透明到原有透明度 | Fade / entrance |
| fade-out | 从原有透明度到透明 | Fade / exit |
| fly-in | 从指定画布边缘平移到原位 | Fly In + 对应方向 |
| fly-out | 从原位平移到指定画布边缘 | Fly Out + 对应方向 |
| reveal-in | 从指定边开始揭示控件，尺寸本身不变 | Wipe / entrance |
| reveal-out | 从指定边开始擦除控件 | Wipe / exit |

方向为 `left`、`right`、`up`、`down`；飞入表示起始边，飞出表示目标边；揭示/擦除表示开始发生变化的边。Fade 不接受 direction。条形可以每根声明一个 shape，然后独立配置 reveal-in 和顺序；Canvas 图表不会自动分解成可逐系列动画的原生柱子。

## 参数与步骤

`data-pptx-motion` 接受一个 JSON 对象，或同一控件的一组对象：

```html
<div data-pptx="text" data-pptx-id="message"
     data-pptx-motion='[
       {"effect":"fade-in","durationMs":500,"trigger":"on-click","order":1},
       {"effect":"fade-out","durationMs":400,"trigger":"on-click","order":5}
     ]'>一个控件的进入与离场</div>
```

- `durationMs`：整数 1–10000，默认 500
- `delayMs`：整数 0–10000，默认 0
- `trigger`：`on-click`（默认）、`with-previous`、`after-previous`
- `order`：整数 0–10000，默认 0；全页按 order 排序，相同值按 DOM/声明顺序
- directional 效果省略 direction 时默认 left
- 未知字段、未知效果、非法值（含 null）、同控件重叠或无效显隐序列均报错

`on-click` 开始新点击步骤；`with-previous` 从前一动作的开始时刻加 delay；`after-previous` 从前一动作的结束时刻加 delay。第一项若为 with/after-previous，则在页面转场结束后自动开始。每个点击组最多 60 秒，每页最多 256 个动作。对同一控件，进入和退出应交替，不能连续给已可见对象再做一次进入。

网页右箭头/空格/下一步按钮先推进动画，再翻页。播放中再按一次会完成当前点击组，下一次再推进。左箭头返回上一页，重新进入页面会重置该页动画；跨多页跳转使用普通过渡。系统减少动态效果偏好下，网页保留点击步骤但跳过插值。

## 编组与约束

- 动画可挂在 text、shape、image、raster 或 group 上
- 组作为一个整体运动，原生目标是组的 shape ID，组内文字和形状仍可编辑
- 同时给一个组及其后代声明动画会报错；选择组级或子控件级的一种粒度
- 媒体控件以及包含媒体的组，当前不作为动画/共享目标；播放控制属于媒体系统
- alpha-trimmed raster 不支持 reveal，使用 fade/fly；reveal 的原生边界必须与作者布局一致
- 不额外用 CSS/JS 覆盖动画正在控制的 opacity、transform、clip-path、visibility
- 任意 CSS keyframes、弹簧、路径、循环、音效、触发某个指定按钮的交互动画暂不映射

## 跨页相同元素的平滑过渡

**默认设计推荐：等尺寸移动。** 两页共享元素保持相同宽高；共享组内成员的相对位置、文字框宽高、字号和行距也保持稳定，避免把组缩放、文字重排与转场叠在一起。需要显著不同的尺寸或内容布局时，改用新控件和独立淡入/淡出。引擎仍具备尺寸插值能力，这里是更保守的创作建议，不是新增的强制尺寸校验，也不代表跨软件文字消失问题已根治。

可按实际表达需要主动添加本规范支持的页面切换与页内效果；不必等用户逐个指定，也不要求每页都有动画。尊重用户的静态输出偏好和目标格式限制。

两页给同一类控件或同一组配置稳定 key：

```html
<div data-pptx-group="focus-card" data-pptx-shared="focus-card">
  <!-- 两页保持宽高、文字规格与子控件结构一致，优先只改变位置 -->
</div>
```

在**后一页**的 deck.json 页面项中声明：

```json
{
  "id": "detail",
  "file": "slides/detail.html",
  "transition": {"effect":"morph", "durationMs":900}
}
```

- transition 支持 none、fade、morph；默认 none。Fade/Morph 时长为 100–5000ms，默认 600；none 的时长为 0
- key 每页唯一，支持字母/数字/_/-，最多 64 个字符
- Morph 需要前一页具有相同 key；首张页、无匹配、控件类型/形状类型变化或组子控件 ID/类型结构变化会报错
- 浏览器对匹配控件的位置、尺寸和样式插值；相同文字保持单一实例，内容变化时交叉淡化；PPTX 使用原生 Morph byObject
- 导出器设置 `!!chaosppt-shared-*` 强制匹配名称，共享组内成员也使用稳定匹配名，其他控件使用页面唯一名称避免误匹配；不要随意改掉这些原生对象名称
- 共享组不再标记共享后代，也不与组树内的页内动画混用
- 共享目标暂不包含 raster 或媒体；包含这些内容的组也不作为共享目标
- Morph 的中间帧由目标软件实现；不支持 Morph 的软件走文件中明确写入的 Fade 兼容分支

## WPS 组内独立动画兼容性

在本机 WPS 的对比验证中，同一份 Demo 的顶层编组效果可导入，但嵌套组内条形/数值的独立效果未出现在动画窗格；仅移除这两层图表编组后，条形和数值效果恢复显示。这是已观察到的导入兼容问题，不代表所有 PowerPoint/WPS 版本均不支持组内动画。

- 面向 WPS 的逐条图表，使用无绘制样式的普通 div 排版，每个条形和数值仍显式声明为 shape/text，并独立声明动画；不要把这类排版容器标成原生 group
- 需要整体入场的组件仍保留真实 group，并把效果加在顶层组上；不全局取消编组，也不把可编辑对象转成图片
- inspect/export 对组内独立动画给出 `MOTION_GROUP_CHILD_COMPATIBILITY` 警告，但不强制展平或删除用户编组
- 动画窗格能识别效果，不等于已完成所有软件的实际放映验收

## 导出与静态参考

```sh
node RUNNER export PROJECT --pptx-mode editable --motion-mode native
node RUNNER verify PROJECT --json

# 明确放弃动画，制作静态兼容版
node RUNNER export PROJECT --pptx-mode compatible --motion-mode static
```

`--motion-mode` 默认为 native。只有页面 Fade 的情况下兼容模式也可保留原生转场；若声明了控件动画或共享元素，兼容模式要求明确选择 static，不能悄悄丢弃动作。

PDF/PNG 始终显示作者的完整静态布局，不是动画第一帧或最后一帧。导出前恢复原始样式，再提取控件和截图；动画保持为 PPTX 行为，不烘焙进图片。

`motion.json` 记录声明与实际应用的计划、时间线、控件/组 ID 和转场。verify 检查原生 preset、方向、目标、时长、延迟、点击分组、共享匹配名与 Morph/Fade 分支，并核对声明与输出对应关系。结构检查、浏览器播放和 LibreOffice 导入检查不能代替 PowerPoint/WPS 的实际放映验收。

在 `init` 创建的项目中按上文声明添加效果；独立开发 Demo 不随 Skill 分发。

## 实现依据

- [Microsoft：Morph 匹配与 !! 名称](https://support.microsoft.com/en-us/powerpoint/morph-transition-tips-and-tricks)
- [Microsoft：animEffect 兼容说明](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/a96dab70-2e72-4319-928d-0eb4b275ce58)
- [PPT Master 的 PowerPoint 原生预设记录](https://github.com/hugohe3/ppt-master/blob/604ecdec8dd6a0405e1abdb49565430902373276/skills/ppt-master/scripts/pptx_animation_presets.json)：参考预设编号和方向的互操作行为；ChaosPPT 的共享合同、浏览器播放器和 XML 构建器在本项目实现
