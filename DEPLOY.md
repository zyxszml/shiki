# 🚀 SHIKI 部署到 GitHub Pages · Deployment Guide

本仓库是**纯静态站点**（零构建、零依赖），推送到 GitHub 后开箱即可发布为网页。

最终地址形如：`https://<你的用户名>.github.io/<仓库名>/`

---

## 配额心 · One-time Setup (5 分钟)

本机没有安装 `gh` CLI，因此需要你在浏览器里创建一次空仓库：

1. 打开 <https://github.com/new>
2. **Repository name** 填 `shiki`（或任意名字）
3. **Visibility** 选 **Public**（免费版 GitHub Pages 仅支持公开仓库）
4. ⚠️ **不要**勾选 *Add a README file* / *.gitignore* / *license*，保持空仓库
5. 点击 **Create repository**，复制页面上的 HTTPS 地址

---

## 📦 推送 · Push

在本目录（`E:\code\Gemini`）执行，把 `<USER>` 和 `<REPO>` 替换成你的信息：

```bash
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

首次推送会弹出 **Git Credential Manager** 登录窗口，用浏览器完成 GitHub 授权即可。

---

## 🌐 开启 Pages · Enable GitHub Pages

推送成功后，**推荐用自动 workflow**（本仓库已内置 `.github/workflows/pages.yml`）：

1. 打开仓库 **Settings → Pages**
2. **Source** 选择 **GitHub Actions**
3. 打开 **Actions** 标签页，选择 *Deploy static site to GitHub Pages* → **Run workflow**

约 1 分钟后访问 `https://<USER>.github.io/<REPO>/`。

> 备选方案（不用 Actions）：**Settings → Pages → Source** 选 **Deploy from a branch**，
> 分支 `main`、目录 `/ (root)`，保存后同样生效。

---

## ✅ 推送前自检 · Pre-flight Checks

| 检查项 | 状态 |
|---|---|
| `index.html` 在仓库根目录 | ✅ 页面入口正确 |
| 资源使用相对路径（`styles.css`、`js/*.js`、`assets/*`） | ✅ 子路径部署无需改代码 |
| 单文件最大体积 `shiki-portable.html` ≈ 1.5 MB | ✅ 远低于 GitHub 100 MB 上限 |
| 录屏 `Screenrecorder-*.mp4`（10 MB） | ✅ 已被 `.gitignore` 排除 |
| 存在 `.nojekyll` | ✅ 防止 Jekyll 忽略下划线开头的文件 |
| 分支为 `main`、工作区干净 | ✅ 可直接推送 |

---

## 🔧 常见问题 · Troubleshooting

- **页面 404**：Pages 构建需要 1–2 分钟；确认 Source 指向的分支/目录正确。
- **样式或脚本 404**：检查是否误把资源路径改成了 `/styles.css` 这类根绝对路径——子路径部署会失效。
- **音频/麦克风无权限**：声景基于 Web Audio API，首次交互（点击/拖拽）后才会启动，属浏览器自动播放策略，非故障。
- **想要自定义域名**：在仓库根目录添加 `CNAME` 文件写入域名，并在 DNS 配置 CNAME 记录。
