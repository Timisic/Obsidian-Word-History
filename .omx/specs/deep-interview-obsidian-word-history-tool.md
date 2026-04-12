# Deep Interview Spec — Obsidian Word History Tool

## Metadata
- **Profile:** standard
- **Rounds:** 5
- **Final ambiguity:** 11.8%
- **Threshold:** 20%
- **Context type:** local tool against existing local Git-backed Obsidian vault
- **Context snapshot:** `.omx/context/obsidian-word-history-tool-20260412T071400Z.md`
- **Interview transcript:** `.omx/interviews/obsidian-word-history-tool-20260412T071900Z.md`

## Clarity Breakdown
| Dimension | Score |
|---|---:|
| Intent | 0.82 |
| Outcome | 0.88 |
| Scope | 0.90 |
| Constraints | 0.88 |
| Success Criteria | 0.82 |

## Intent
用户想要一个**稳定、简洁、可长期使用**的本地工具，从自己的 Obsidian Git 历史中重建写作字数变化，并以接近 Star History 的视觉风格查看趋势，而不是做一次性分析或功能复杂的平台。

## Desired Outcome
在 `/Users/hong/Downloads` 下创建一个新的本地项目，第一版通过 **CLI + HTML 报告**：
1. 从 `/Users/hong/Obsidian Notes` 的 Git 历史提取字数变化
2. 尽量对齐当前 `novel-word-count` 的字数口径
3. 输出一个可直接打开查看的 HTML 报告
4. 报告首页只展示 3 个核心区块

## In Scope
- 本地运行的程序（CLI 入口）
- 输入数据来自本地 vault Git 历史
- 第一版 HTML 报告首页包含：
  1. **总字数趋势**
  2. **每天新增字数**（按 commit 日期聚合的每日净增字数）
  3. **单篇笔记 Top N**（按历史累计净新增字数排序）
- 视觉风格参考 Star History：简洁、趋势图优先、适合浏览
- 字数统计口径尽量向 `novel-word-count` 靠拢
- 工具应追求后续可稳定复用

## Out of Scope / Non-goals
- 在线服务
- 账号同步
- 过多图表
- 复杂配置系统
- 第一版主页面中的按文件夹统计
- 还原每次未提交写作瞬间的真实过程

## Decision Boundaries
以下决策 OMX 可自行决定，无需再次确认：
- 新项目目录名与内部文件结构
- 具体技术栈（只要保持简单稳定）
- 图表库与页面实现方式
- 中间缓存/产物格式（例如 JSON/CSV 是否作为内部产物）
- 如何在可行范围内对齐 `novel-word-count` 口径

以下约束不可越界：
- 第一版必须保持简洁
- 主页面只保留 3 个核心展示区块
- “每天新增字数”采用按 commit 日期聚合的定义
- “按文件夹统计”延期到后续版本，不进入第一版主页面

## Constraints
- 数据源优先本地，不依赖 GitHub 远端作为首选
- 必须基于现有本地 Git 历史工作
- 字数口径应尽量贴近 `novel-word-count`
- 交付形式为本地 CLI + HTML 报告
- 后续要可稳定重复使用

## Testable Acceptance Criteria
1. 在 `/Users/hong/Downloads/<project-dir>` 中存在一个可运行的本地项目。
2. 运行 CLI 后，能读取 `/Users/hong/Obsidian Notes` 的 Git 历史并成功生成报告。
3. 生成的 HTML 报告可在本地浏览器直接打开。
4. 报告首页只包含 3 个核心展示区块：总字数趋势、每天新增字数、单篇笔记 Top N。
5. “每天新增字数”明确按 commit 日期聚合，不声称还原未提交写作过程。
6. “单篇笔记 Top N”明确按历史累计净新增字数排序。
7. 第一版不包含在线服务、账号同步、按文件夹统计主页面模块、或明显超出这 3 个核心图表的复杂扩展。
8. 统计结果在合理范围内与当前 `novel-word-count` 口径一致，且差异规则有文档说明。

## Assumptions Exposed + Resolutions
- **假设 1：** 用户需要“真实每天写了多少”的绝对还原。  
  **结论：** 不需要；第一版接受按 commit 日期聚合的每日净增字数。
- **假设 2：** 第一版需要包含多种统计视角（例如文件夹统计）。  
  **结论：** 不需要；第一版收敛为 3 个核心区块，按文件夹统计延期。
- **假设 3：** 需要做复杂产品化能力（同步/在线服务）。  
  **结论：** 不需要；明确排除。

## Pressure-pass Findings
- 原需求中范围偏宽（趋势、每日新增、文件夹统计、单篇统计、过滤规则等）。
- 通过追问排序标准和页面范围，确认第一版只保留 3 个核心模块，并将“按文件夹统计”推迟。
- 该收缩直接降低了实现复杂度，并提高后续稳定使用的可能性。

## Brownfield Evidence vs Inference Notes
### Evidence
- 本地 vault 路径：`/Users/hong/Obsidian Notes`
- 本地 `.git` 存在，commit 数 418，时间跨度 2025-01-16 到 2026-04-12
- `novel-word-count` 插件已安装，且有本地 `data.json`
- 未发现 `obsidian-daily-stats` / `keep-the-rhythm` / `version-control` 的本地统计文件

### Inference
- 第一版“字数口径尽量一致”意味着可先复刻 `novel-word-count` 当前配置对应的主要排除规则，而不是完整复制插件所有内部边缘行为。

## Technical Context Findings
- 数据主来源：本地 Git 历史
- 统计参考：`/Users/hong/Obsidian Notes/.obsidian/plugins/novel-word-count/data.json`
- 现有 Git 提交频率足以支撑“按提交日聚合”的趋势分析

## Condensed Transcript
见：`.omx/interviews/obsidian-word-history-tool-20260412T071900Z.md`
