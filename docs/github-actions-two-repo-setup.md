# GitHub Actions 两仓库接线指南

适用场景：

- `Obsidian Notes` 仓库保存你的笔记和完整 Git 历史
- `obsidian-word-history-tool` 仓库保存这个工具源码、`README.md`、以及生成出来的 `out/` 产物

## 推荐接法（最省事也最可靠）

把 workflow 放在 **Obsidian Notes 仓库**，不要先放在工具仓库。

原因很简单：真正会发生 `push` 的是笔记仓库；让 workflow 直接跟着笔记更新触发，最少绕路，也不需要额外的跨仓库事件转发。

## 你需要的两个仓库

### 1) 笔记仓库（触发源）
例如：`your-name/obsidian-notes`

用途：
- 保存 Obsidian 内容
- 提供完整 commit 历史给分析器回放
- 承载 GitHub Actions workflow

### 2) 工具仓库（产物仓库）
例如：`your-name/obsidian-word-history-tool`

用途：
- 保存本项目源码
- 保存 `README.md`
- 保存生成后的 `out/chart.svg`、`out/analysis.json`、`out/report.html`

## 必需 secrets

只需要 **1 个必需 secret**：加在 **笔记仓库** 里。

### `WORD_HISTORY_TOOL_PUSH_TOKEN`
用途：
- checkout 工具仓库
- 把更新后的 `out/` 提交回工具仓库

建议：
- 用 fine-grained PAT
- Repository access 只给工具仓库
- Permissions 至少给 `Contents: Read and write`

## workflow 应该放哪里

放在：

`Obsidian Notes/.github/workflows/update-word-history.yml`

不要把主 workflow 先放到工具仓库里；否则工具仓库并不会因为笔记仓库的 `push` 自动触发，后面还得再补 `repository_dispatch` 或定时任务。

## checkout 策略

workflow 里需要两次 checkout：

1. **当前仓库（笔记仓库）**
   - checkout 到 `notes/`
   - 必须 `fetch-depth: 0`
   - 原因：这个工具要回放完整 Git 历史，浅克隆会直接让趋势数据失真

2. **工具仓库**
   - checkout 到 `tool/`
   - 使用 `WORD_HISTORY_TOOL_PUSH_TOKEN`
   - 后续在这个目录里运行生成逻辑，并把产物提交回去

## 最小可用 workflow

```yaml
name: Update word history

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-word-history:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout notes repo with full history
        uses: actions/checkout@v4
        with:
          path: notes
          fetch-depth: 0

      - name: Checkout tool repo
        uses: actions/checkout@v4
        with:
          repository: your-name/obsidian-word-history-tool
          token: ${{ secrets.WORD_HISTORY_TOOL_PUSH_TOKEN }}
          path: tool

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Build outputs into tool repo
        working-directory: tool
        run: |
          PYTHONPATH=. python3 -m obsidian_word_history build \
            --vault "$GITHUB_WORKSPACE/notes" \
            --out "$GITHUB_WORKSPACE/tool/out"

      - name: Commit updated outputs
        working-directory: tool
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- out/; then
            echo "No output changes"
            exit 0
          fi
          git add out/
          git commit -m "Update word history outputs"
          git push
```

## 更新流转

1. 你在 `Obsidian Notes` 仓库提交并 push
2. `update-word-history.yml` 在笔记仓库触发
3. workflow 用完整历史 checkout 笔记仓库到 `notes/`
4. workflow 再 checkout 工具仓库到 `tool/`
5. 运行：
   - 代码来自 `tool/`
   - 数据源来自 `notes/`
   - 输出写回 `tool/out/`
6. 如果 `tool/out/` 有变化，就 commit + push 回工具仓库
7. 工具仓库的 `README.md` 继续用相对路径引用 `./out/chart.svg`

## 必须注意的两个点

### 1) 笔记仓库一定要保留完整历史
如果你的 Actions checkout 不是 `fetch-depth: 0`，这个工具看到的 commit 链就不完整，生成出来的趋势图会偏差很大。

### 2) README 最好只引用工具仓库里的产物
保持 `README.md`、`out/chart.svg`、工具源码都在同一个仓库里，最稳定，也最容易回滚。

## 可选增强（不是第一版必需）

如果你后面想把 workflow 改到工具仓库，也可以，但那时你还需要再补其中一种触发方式：

- 笔记仓库 `repository_dispatch` 到工具仓库
- 工具仓库定时轮询笔记仓库

第一版不建议先上这条路；先把“笔记仓库触发、工具仓库存产物”跑通就够了。
