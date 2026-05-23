# Word History for Obsidian

[English](README.en.md)

把你的 Git 版 Obsidian vault 变成一张长期自动更新的写作增长图。适合长期写作者、中文笔记用户、Zettelkasten/PKM 用户，用一张 SVG 看见自己的写作积累。

![Example word history chart](assets/example-chart.svg)

## 你会得到什么

- 一张可嵌入 Obsidian note、Canvas、网站或 README 的 SVG 增长图
- 第一次回放 Git 历史，之后只分析新增 commit
- 支持 Markdown、Canvas 文本和 CJK/中文内容统计；中文用户可以把它理解为字数趋势 / 写作量
- 本地运行；插件运行时只需要 Obsidian 桌面端和系统 `git`
- 可手动生成，也可按间隔或 Git HEAD 变化自动更新
- 生成后可直接 Open SVG、Copy Obsidian embed、Reveal output file，或 Reset cache 重建历史

## 适合谁

适合已经用 Git 管理 Obsidian vault 的写作者。如果你的 vault 还没有 Git 历史，本插件只能从已有 commit 里重建趋势；未 commit 的写作不会进入历史曲线。

当前 v0.1 保持单张 SVG，不包含 HTML report、note table 或 dashboard。

## 安装

### 推荐：GitHub Release zip

1. 下载最新的 `word-history.zip` / `word-history-v*.zip`
2. 解压到 `<vault>/.obsidian/plugins/word-history/`
3. 在 Obsidian Settings → Community plugins 里启用 **Word History**

### BRAT 安装

1. 安装并启用 Obsidian BRAT 插件
2. 在 BRAT 中添加仓库 `Timisic/Obsidian-Word-History`
3. 选择 Release / beta 版本后启用 **Word History**

### 手动安装运行时文件

复制这三个文件到 `<vault>/.obsidian/plugins/word-history/`：

- `main.js`
- `manifest.json`
- `versions.json`

普通用户不需要 `npm install`、Python、Node、dashboard 或仓库源码。

### 高级：命令行安装

适合熟悉 shell 的 beta 用户。请先确认你信任目标分支内容。

```bash
VAULT="<vault_path>"; PLUGIN_DIR="$VAULT/.obsidian/plugins/word-history"; BASE="https://raw.githubusercontent.com/Timisic/Obsidian-Word-History/obsidian-plugin-light"; mkdir -p "$PLUGIN_DIR" && curl -fsSL "$BASE/manifest.json" -o "$PLUGIN_DIR/manifest.json" && curl -fsSL "$BASE/main.js" -o "$PLUGIN_DIR/main.js" && curl -fsSL "$BASE/versions.json" -o "$PLUGIN_DIR/versions.json"
```

本仓库也提供本地安装脚本：

```bash
scripts/install_plugin.sh "<vault_path>"
```

## 3 步生成第一张图

1. 确认你的 vault 是 Git 仓库，并且至少有一个 commit
2. 在插件设置里设置输出路径，例如 `Reference/chart.svg`
3. 命令面板运行 `Word History: Generate word history chart`，或在设置页点击 **Generate**

生成后，在任意 note 中插入：

```md
![[Reference/chart.svg]]
```

设置页会显示 Git、vault、HEAD、输出路径、cache 和上次运行状态；生成失败时会给出可操作原因。

## 要求与限制

- 仅支持 Obsidian 桌面端
- 需要系统已安装 `git`
- 只统计 Git commit 历史，未 commit 的写作不会进入历史曲线
- 首次运行会完整回放历史；大 vault 可能需要更长时间
- Cache 存在插件目录的 `.cache/word-history-cache.json`
- Git rebase/reset 或统计配置变化时会自动重建 cache
- 当前 note identity 按路径处理；重命名可能拆分历史
- 发布渠道优先 GitHub Release zip 和 BRAT；暂不准备 Obsidian Community Plugin 目录发布

## Troubleshooting

- **提示不是 Git repo**：在 vault 根目录运行 `git init`，添加文件并至少 commit 一次。
- **提示没有 commit**：先 `git add` / `git commit`，因为历史曲线来自 commit。
- **提示找不到 git**：安装 Git，并确保 Obsidian 启动环境能访问 `git`。
- **输出路径不可写**：换成 vault 内路径，例如 `Reference/chart.svg`，或检查目录权限。
- **统计结果看起来没更新**：确认改动已经 commit；必要时在设置页 Reset cache 后重新生成。

## 开发

普通用户不需要执行这一段；仓库已经包含构建好的 `main.js`。

```bash
npm install
npm run dev      # 开发监听，修改 src/*.ts 后重建 main.js
npm run build    # 类型检查并生成生产版 main.js
npm run package  # 生成 dist/word-history 和 dist/word-history-v*.zip
```

Python CLI 仍作为开发/迁移工具保留；Obsidian 插件运行时不依赖 Python。
