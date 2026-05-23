# Obsidian Word History Tool

[English](README.en.md)

把 Git 管理的 Obsidian vault 变成一张可长期更新的词数历史增长图，Star History 风格。当前分支是一个极简 Obsidian 桌面插件，源码使用 TypeScript，发布运行文件是已构建好的 `main.js`。

![Obsidian word history example](assets/example-chart.svg)

## 功能亮点

- **一键生成 SVG**：输出文件可直接放进 Obsidian note、Canvas、网页或 README。
- **增量分析**：第一次回放完整 Git 历史，之后只分析新增 commit。
- **适合中文笔记**：词数统计支持 Markdown 和 CJK 文本。
- **轻量本地运行**：插件运行时只依赖系统 `git`，不需要 Python、Node、dashboard 或外部服务。
- **最少配置**：只需要设置输出 SVG 路径，可手动运行、每 N 天运行，或在 Git HEAD 变化后自动更新。
- **社区插件风格**：TypeScript 源码在 `src/main.ts`，用 esbuild 构建到 Obsidian 需要的 `main.js`。

## 安装

用户提供 vault 路径后运行这一条命令即可：

```bash
mkdir -p "<vault_path>/.obsidian/plugins" && git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "<vault_path>/.obsidian/plugins/word-history"
```

```bash
mkdir -p "$HOME/Documents/ObsidianVault/.obsidian/plugins" && git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
```

然后在 Obsidian 设置里启用 **Word History** 插件，并设置输出 SVG 路径，例如 `Reference/chart.svg`。

## 运行

在 Obsidian 里打开命令面板，运行：

```text
Word History: Generate word history chart
```

也可以在插件设置里选择：

- `Manual`：只手动生成。
- `Every N days`：Obsidian 打开时按间隔自动生成。
- `On Git changes`：检测到 Git HEAD 变化后自动生成。

## 开发

普通用户不需要执行这一段；仓库已经包含构建好的 `main.js`。

```bash
npm install
npm run dev     # 开发监听，修改 src/main.ts 后重建 main.js
npm run build   # 类型检查并生成生产版 main.js
```

## 注意事项

- vault 必须是 Git 仓库。
- 插件是 desktop-only，因为它使用 Obsidian 桌面端可用的 Node API 和系统 `git`。
- 默认缓存文件在插件目录的 `.cache/word-history-cache.json`。
- 如果 cache 缺失、统计配置变化，或 Git history 被 rebase/reset 改写，工具会自动全量重建。
