# Obsidian Word History Tool

从 Obsidian 仓库的 Git 历史重建字数变化，并提供：

- `chart.svg`：总字数趋势图
- `analysis.json`：完整分析结果
- `dashboard-data.json`：供前端源码页直接读取的数据

## Quick Start

先配置环境：

```bash
cd /Users/hong/Downloads/obsidian-word-history-tool
./scripts/setup_env.sh
```

然后构建：

```bash
PYTHONPATH=. python3 -m obsidian_word_history build \
  --vault "/Users/hong/Obsidian Notes"
```

默认输出到 `out/`：

- `out/analysis.json`
- `out/dashboard-data.json`
- `out/chart.svg`

打开趋势图：

```bash
open out/chart.svg
```

## Dashboard

建议先运行 `./scripts/setup_env.sh` 再启动。

源码页位于：

- `dashboard/index.html`
- `dashboard/styles.css`
- `dashboard/app.js`

一键启动：

```bash
PYTHONPATH=. python3 -m obsidian_word_history serve \
  --vault "/Users/hong/Obsidian Notes"
```

或使用脚本：

```bash
./scripts/run_dashboard.sh
```

然后访问：

```text
http://127.0.0.1:8000/dashboard/
```

这个页面会默认读取：

- `out/dashboard-data.json`

也支持手动上传 `analysis.json` / `dashboard-data.json`。

## CLI

### build

```bash
PYTHONPATH=. python3 -m obsidian_word_history build \
  --vault "/Users/hong/Obsidian Notes"
```

### serve

```bash
PYTHONPATH=. python3 -m obsidian_word_history serve \
  --vault "/Users/hong/Obsidian Notes" \
  --no-open
```

常用参数：

- `--out`：指定输出目录
- `--top-n`：控制 Top 列表长度
- `--generated-at`：固定时间戳（测试用）
- `--exclude-comments`
- `--exclude-code-blocks`
- `--exclude-non-visible-link-portions`
- `--exclude-footnotes`

## Data Shape

`analysis.json` / `dashboard-data.json` 当前包含：

- `summary`
- `commit_trend`
- `recent_active_notes_30d`
- `top_notes`
- `notes`
- `folders`
- `series.daily_deltas`
- `series.weekly_deltas`
- `series.monthly_deltas`

## Notes

- 当前 rename 仍然按 path 处理，不做 lineage 合并。
- dashboard 前端不依赖外部 CDN 图表库。
- `serve` 会优先复用已有 `out/dashboard-data.json`，只有数据过期时才重建。
