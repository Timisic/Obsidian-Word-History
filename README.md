# Obsidian Word History Tool

[English](README.en.md)

把 Git 管理的 Obsidian vault 变成一张可长期更新的词数历史增长图，Star History 风格。当前分支也可以作为一个极简 Obsidian 桌面插件使用。

![Obsidian word history example](assets/example-chart.svg)

## 功能亮点

- **一键生成 SVG**：输出文件可直接放进 Obsidian note、Canvas、网页或 README。
- **增量分析**：第一次回放完整 Git 历史，之后只分析新增 commit。
- **适合中文笔记**：词数统计支持 Markdown 和 CJK 文本。
- **轻量本地运行**：只需要 `git` + `python3`，不需要 Node、dashboard 或外部服务。
- **Obsidian 插件外壳**：设置输出 SVG 路径，可手动运行、每 N 天运行，或安装 Git commit/push hook。

## 安装

```bash
用户提供 vault 路径后运行这一条命令即可：
git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "<vault_path>/.obsidian/plugins/word-history" && cd "<vault_path>/.obsidian/plugins/word-history" && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

```bash
git clone -b obsidian-plugin-light https://github.com/Timisic/Obsidian-Word-History.git "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
cd "$HOME/Documents/ObsidianVault/.obsidian/plugins/word-history"
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

`setup_env.sh` 会创建 `.venv`，并写入被 Git 忽略的 `.env.local`，用于保存 vault 路径、SVG 输出路径和本地缓存路径。
然后在 Obsidian 设置里启用 **Word History** 插件。

## 运行

```bash
./scripts/generate_chart.sh
```

## 注意事项

- vault 必须是 Git 仓库。
- 默认缓存文件是 `.cache/word-history-cache.json`。
- 如果 cache 缺失、统计配置变化，或 Git history 被 rebase/reset 改写，工具会自动全量重建。
