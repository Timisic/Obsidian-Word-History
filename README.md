# Obsidian Word History Tool

[English](README.en.md)

把 Git 管理的 Obsidian vault 变成一张可长期更新的词数历史 SVG。适合想在 Obsidian 里追踪写作积累、复盘笔记增长，或让 agent 定期生成可嵌入图表的人。

![Obsidian word history example](assets/example-chart.svg)

## 功能亮点

- **一键生成 SVG**：输出文件可直接放进 Obsidian note、Canvas、网页或 README。
- **增量分析**：第一次回放完整 Git 历史，之后只分析新增 commit。
- **写作进度摘要**：每次运行只输出新增字数和当前总字数。
- **适合中文笔记**：词数统计支持 Markdown 和 CJK 文本。
- **轻量本地运行**：只需要 `git` + `python3`，不需要 Node、dashboard 或外部服务。
- **Agent-friendly**：agent 只需要一条命令就能帮用户安装和配置。

## 安装

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git
cd Obsidian-Word-History
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

`setup_env.sh` 会创建 `.venv`，并写入被 Git 忽略的 `.env.local`，用于保存 vault 路径、SVG 输出路径和本地缓存路径。

## 运行

```bash
./scripts/generate_chart.sh
```

输出示例：

```text
新增字数: 0；当前总字数: 344630
```

## 给 Agent 的安装命令

如果你是正在帮助用户安装这个工具的 agent，让用户提供 vault 路径后运行这一条命令即可：

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git && cd Obsidian-Word-History && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

## 注意事项

- vault 必须是 Git 仓库。
- 默认缓存文件是 `.cache/word-history-cache.json`。
- 如果 cache 缺失、统计配置变化，或 Git history 被 rebase/reset 改写，工具会自动全量重建。
