## 信息检查

你给的信息足够做这次评审：里面包含中英文 README、`package.json`/`manifest.json`/`tsconfig`、TypeScript 插件主体、安装脚本、Python CLI/analysis/counting、测试，以及迁移上下文。缺口主要是：目标发布渠道、真实用户反馈、插件设置页截图、目标操作系统分布；这些会影响优先级细节，但不影响本轮 A-F 建议。以下建议把上传文件作为项目证据，历史计划只当背景参考。

------

## A. 项目当前最有价值的一句话定位

**给 Git 管理的 Obsidian 写作者一张本地、自动增量更新、可嵌入笔记的“写作增长曲线”。**

更适合 README 首页的中文版本：

> **把你的 Git 版 Obsidian vault 变成一张长期自动更新的词数增长图，像 Star History 一样看见自己的写作积累。**

英文版本：

> **Turn your Git-backed Obsidian vault into a local, auto-updating word-history chart you can embed in notes, Canvas, websites, or READMEs.**

这个定位要比单纯说 “Star History-style word-count SVG” 更强，因为它直接点出用户、输入、产出、使用场景和长期价值。当前 README 已经具备这些元素：Git-backed vault、SVG、Obsidian note/Canvas/README、增量分析、CJK 支持、本地运行；只是表达还偏功能清单。

------

## B. 最应该保留的 3 个优势

**1. 本地优先、轻运行时，这是最强信任资产。**
插件运行时只依赖系统 `git`，不用 Python、Node、dashboard 或外部服务；这对 Obsidian 用户非常重要，因为他们通常在意本地、隐私、可控、长期可保存。这个优势应该放在首页前 1/3，而非只当功能点。

**2. “一次完整回放 + 后续增量分析”的技术路线值得保留。**
第一次回放完整 Git 历史，之后只分析新增 commit，这个机制解决了长期 vault 的重复计算问题。测试里也覆盖了 JS generator 直接生成 SVG、写 cache、二次运行新增字数为 0、后续 commit 增量更新的路径，说明这已经超出 demo 级别。

**3. 中文/CJK 写作友好是差异化卖点。**
很多字数统计工具默认面向英文空格分词，当前实现明确把 CJK 字符和 space-delimited words 相加，且会读取 `novel-word-count` 的部分配置项。对中文 Obsidian 用户，这是一个比“漂亮 SVG”更有采用价值的卖点。

------

## C. 当前最拖累采用的 5 个问题，按影响排序

| 排名 | 问题                                                         | 为什么拖累采用                                               | 应做的修正                                                   |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 1    | **安装叙事像给 agent/开发者用，普通用户信任成本高**          | README 中文首页直接写“给 agent 的一条安装命令”，还把说明文字放进 `bash` 代码块；安装依赖 raw GitHub 分支 URL。普通 Obsidian 用户看到这里会担心安全、版本、卸载和更新。 | 改成“Beta 手动安装 / GitHub Release / BRAT 安装”三段；把 curl 命令移到高级安装；提供 release zip：`main.js + manifest.json + versions.json`。 |
| 2    | **Git 前置条件太关键，但只出现在注意事项里**                 | vault 必须是 Git 仓库，首次运行会全量回放历史，插件 desktop-only 且依赖系统 `git`。这些决定了用户能否成功，但当前靠 README 注意事项兜底。 | 插件设置页增加 preflight：检测 Git 是否存在、vault 是否 Git repo、是否至少一个 commit、输出目录是否可写；失败时给用户可操作提示。 |
| 3    | **架构边界过胖，`src/main.ts` 同时承担 UI、Git、cache、分析、统计、SVG 渲染** | 当前 `src/main.ts` 包含 settings、update mode、Git HEAD 检查、build、counting、cache、render、date math 等；长期维护、测试和 Codex 修改都会变难。设置页和 build 逻辑已经混在相邻代码里。 | 拆成 `settings.ts`、`git.ts`、`counting.ts`、`analysis.ts`、`cache.ts`、`renderSvg.ts`、`notices.ts`；保留 `main.ts` 只做 Obsidian 生命周期和命令注册。 |
| 4    | **TypeScript 没真正成为安全网**                              | `tsconfig` 里 `strict: false`、`noImplicitAny: false`、`strictNullChecks: false`，这会让复杂的 Git/cache/analysis 状态在重构时更容易隐藏错误。 | 第一周不必一次性全开 strict；先给核心数据结构加类型：`AnalysisState`、`CommitTrendEntry`、`CountConfig`、`BuildResult`、`CachePayload`，然后打开 `noImplicitAny`。 |
| 5    | **README 讲功能多，讲首次成功和“我为什么需要它”少**          | 当前首页有功能、安装、运行、开发、注意事项，但缺少“适合谁 / 你会得到什么 / 3 步首次成功 / 常见失败 / 发布状态”。英文 README 比中文多了 cache path 说明，中英文信息也不完全对齐。 | 首页改成：一句话定位 → 示例图 → 3 步首次成功 → 安装选项 → 功能价值 → 要求与限制 → Troubleshooting → Dev。 |

