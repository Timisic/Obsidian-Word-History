# Obsidian Word History 自动化路线图

## 目标

把当前这个本地工具逐步演进成一个近似 `Star History` 的自动更新流程：

- 本地写作后继续使用 Git 保存历史
- GitHub 仓库每次有新提交时自动重建字数趋势图
- 将生成出来的 `chart.svg` 直接嵌入仓库 `README.md`
- 最终在 GitHub 首页 README 中直接看到字数增长历史

---

## 当前现状

当前仓库已经具备这些能力：

1. 从本地 Obsidian Git 历史回放总字数趋势
2. 输出 `analysis.json`
3. 输出 `chart.svg`
4. 输出 `report.html`
5. 字数统计口径尽量贴近本地 `novel-word-count`
6. 默认输出到项目内 `out/`

当前适合做自动化的主产物是：

- `out/chart.svg`

原因：
- SVG 文本可 diff
- Git 友好
- GitHub README 可直接引用
- 不会像 PNG 那样在额外转码时引入不一致问题

---

## 用户侧最终期望形态

目标使用方式：

1. 你的 Obsidian vault 继续正常 Git 提交
2. 某个 GitHub Actions 工作流在 push 后触发
3. 工作流运行本工具，重建最新 `chart.svg`
4. 工作流把 `chart.svg` 提交回统计仓库
5. `README.md` 中通过相对路径引用这张图
6. GitHub 页面自动展示最新趋势图

最终 README 大致会像这样：

```md
## Word History

![Word History](./out/chart.svg)
```

---

## 推荐的仓库结构

后续建议把职责拆成两层：

### 方案 A：继续使用当前单仓库（推荐起步）

当前统计仓库内保留：

- 程序源码
- `out/chart.svg`
- `README.md`
- GitHub Actions workflow

优点：
- 最简单
- 容易先跑通
- 维护成本低

缺点：
- 统计程序本身和图表产物放在同一仓库里

### 方案 B：代码仓库 / 数据仓库分离

拆成两个仓库：

1. `obsidian-word-history-tool`
   - 放程序代码
2. `obsidian-word-history-data`
   - 放生成结果、README、workflow

优点：
- 结构更清晰
- 数据展示仓库更干净

缺点：
- 配置更复杂
- 初始维护成本更高

**建议先走方案 A，跑通后再决定要不要拆。**

---

## 自动化实现分期

## Phase 1：本地稳定化

目标：确保当前工具作为 CLI 足够稳定。

需要完成：
- [ ] 修正时间轴与真实 commit 时间的对应问题
- [ ] 进一步对齐 Star History 的时间刻度逻辑
- [ ] 把 chart 渲染代码继续往同源实现靠近
- [ ] 明确 `analysis.json` 的 schema 稳定性
- [ ] 为真实 vault 增加回归检查脚本

完成标准：
- 本地多次运行结果稳定
- 生成的 `chart.svg` 可以长期作为 README 图使用

---

## Phase 2：README 嵌入

目标：先手动把图嵌入当前仓库 README。

需要完成：
- [ ] 在 `README.md` 中加入图表展示区块
- [ ] 使用相对路径引用 `./out/chart.svg`
- [ ] 保证 GitHub 页面能直接显示

示例：

```md
## Word History

![Word History](./out/chart.svg)
```

完成标准：
- 本地 push 后，GitHub README 能看到图

---

## Phase 3：GitHub Actions 自动更新

目标：做到 push 后自动重建图。

需要完成：
- [ ] 增加 `.github/workflows/update-word-history.yml`
- [ ] workflow 中 checkout 仓库
- [ ] 安装 Python 运行环境
- [ ] 执行：
  ```bash
  PYTHONPATH=. python3 -m obsidian_word_history build --vault "<vault path or checked out data source>"
  ```
- [ ] 如果 `out/chart.svg` 有变化，则自动提交

这里有一个关键问题：

### GitHub Actions 上拿不到你的本地 Obsidian vault

所以后续必须明确数据源怎么进入 CI：

#### 路线 1：把 vault 本身就是 GitHub 仓库
如果当前 Obsidian Notes 仓库本身就在 GitHub，并且 workflow 就运行在这个仓库里，那么最简单。

#### 路线 2：统计仓库通过 git submodule / second checkout 拉取 vault
让 workflow 在运行时额外 checkout 你的笔记仓库。

#### 路线 3：定时从另一个私有仓库拉取
如果 vault 是私有仓库，可以通过 token 拉取。

**最推荐：路线 1 或路线 2。**

---

## Phase 4：增量更新

目标：不再每次全量回放全部 419+ commits，而是只处理新增 commit。

需要完成：
- [ ] 在 `out/` 或 `.cache/` 中保存上次处理到的 `head_commit`
- [ ] 保存上次计算后的 canonical intermediate state
- [ ] 新运行时只回放增量 commits
- [ ] 如果历史被改写（rebase / force push），自动回退到全量重建

建议缓存内容：
- 上次 `head_commit`
- 上次每篇笔记的最新字数
- 上次 commit trend 结果
- 最近 30 天活跃统计中间索引

完成标准：
- 正常新增提交时，构建时间显著缩短
- 历史改写时可安全 fallback

---

## Phase 5：更像 Star History 的展示层

目标：展示体验进一步接近 Star History。

需要完成：
- [ ] 更接近其原始 renderer 的坐标轴与 tick 布局
- [ ] 处理不同年份跨度的自适应时间刻度
- [ ] 如果必要，支持 timeline/date 两种模式
- [ ] 让 legend、标题、留白更接近原版

注意：
这里仍然建议保留当前“数据分析在 Python，展示产物是 SVG”的总体架构，而不是把整个项目改成前端应用。

---

## 当前已知难点

### 1. 时间轴精度问题
你已经观察到：
- 某个陡增点和真实时间可能偏差接近 1 个月

这说明目前的 x 轴 tick 与点位映射仍需继续校正。
这是自动化前必须优先处理的问题。

### 2. rename 仍按 path split
现在 rename 不合并，这会影响：
- 单篇内容长期排名
- 最近 30 天高频内容识别

V1 先接受，但后续可能需要 lineage 方案。

### 3. CI 数据源问题
GitHub Actions 无法直接读取你的本地路径：
- `/Users/hong/Obsidian Notes`

所以自动化之前必须明确：
- vault 仓库在哪里
- workflow 如何 checkout 到它

---

## 推荐的下一步顺序

建议按这个顺序推进：

1. **先修时间轴 bug**
2. **把 README 加上 `chart.svg` 展示**
3. **设计 GitHub Actions 工作流**
4. **再做增量缓存**

不要一开始就做缓存，因为如果时间轴逻辑还没完全稳，缓存只会把问题固化。

---

## 未来自动化的最小落地版本

当你准备真的开始自动化时，最小版本应是：

- 一个仓库
- 一个 `README.md`
- 一个 `out/chart.svg`
- 一个 GitHub Actions workflow
- 每次 push 自动更新图并提交回仓库

这就是最接近 `Star History` 的可用版本。

---

## 本文档用途

这份文档不是实现说明，而是后续演进路线图。

后面如果继续做，建议从这里拆出：
- 自动化实施计划
- GitHub Actions 设计稿
- 增量缓存设计稿
