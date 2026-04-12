# GitHub Actions 两仓库接线指南

适用场景：

- `Obsidian Notes` 仓库保存你的笔记和完整 Git 历史
- `obsidian-word-history-tool` 仓库保存这个工具源码、已经 vendored 进来的 `star-history` 代码、`README.md`、以及生成出来的 `out/` 产物

这份文档按**你当前真实状态**来写：

1. `Obsidian Notes` 已经在 GitHub 上
2. `obsidian-word-history-tool` 还需要你自己推到 GitHub
3. 工具仓库里已经带了 `vendor/star-history/`
4. 构建时除了 Python，还需要 Node / pnpm 来跑 vendored Star History renderer

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
- 保存 vendored `star-history`
- 保存 `README.md`
- 保存生成后的 `out/chart.svg`、`out/analysis.json`

## 先做的第一步：把工具仓库推到 GitHub

如果你还没把 `obsidian-word-history-tool` 推到 GitHub，先做这一步。

在本地工具仓库目录执行：

```bash
cd /Users/hong/Downloads/obsidian-word-history-tool
git remote add origin git@github.com:your-name/obsidian-word-history-tool.git
git push -u origin main
```

做完之后，再继续配置 GitHub Actions。

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
   - 后续在这个目录里安装 Python / Node 依赖、运行生成逻辑，并把产物提交回去

## 运行环境

因为当前工具仓库已经接入了 vendored `star-history` renderer，workflow 里需要两套运行环境：

### Python
用途：
- 分析 Git 历史
- 生成 `analysis.json`

### Node + pnpm
用途：
- 安装 `vendor/star-history/` 和 `vendor/star-history/backend/` 的依赖
- 跑 vendored Star History renderer
- 生成最终的 `chart.svg`

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

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Enable pnpm
        run: corepack enable

      - name: Install vendored Star History dependencies
        working-directory: tool
        run: |
          cd vendor/star-history && pnpm install
          cd backend && pnpm install

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

## 你实际需要手动做的工作

按顺序就是这几步：

1. **把工具仓库推到 GitHub**
2. 在 **Obsidian Notes 仓库** 里加 secret：
   - `WORD_HISTORY_TOOL_PUSH_TOKEN`
3. 在 **Obsidian Notes 仓库** 新建：
   - `.github/workflows/update-word-history.yml`
4. 把上面的 workflow 内容贴进去
5. 把里面的仓库名改成你自己的真实仓库名：
   - `your-name/obsidian-word-history-tool`
6. push 一次 `Obsidian Notes`
7. 看 Actions 是否成功执行
8. 成功后去工具仓库 README 页面确认：
   - `README.md` 能否显示 `./out/chart.svg`

## 更新流转

1. 你在 `Obsidian Notes` 仓库提交并 push
2. `update-word-history.yml` 在笔记仓库触发
3. workflow 用完整历史 checkout 笔记仓库到 `notes/`
4. workflow 再 checkout 工具仓库到 `tool/`
5. workflow 安装 vendored Star History 所需 Node 依赖
6. 运行：
   - 代码来自 `tool/`
   - 数据源来自 `notes/`
   - 输出写回 `tool/out/`
7. 如果 `tool/out/` 有变化，就 commit + push 回工具仓库
8. 工具仓库的 `README.md` 继续用相对路径引用 `./out/chart.svg`

## 必须注意的两个点

### 1) 笔记仓库一定要保留完整历史
如果你的 Actions checkout 不是 `fetch-depth: 0`，这个工具看到的 commit 链就不完整，生成出来的趋势图会偏差很大。

### 2) README 最好只引用工具仓库里的产物
保持 `README.md`、`out/chart.svg`、工具源码都在同一个仓库里，最稳定，也最容易回滚。

### 3) vendored `star-history` 不要在 workflow 里重复 clone
现在它已经进了工具仓库，workflow 只需要：
- checkout 工具仓库
- 安装依赖

不需要再额外 `git clone star-history`。

## 可选增强（不是第一版必需）

如果你后面想把 workflow 改到工具仓库，也可以，但那时你还需要再补其中一种触发方式：

- 笔记仓库 `repository_dispatch` 到工具仓库
- 工具仓库定时轮询笔记仓库

第一版不建议先上这条路；先把“笔记仓库触发、工具仓库存产物”跑通就够了。