------

## D. 可执行优化路线图

|      | 目标                       | 小任务                                                       | 产出                                            |
| ---- | -------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
|      | **确定发布与首页信息架构** | 确定首选安装渠道：GitHub Release zip、BRAT、手动复制、未来社区插件目录；确定目标用户文案：Git-backed Obsidian writers / 中文写作者 / long-form note takers。 | README 首页草稿；安装策略决策；发布 checklist。 |
|      | **补齐首次成功路径**       | 在设置页增加状态区：Git detected、Vault is Git repo、HEAD commit、Output path writable、Cache status；运行前做 preflight；失败 Notice 改成具体动作。 | 用户打开设置页就知道能不能成功。                |
|      | **做“生成后闭环”**         | 生成成功后提供：Open SVG、Copy Obsidian embed `![[Reference/chart.svg]]`、Reveal output file、Reset cache；Notice 文案保留 `+N words, total M`。 | 用户生成后能立刻把图放进 note。                 |
|      | **拆架构边界**             | 把 `src/main.ts` 拆模块；新增类型；保留 `__test` 导出但改为从模块 re-export；避免 Obsidian UI 代码依赖分析实现细节。 | 后续维护和 Codex 修改成本下降。                 |
|      | **强化测试与边界场景**     | 增加测试：无 Git、非 Git vault、空 repo、无 commit、大路径/空文件、`.canvas`、frontmatter、rename 行为、cache invalid、output path 创建失败。 | 首次成功路径和异常路径都可回归。                |
|      | **发布包与文档对齐**       | `npm run package` 产出 `dist/word-history`；增加 zip 脚本；README 中英文同步；把 Python CLI 标为 dev/legacy tooling；说明插件 runtime 不依赖 Python。 | 可下载、可解释、可维护的 beta 发布。            |
|      | **发布表达打磨**           | 加 30 秒 GIF 或截图；写 “Who is this for?”、“Known limitations”、“FAQ”；准备 GitHub Release notes。 | 可以发给真实用户试用的 v0.1.1/beta。            |

一周内的判断标准：**一个陌生 Obsidian 桌面用户，只要已有 Git vault，就能在 5 分钟内安装、生成 SVG、把 SVG 插入一篇 note，并理解失败原因。**

------

## E. 适合交给 Codex 执行 vs 需要你本人做产品判断

### 适合交给 Codex 执行

1. **代码拆分与类型补强**
   把 `main.ts` 拆成模块，补 `BuildResult`、`AnalysisState`、`CountConfig`、`CachePayload` 类型，逐步打开 `noImplicitAny`。
2. **Preflight 检查和错误提示**
   实现 `checkGitInstalled()`、`checkVaultIsRepo()`、`checkHasCommit()`、`checkOutputPathWritable()`，并把错误转换成用户能读懂的 Notice/setting status。
3. **设置页增强**
   增加 “Generate now / Open SVG / Copy embed / Reset cache / Last run status” 按钮或状态文本。
4. **测试补齐**
   补无 Git、非 Git repo、空 repo、cache invalid、CJK、frontmatter、canvas、output path 失败等 fixtures。现有测试已经在验证 minimal runtime、JS generator 无 Python 依赖、增量 cache，这部分很适合继续扩展。
5. **Release 打包脚本**
   在 `npm run package` 基础上增加 zip 产物、校验 dist 只含运行时文件。当前安装脚本已经会保留 `data.json` 和 `.cache`、清掉源码和测试，这个方向可以继续强化。
6. **README 初稿改写**
   Codex 可以根据你给的结构生成中文/英文 README，但最终定位词、语气和发布渠道需要你拍板。

### 需要你本人做产品判断

1. **目标用户边界**
   主打 “Git-backed Obsidian writers”，还是尝试覆盖没有 Git 的普通 Obsidian 用户？我建议第一阶段明确服务前者，避免做 Git 教程和普通写作统计工具。【暂时只服务于前者】
2. **安装渠道优先级**
   先做 GitHub Release zip、BRAT，还是冲 Obsidian Community Plugin？这会决定 README 和工程 checklist 的重点。【先做GitHub Release zip、BRAT，暂时不用考虑Obsidian Community Plugin】
3. **中文统计口径的命名**
   CJK 当前近似“一字一词”。对中文用户，README 里到底写“词数”“字数”“word count”还是“writing volume”，需要你决定。建议中文首页用“写作量 / 字数趋势”，设置里保留 “Words” 与英文一致。【中文用户使用字数】
4. **Star History 的表达强度**
   可以说 “Star History-inspired”，但首页价值不要依赖 Star History。更稳的表达是 “growth chart for your writing history”。【可以】
5. **产品范围**
   继续保持单张 SVG，还是加入 HTML report / note table / dashboard？我的建议是 v0.1 保持单张 SVG，把首次成功做到极顺；其他分析数据延后。【保持单张svg】

------

## F. README 中文/英文首页具体改写方向

### 中文 README 建议结构

建议把首页改成这个顺序：

~~~md
# Word History for Obsidian

