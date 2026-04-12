# Deep Interview Transcript Summary — obsidian-word-history-tool

- **Profile:** standard
- **Context type:** greenfield implementation against a brownfield data source (existing local Obsidian Git repo)
- **Final ambiguity:** 11.8%
- **Threshold:** 20%
- **Rounds:** 5
- **Context snapshot:** `.omx/context/obsidian-word-history-tool-20260412T071400Z.md`

## Condensed Transcript

### Round 1 — Non-goals
**Q:** 第一版里，你明确不想做哪些东西？
**A:** 不需要太多图表，只要简洁几个即可。也不需要账号同步。不需要在线服务。

### Round 2 — Decision Boundary
**Q:** 第一版里，“每天新增字数”是否接受按 commit 日期聚合的每日净增字数，而不是还原当天所有未提交写作瞬间？
**A:** 我接受。

### Round 3 — Success Criteria
**Q:** 如果第一版只保留 3 个核心展示区块，你最希望是哪三个？
**A:** 总字数趋势，每天新增字数，以及单篇笔记 Top N。

### Round 4 — Pressure pass / tradeoff
**Q:** 单篇笔记 Top N 第一版按什么排序？
**A:** 按历史累计净新增字数排序。

### Round 5 — Scope boundary confirmation
**Q:** 第一版是否把“按文件夹统计”明确延期到后续版本，不放进主页面？
**A:** 是的。

## Key Clarifications
- 第一版交付形态：本地 CLI + HTML 报告
- 数据源：本地 Git 历史（不依赖在线服务）
- 字数口径：尽量与 `novel-word-count` 一致
- 风格：接近 Star History，但功能保持简洁
- 第一版主页面仅保留 3 个核心区块：
  1. 总字数趋势
  2. 每天新增字数（按 commit 日期聚合）
  3. 单篇笔记 Top N（按历史累计净新增字数排序）
- 明确非目标：
  - 账号同步
  - 在线服务
  - 过多图表
- 明确延期：按文件夹统计不进入第一版主页面

## Pressure-pass finding
原始需求里曾提到“按文件夹统计”和“单篇笔记统计”等多个方向。经追问后，用户明确第一版只保留 3 个核心区块，并将“按文件夹统计”推迟到后续版本，从而收紧了范围边界。
