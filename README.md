# 隙间琉璃 · SHIKI — Liquid Glass Multi-Dimensional Showcase

> **一窗琉璃，折叠时间、情绪与宇宙尺度。**  
> **A tactile WebGL2 Liquid Glass prism folding Time, Mood, and Cosmic Scale in your palm.**

---

## ✨ 概念与灵感 · Inspiration

**隙间琉璃（SHIKI）** 是一座可零构建、零外部运行依赖的网页光学交互展厅。页面中央悬浮一枚饱满通透的液态玻璃胶囊（Liquid Glass Capsule）：轻轻拖曳或快速甩动，指尖不仅操控着画面进度，更实时扭曲、折射并重塑眼前的维度世界——从古代神庙到赛博雨夜，从晨光微尘到暴雨孤灯，再到黑洞事件视界。

**SHIKI** is a zero-build, dependency-free interactive web art gallery centered around a floating Liquid Glass capsule. Dragging or flicking the glass refracts light in real time while fluidly morphing across three original dimensions—bridging physical spring dynamics, procedural GPU shaders, and synthesized Web Audio soundscapes.

---

## 🌌 三大变换维度 · Three Dimensions

| 维度 · Dimension | 代号 · Code | 四阶演进 · Four Stages | 视觉渲染与声场特征 · Visuals & Soundscape |
|---|---|---|---|
| **时间变换 · Time** | `CHRONOS` | 太初 Dawn → 盛世 Golden → 赛博 Neon → 星海 Astral | 四幅透视像素级对齐的 1376×768 原画卷轴实时融合，叠加晨曦暖光、霓虹细雨、银河寒晶倒影与古韵五声音阶声景 |
| **情绪变换 · Mood** | `PSYCHE` | 澄明 Serene → 炽烈 Euphoria → 孤寂 Rain → 梦境 Lucid | **100% 纯 GPU 实时程序化渲染**：晨光金尘、热浪日冕金箔、斜飞暴雨玻璃涟漪与孤灯、失重极光薄膜；随情绪变化的弹簧阻尼手感 |
| **空间变换 · Space** | `COSMOS` | 微观 Micro → 苍穹 Horizon → 轨道 Orbit → 奇点 Singularity | **100% 纯 GPU 无限精度尺度跃迁**：纳米叶脉露晶 → 沧海云涡孤岛 → 平流层极光星弧 → 引力透镜弯曲星海与黑洞爱因斯坦环 |

---

## 🔬 核心技术特性 · Key Architecture

1. **WebGL2 液态玻璃光学引擎 (`js/webgl-lens.js`)**
   - **雅可比正定单调折射**：边缘 S 型平滑聚光曲率，在任意进度（含 0% / 100% 端头）与高折射率下均无折叠重影与脏月牙。
   - **双世界透视模式**：支持「同期流转 / Refract」与「跨世窥镜 · 表里心镜 · 虫洞之眼 / Portal」，在胶囊镜面内直接映现下一阶平行世界。
   - **动态水波纹与 Canvas2D 降级**：交互按压与撞壁反弹触发径向冲击波；不支持 WebGL2 时自动优雅降级为三维度 Canvas2D 渲染。
2. **维度感知弹簧流体物理 (`js/spring-physics.js`)**
   - 二阶弹簧阻尼模型模拟液体果冻形变（`squash`）与运动倾角（`tilt`），支持速度惯性抛掷（Flick）与端壁弹性撞击。
   - 「情绪变换」维度动态调制刚度与阻尼（如「孤寂暴雨」黏滞沉重、「梦境」失重长漂）。
3. **12 通道程序化 Web Audio 声景 (`js/soundscape.js`)**
   - 零外部音频文件，纯 Web Audio API 实时合成 3 维度 × 4 阶共 12 层差异化氛围声场，搭配五声音阶 / 大七和弦 / 利底亚音阶琉璃清磬与端壁撞击共鸣。
4. **中英双语、主题切换与全无障碍 (`index.html`, `styles.css`, `js/main.js`)**
   - 支持 **中文 / English** 一键切换（记忆于 `shiki-lang`）、**晴昼 / 夜幕** 画廊主题、**纯净鉴赏模式（Zen Mode）**。
   - 完整保留原生 `<input type="range">` 语义、Popover API 光学与弹性实验室、Windows 高对比度 `forced-colors` 适配、以及 `prefers-reduced-motion` 动态降级与按需 rAF 节能休眠。

---

## ⌨️ 快捷操作 · Controls & Shortcuts

- **拖拽 / 抛掷**：直接按住琉璃胶囊左右拖动（热区内零跳变跟手抓起），快速拨动松手触发惯性滑行与端壁水波纹。
- **键盘导航**：
  - `←` / `→` / `↑` / `↓`：步进 `4%`
  - `Shift + 方向键`：跨越整阶锚点
  - `PageUp` / `PageDown`：步进 `16%`，`Home` / `End`：直达首尾
  - `1` / `2` / `3`：快速切换「时间 / 情绪 / 空间」维度
  - `Z`：开启或退出「纯净鉴赏模式（Zen Mode）」

---

## 🚀 本地打开与部署 · Quick Start & Deployment

### 1. 免服务器直接打开 · Zero-Setup Local Viewing
- **方式 A（单文件便携版）**：直接双击打开仓库根目录的 `shiki-portable.html`，已将样式、脚本与 WebP Data URI 纹理全部内联打包，适合直接离线预览或单文件分享。
- **方式 B（模块化文件版）**：直接双击 `index.html`（基于经典非模块 `<script defer>` 与 `assets/time-textures.js` 同源 Data URI，在 `file://` 与 `http(s)://` 双协议下均可零报错运行）。

### 2. 本地静态服务 · Local HTTP Server (Optional)
```bash
npx serve .
# 或使用 Python
python -m http.server 8080
```

### 3. GitHub Pages 一键部署 · Deploy to GitHub Pages
本项目为纯静态前端架构，无需安装依赖或构建打包：
1. 将代码推送至 GitHub 仓库（`.gitignore` 已自动排除大体积录屏与临时文件）。
2. 进入仓库 **Settings → Pages → Build and deployment**。
3. **Source** 选择 **Deploy from a branch**，分支选择 `main`、目录选择 `/ (root)` 并保存即可访问。

---

## 📁 目录结构 · Project Structure

```text
.
├── index.html               # 展厅主页面（支持 file:// 与 HTTP 双协议）
├── styles.css               # Cascade Layers 样式系统、双语/响应式与无障碍适配
├── shiki-portable.html      # 单文件自包含便携版（可离线独立分发）
├── assets/
│   ├── time-ancient.webp    # 时间·太初 原画 (1376×768)
│   ├── time-golden.webp     # 时间·盛世 原画 (1376×768)
│   ├── time-neon.webp       # 时间·赛博 原画 (1376×768)
│   ├── time-astral.webp     # 时间·星海 原画 (1376×768)
│   └── time-textures.js     # 同源 WebP Data URI 纹理包
└── js/
    ├── dimensions.js        # 三大维度与四阶中英双语配置中心
    ├── spring-physics.js    # 二阶弹簧阻尼、惯性抛掷与撞壁物理模型
    ├── soundscape.js        # Web Audio API 12 层多维程序化声景
    ├── webgl-lens.js        # WebGL2 液态玻璃折射引擎与 Canvas2D 降级
    └── main.js              # 交互统筹、双语切换、Zen 模式与节能调度
```