把你的 Git 版 Obsidian vault 变成一张长期自动更新的写作增长图。
适合长期写作者、中文笔记用户、Zettelkasten/PKM 用户，用一张 SVG 看见自己的写作积累。

![Example word history chart](assets/example-chart.svg)

## 你会得到什么

- 一张可嵌入 Obsidian note、Canvas、网站或 README 的 SVG 增长图
- 第一次回放 Git 历史，之后只分析新增 commit
- 支持 Markdown、Canvas 文本和 CJK/中文内容统计
- 本地运行；插件运行时只需要 Obsidian desktop 和系统 git
- 可手动生成，也可按间隔或 Git HEAD 变化自动更新

## 适合谁

适合已经用 Git 管理 Obsidian vault 的写作者。
如果你的 vault 还没有 Git 历史，本插件只能从已有 commit 里重建趋势。

## 安装

### 推荐：下载 Release zip
1. 下载最新的 `word-history.zip`
2. 解压到 `<vault>/.obsidian/plugins/word-history/`
3. 在 Obsidian Settings → Community plugins 里启用 **Word History**

### 手动安装运行时文件
复制这三个文件到 `<vault>/.obsidian/plugins/word-history/`：

- `main.js`
- `manifest.json`
- `versions.json`

### 高级：命令行安装
[保留 curl 命令，但标为 advanced / beta]

## 3 步生成第一张图

1. 确认你的 vault 是 Git 仓库，并且至少有一个 commit
2. 在插件设置里设置输出路径，例如 `Reference/chart.svg`
3. 命令面板运行 `Word History: Generate word history chart`

生成后，在任意 note 中插入：

```md
![[Reference/chart.svg]]
~~~

## 要求与限制

- 仅支持 Obsidian 桌面端
- 需要系统已安装 `git`
- 只统计 Git commit 历史，未 commit 的写作不会进入历史曲线
- 首次运行会完整回放历史；大 vault 可能需要更长时间
- Git rebase/reset 或统计配置变化时会自动重建 cache
- 当前 note identity 按路径处理；重命名可能拆分历史

## 开发

[把 npm install / npm run build / npm run package 放这里]

```
重点改动：

- 去掉“给 agent 的一条安装命令”作为安装主入口。
- curl 命令保留在高级安装，不作为普通用户第一眼看到的路径。
- 把 Git 前置条件提前到“适合谁”和“3 步生成第一张图”。
- 把“本地运行、无 Python/Node runtime”放进价值区。
- 中文用“写作增长图 / 写作积累 / 字数趋势”，减少纯技术味。

### 英文 README 建议结构

```md
# Word History for Obsidian

Turn your Git-backed Obsidian vault into a local, auto-updating writing growth chart.

Word History replays your Git history once, then incrementally updates an embeddable SVG chart as your vault grows. It is designed for long-term writers, PKM users, and CJK/Chinese note collections.

![Example word history chart](assets/example-chart.svg)

## What you get

- An SVG chart you can embed in Obsidian notes, Canvas, websites, or READMEs
- Incremental updates after the first full Git-history replay
- Markdown, Canvas text, and CJK-friendly counting
- Local-only runtime: Obsidian desktop + system git
- Manual, interval-based, or Git HEAD-change updates

## Who it is for

Use this if your Obsidian vault is already backed by Git.
The plugin reconstructs history from commits, so uncommitted writing sessions are not part of the chart.

## Install

### Recommended: GitHub Release
1. Download `word-history.zip`
2. Extract it to `<vault>/.obsidian/plugins/word-history/`
3. Enable **Word History** in Obsidian settings

### Manual runtime install
Copy these files into `<vault>/.obsidian/plugins/word-history/`:

- `main.js`
- `manifest.json`
- `versions.json`

### Advanced: command-line install
[Move the current curl command here]

## First chart in 3 steps

1. Make sure your vault is a Git repository with at least one commit
2. Set the output path, for example `Reference/chart.svg`
3. Run `Word History: Generate word history chart`

Embed the chart in a note:

```md
![[Reference/chart.svg]]
```

## Requirements and limitations

- Desktop-only Obsidian plugin
- Requires system `git`
- Uses committed Git history only
- First run replays the full history; later runs reuse cache
- Cache is stored in the plugin folder under `.cache/word-history-cache.json`
- Rebase/reset or count-setting changes trigger a full rebuild
- Rename history is path-based in the current version

```
英文 README 当前已经比中文多说明了 cache path，这一点应该同步到中文；中英文都应该把“normal users do not need development”放到后半段，避免用户以为要 `npm install` 才能使用。:contentReference[oaicite:12]{index=12}

---

## 我会优先改的 3 件事

第一优先级：**重写 README 首页和安装路径**。这会立刻降低采用门槛，几乎不需要改代码。

第二优先级：**插件内 preflight + 生成后闭环**。用户能知道失败原因，生成后能直接复制 embed，这是首次成功的关键。

第三优先级：**拆 `main.ts` 与补类型**。当前项目已经有价值，但继续堆功能会让维护成本快速上升；现在拆边界最划算。
```