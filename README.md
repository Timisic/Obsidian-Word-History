# Obsidian Word History Tool

[English README](README.en.md)

从 Git 管理的 Obsidian vault 生成词数历史 SVG。

![Obsidian word history example](assets/example-chart.svg)

## 安装

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git
cd Obsidian-Word-History
./scripts/setup_env.sh "$HOME/Documents/ObsidianVault" "$HOME/Documents/ObsidianVault/Reference/chart.svg"
```

`setup_env.sh` 会创建 `.venv`，并写入本地 `.env.local`。`.env.local` 已被 Git 忽略，用来保存你的 vault 路径、SVG 输出路径和本地缓存路径。

## 运行

```bash
./scripts/generate_chart.sh
```

脚本会覆盖目标 SVG，并输出一行摘要：

```text
新增字数: 0；当前总字数: 344630
```

第一次运行会建立 `.cache/word-history-cache.json`。之后只分析新增 commit；如果 cache 缺失、统计配置变化，或 Git history 被 rebase/reset 改写，会自动全量重建。

## 给 Agent 的安装命令

如果你是正在帮助用户安装这个工具的 agent，只需要让用户提供 vault 路径，然后运行这一条命令：

```bash
git clone https://github.com/Timisic/Obsidian-Word-History.git && cd Obsidian-Word-History && ./scripts/setup_env.sh "<vault_path>" "<vault_path>/Reference/chart.svg"
```

## 依赖

- vault 必须是 Git 仓库。
- 需要本地 `git` 和 `python3`。
- 不需要 Node、pnpm、dashboard 或 vendored renderer。
