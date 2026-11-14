# BTF BuildTestFrame 设计说明 / Design Spec

日期：2026-11-14
参考对象：nVent SCHROFF Varistar CP 3D-Configurator（公开资料 + 配置器登录引导页）

## 1. 参考站点的工作流（调研结论）

公开页面明确给出以下能力，本工具据此仿写（不复制任何代码、图片或商标资产）：

1. **向导式框架定义**：通过一系列对话框确定 3D 模型基本属性，例如高度、宽度、深度；这些值定义框架。
2. **拖放装配**：在基础 3D 模型上以拖放方式添加其余组件，组件库便于快速选件。
3. **合理性检查（plausibility check）**：确保选定部件互相适配、配置不缺规格。
4. **即时可视化**：色板选择后 3D 视图立刻变色；支持即时三维可视化。
5. **定制模块**：加开孔（开孔库）、加文字、加图片/Logo。
6. **输出**：物料清单 BOM、2D/3D CAD、交互式 3D PDF 规格书（登录后）、保存配置、报价。
7. **领域概念**：框架类型（静止式 / 移动式 / 抗震式）、IP 防护、EMC 屏蔽、接地套件、门与手柄类型、**Xf / C 尺寸**（19" 滑动架前后凹槽位置）。
8. **标准尺寸**：1U = 44.45 mm = 1¾ in；19" = 482.6 mm；IEC 60297-3-10x / IEEE 1101.x；常见成品 42U/47U，2000/2200 mm 高，600/800 mm 宽，1200 mm 深，RAL 7021。

## 2. 方案对比与取舍

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. React + React Three Fiber + drei + 后端 | 组件化强、生态完整 | 依赖重、需要构建链与后端、部署复杂，与「开源小工具」定位不符 | 否 |
| B. 纯前端 ESM + Three.js（CDN import map） | 零构建、单文件可跑 | 依赖 CDN、离线不可用、工程化弱 | 否 |
| **C. Vite + TypeScript + Three.js，纯前端 SPA，无后端** | 依赖只有 Three.js；构建产物可直接托管 GitHub Pages；参数化建模完全可控；TS 保证数据模型正确 | 需要一次 `npm install` | **选用** |

补充取舍：
- 不用后端/数据库：配置存 localStorage + JSON 文件导入导出，避免部署门槛（YAGNI）。
- CAD 导出：不实现 35 种原生格式（闭源能力），改用 Three.js 官方 `STLExporter` / `GLTFExporter` 导出 STL / GLB，属于可实际导入 CAD 软件的开放格式。
- 3D PDF：不实现，改为 PNG 视图快照 + BOM CSV + 配置 JSON。

## 3. 架构

```
index.html            静态 UI 骨架（data-i18n）
src/main.ts           装配：状态 -> UI -> 3D 场景
src/core/             types / state / standards / units / i18n / catalog / validation / bom / export
src/scene/            Viewer（场景、拾取、视图、截图）/ builders（参数化几何）/ dimensions（标注）
src/ui/               Toolbar / Wizard / Library / Inspector / Panels
src/styles.css        深色工业风布局
```

数据流：`FrameConfig + PlacedItem[]`（单一 store，发布订阅）→ 校验引擎 → 3D 重建 + 面板渲染 + BOM。任何编辑都走同一条管线，避免状态分叉。

所有长度在**内部一律以 mm 存储**，重量 kg，功率 W；仅在显示与输入解析层做换算，杜绝单位混用。

## 4. 数据模型

- `FrameConfig`：heightU、width、depth、frameType、color、plinthHeight、frontRailOffset(Xf)、rearRailOffset、ip、emc、grounding、doorHandles。
- `PlacedItem`：id、catalogId、u（起始 U，自下向上 1 起）、slot（front/rear/top/side/vertical）、color、label、qty。
- `CatalogItem`：id、名称（中/英）、分类、uSize、depth、weight、power、几何类型、规格描述、参考价。

## 5. 单位与标准（核心需求）

- 两套体系：**国标 / 公制**（GB/T 19520.1、IEC 60297，mm + kg）与**英制**（EIA-310-E，inch + lb）。
- 换算：1 in = 25.4 mm；1 U = 44.45 mm = 1.75 in；1 lb = 0.45359237 kg。
- 输入框接受带单位文本（`600`、`24 in`、`2.5'`），解析为 mm；切换单位后所有显示即时换算。
- 预设：国标 42U / 600×1000×2000 mm；英制 42U / 24×42×78.7 in；并提供 24U~52U 全尺寸表。
- 视图尺寸标注、U 位刻度、BOM 规格列随单位切换。

## 6. 功能清单

1. 框架向导：U 数、宽、深、框架类型、颜色（RAL 色板 + 自定义）、Xf/C 凹槽、IP/EMC/接地。
2. 3D 视图：轨道旋转缩放、等轴测/前/后/侧/顶视图、爆炸视图、网格、尺寸标注、U 位刻度、拾取高亮、线框模式。
3. 组件库：门（穿孔/玻璃/实心）、侧板、顶盖、底座/脚轮、19" 设备（服务器/交换机/UPS）、PDU、风扇、层板、理线架、盲板、开孔/文字/Logo 定制件；支持拖拽到 U 位与点击添加。
4. 合理性检查：U 位重叠、超出高度、设备深度与可用深度、静载 1600 kg / 动载 1000 kg、散热功耗、门与 IP/EMC 冲突、缺件提醒、空 U 位提示。
5. BOM：自动汇总、参考价占位、CSV 导出。
6. 输出：配置 JSON 导入/导出、BOM CSV、PNG 快照、STL/GLB 模型导出、localStorage 自动保存。
7. 中英双语：全部 UI、组件名、校验消息、文档。

## 7. 验收标准

- `npm run build` 无错误；浏览器打开无 JS 异常。
- 单位切换后尺寸/重量显示正确换算；语言切换后无残留中文/英文。
- 拖放组件能进入指定 U 位，重叠时给出错误提示。
- 五种导出均产生有效文件；配置 JSON 可回载还原。
- 无头浏览器截图确认 3D 机柜可见、面板布局正常。

## 8. 开源依赖

| 依赖 | 版本 | 许可 |
|---|---|---|
| three | 0.187.0 | MIT |
| vite | 7.x | MIT |
| typescript | 5.9.x | Apache-2.0 |
| @types/three | 0.187.0 | MIT |

本项目代码采用 MIT 许可。参考站点仅用于功能与交互研究，未使用其任何代码、素材或商标。
