# 简历专家 Next.js · 迭代设计与验收计划

- 状态：设计完成，尚未开发或部署
- 适用项目：gaoweiblue-source/resume-expert（Next.js App Router）
- 维护目标：geass96/resume-expert-nextjs（上游 GitHub Fork，不覆盖 geass96/resume-expert）
- 现有上游版本：0.1.0；上游提交：0cb249a000ed3064cfb7c0f262722a1bc934d967
- 现有 VPS 部署：Next.js 16.4.1，独立服务和入口 https://resume-expert.geis.de5.net/
- 发布策略：v0.2.0 是下一版；v0.3.0 是第二版。全部仅面向单人桌面浏览器，无手机端任务。

## 0. 决策边界

1. 现有 9 步流程保留：材料输入、JD 解析、诊断、匹配、追问、优化、最终简历、面试准备、导出。
2. 不开发多用户、商业计费、复杂多 Agent、移动适配和公开的账号注册。
3. 下个版本重点是可信简历内容和编辑闭环，而不是增加更多 AI 推理步骤。
4. 不把真实简历、手机号、联系方式、API Key 或私有运行数据提交 GitHub。
5. 公共仓库没有检测到 LICENSE，仅通过 GitHub 官方 Fork 机制建立派生仓库，保留 upstream 关系；未取得许可前不另行发布独立的公共拷贝。
6. 注意个人账号已有 geass96/resume-expert 私有仓库，它使用 Vite/React/Cloudflare Worker，是不同项目，禁止覆盖或改写其代码。

## 1. v0.2.0：历史简历 + 版本对比 + 人工确认式优化闭环（下一版）

### 1.1 用户故事与信息结构

- 主简历（Master Resume）：用户自己确认的事实源，包括基本信息、公司任职、项目事实、学校、技能，不应被 AI 自动覆盖。
- 目标岗位（Job Target）：一个 JD 对应一个职位与公司记录，可关联同一主简历。
- 求职版本（Resume Version）：针对一个岗位的完整结构化简历快照，有版本号、创建时间、备注、父版本 ID 和证据来源。
- 分析批次（Analysis Run）：一次 AI 模型调用的参数摘要、输入版本、提示词版本、建议结果、模型配置与执行状态。
- 修改建议（Edit Proposal）：AI 提出的细粒度修改，包括原文、候选文案、原因、证据引用、虚构风险标记、接受/拒绝/编辑决策。
- 个人口述材料（Introduction）：以用户已确认的简历版本为数据源的一分钟和三分钟自我介绍草稿，可自行编辑、确认并保存。

### 1.2 交互设计：桌面端

在左侧工作流导航增加“历史版本”视图，或在“最终简历”上方放置独立的版本管理栏，不重构整个导航。

主布局：
- 左栏：主简历列表、目标岗位列表、时间线（原始版、AI 候选版、人工确认版），搜索按公司/职位/日期。
- 中栏：当前编辑版本，支持段落逐条接受、拒绝、编辑、撤销。
- 右栏：证据来源、待确认项、模型修改理由、风险提示。
- 对比模式：两个版本并排差异（必要时单列差异）；新增、删除、替换以文字和颜色双重表达。
- 历史版本只读；单击“恢复此版本”创建新版本，不覆盖旧版本。
- 编辑区默认展开本次修改项；空状态明确提示先输入材料或创建岗位。
- 保存状态显示“未保存 / 正在保存 / 已保存 / 保存失败”；网络失败时不丢掉正在编辑的草稿。
- 允许给版本命名，例如“AI PM 大厂投递版”；同岗位可有多个版本和自我介绍。
- 不做移动端适配：开发与验收范围为桌面 1024/1280/1440px，优先 1440px。

### 1.3 核心业务状态机

原始简历 → JD 分析 → 差距与追问 → AI 生成修改建议（候选）
→ 用户逐条接受 / 拒绝 / 手工调整 → 组合为“待确认最终简历”
→ 内容真实性检查 → 用户确认“定稿并保存”
→ 固化不可变版本 → 自我介绍 / 面试材料 / 文件导出均使用该版本。

关键约束：
- AI 的 optimizedItems 与 followUpQuestions.generatedBullet 只是候选建议，不能直接视为最终内容。
- 接受/编辑建议以后，必须定位到对应 section/item 并更新当前工作草稿，不只更新建议数组。
- 拒绝建议不更改草稿；编辑建议须记录原文、AI 原建议、用户最终采纳文案。
- 某项修改缺乏来源证据时显示“需核实”，不允许静默捏造工作年限、项目结果或量化数值。
- 不应依赖字符串 replace 猜测匹配位置；使用 stable itemId + fieldPath + baseVersionId 执行 patch。
- 当旧版本或目标字段已变更时报告冲突，要求重新对齐，而不是覆盖用户修改。
- 每次用户确认定稿生成不可变 Resume Version；再次调整生成 V+1。
- 编辑中途可保存草稿，但只有明确“定稿”后才进入导出默认版本。
- “重新分析”产生新的 Analysis Run，不覆盖已经采纳的人工修改。

### 1.4 历史与版本对比规格

支持：
1. 按主简历/公司/目标岗位分组，默认按保存时间倒序。
2. 任意两个属于同一个目标岗位的版本 A/B 对比；跨岗位时提示差异来源，允许对比但不混淆 JD。
3. 字段级、条目级、段落级对比：摘要、核心技能、工作经历、项目经历、教育。
4. 每次差异显示“之前 / 之后 / 由谁修改（AI 或用户） / 证据 / 决策时间”。
5. 历史版本可预览、复制、导出、恢复为新版本、标记默认版本。
6. 删除单个版本必须二次确认，默认采用软删除与有限保留期；原始事实版本默认受保护。
7. 定稿版本内容为深拷贝 JSON 快照，不能引用当前可变 Zustand 状态导致历史变化。
8. 对比无需 LLM，结构化 diff 在本地执行，避免重复付费和敏感数据外传。

### 1.5 数据持久化技术设计

建议使用已部署 Oracle VPS 的 SQLite，而不是仅用 Zustand 或 localStorage 存档：
- 文件存放在独立持久化路径 /opt/resume-expert/data/resume-expert.sqlite，禁止放在 releases 中。
- WAL 模式、定期一致性检查、在线快照备份与恢复演练。
- 全部数据属于单人账户，但服务器访问仍必须鉴权；API 只允许可信会话写入。
- 浏览器 IndexedDB 仅作未完成编辑的草稿缓冲，不是唯一历史存储来源。
- 导出 JSON 备份与导入恢复作为独立可选操作；备份文件默认不含 LLM 密钥。
- 对敏感简历和个人信息制定保留/删除规则，避免包含原文的日志；R2 如用于备份需加密后上传。
- 升级数据库前制作经校验的在线备份，迁移向前兼容，代码回滚不得覆盖/清空真实数据。

建议表结构（具体 schema 在实施期审阅并确定）：

    resume_profiles(id, owner, title, facts_json, created_at, updated_at)
    job_targets(id, owner, profile_id, company, role, jd_text, created_at, updated_at, current_version_id)
    resume_versions(id, owner, job_id, version_no, parent_version_id, snapshot_json, content_hash, label, note, status, created_at, deleted_at)
    analysis_runs(id, owner, job_id, base_version_id, model, prompt_version, output_json, status, created_at)
    edit_proposals(id, owner, analysis_id, item_id, field_path, before_text, after_text, evidence_refs_json, warning, decision, accepted_text, decided_at)
    introductions(id, owner, version_id, duration, content, accepted, updated_at)

数据库表仅为设计草案，不是已实施的迁移。

### 1.6 API 与安全边界

拟新增：
- GET/POST /api/resume-profiles、/api/job-targets
- GET/POST /api/job-targets/{id}/versions
- GET /api/versions/compare?a={versionA}&b={versionB}
- POST /api/edit-proposals/{id}/decision
- POST /api/job-targets/{id}/finalize
- POST /api/versions/{id}/restore
- POST /api/introductions/regenerate

在 v0.2.0 上线前必须完成：
- Cloudflare Access（并在 API 侧验证身份）或等效独立单用户登录机制；不能只依赖页面隐藏按钮。
- API 请求体长度、文件大小、并发、频次上限；限流防止公众消耗付费 LLM。
- Cookie / session 防护、Origin 与 CSRF 校验，文件上传仅允许白名单类型和受控大小。
- LLM 请求超时、结构化响应校验、错误脱敏、Token / 请求耗时统计。
- 模型输入中 JD/简历视作不可信用户文本，不能把其内含的指令当作系统指令。
- 原始简历信息不在错误日志、前端追踪或 GitHub Actions 中输出。

### 1.7 AI 自我介绍优化（非新建功能）

已有 interviewPrep.selfIntroduction：在初次分析时生成，后续修改简历不会自动更新。
v0.2.0 优化为：
- 默认以“已定稿版本 ID + 目标 JD”作为输入，不能使用过时的最初输入。
- 提供 1 分钟（约 180～260 中文字）与 3 分钟（约 500～750 中文字）草稿；字数可依语速调节。
- 能人工修改、保存到当前版本；重新生成不得静默覆盖已编辑内容。
- 显示“基于版本 Vn 生成”；当简历定稿变化时标记“需重新生成”，不后台自动付费调用。
- 只有存在材料证据的成果和数字才能写进自我介绍。
- 可导出/复制，不增加复杂语音合成或模拟面试 UI。

### 1.8 验收标准（v0.2.0）

A1. 同一主简历可创建两份不同目标 JD 的版本，彼此不串内容。
A2. 每个岗位可生成 V1/V2/V3，旧版本打开后内容与哈希不变。
A3. 修改建议“接受/拒绝/编辑”能准确改变工作草稿；定稿反映每项被接受的内容。
A4. 生成 bullet 后可选择加入某条工作或项目经历；拒绝不会进入最终简历。
A5. 两版对比可识别新增/删除/更改，包含作者、时间、风险、来源信息。
A6. 恢复 V1 后生成 V4，不能覆写 V3，且历史仍可查询。
A7. 刷新页面、重启浏览器、VPS 重新部署后，历史版本仍可访问。
A8. 匿名用户不能读取私人简历，也不能调用收费 AI；跨站写入被拒绝。
A9. 测试网络失败、AI JSON 非法、服务重启和迁移回滚时没有历史数据丢失。
A10. 自我介绍由已定稿 Vn 生成；更换 Vn 后旧介绍清楚标记过期。
A11. 适配桌面 1024、1280、1440，鼠标/键盘操作完整；手机端无验收任务。
A12. 私有简历和模型密钥均不出现在日志、Git、测试夹具或公网无权限 API。
A13. 生产服务继续保留独立 Next.js API、现有 Cloudflare HTTPS 与 OpenResty 转发。
A14. GitHub CI 验证后才允许自动部署，部署前有备份，失败能够回滚代码与恢复可用性。

### 1.9 开发顺序（v0.2.0）

0. 将当前 VPS 经过安全升级的 Next.js 16.4.1 发布配置回归到个人 Fork，修复本地源码与线上版本漂移；新增 CI / 部署流水线。
1. 完成私人访问控制、基础 API 鉴权、输入限制与成本防护。
2. SQLite 表与迁移、备份/恢复，创建主简历、目标岗位、保存和历史读取 API。
3. Immutable Snapshot（不可变快照）+ Version Diff（版本差异比较）+ Restore As New（恢复为新版本）。
4. Patch/Proposal 细粒度应用层，贯通追问答案、优化风格与最终简历；补充真实性校验。
5. 桌面版本时间线、双栏比较和确认交互。
6. 基于定稿版本的自我介绍生成与保存。
7. 单测、隔离 SQLite 集成、Playwright 桌面测试、GitHub CI、VPS 灰度/健康检查。

## 2. v0.3.0：AI 模拟面试（第二版）

首轮仅文字式模拟面试，不做实时语音和手机端：
- 选择一个已定稿简历版本和对应 JD。
- 选择题型：行为面试、项目深挖、AI 产品经理技术/业务、HR 综合。
- 模型一次出题，用户作答，模型依据真实经历和 JD 动态追问。
- 记录每个问题的答复、依据和改进建议；发现虚构数据则提示核实。
- 评分维度：内容真实性、岗位相关性、STAR 结构、表达清晰度、数据口径。
- 支持练习回放、改进记录、对比同岗位的两次练习。
- 形成个人“待补强证据”清单，返回下一轮简历优化；不得自动修改已定稿简历。
- 允许从已有的面试准备题库启动，避免重复设计题库生成。
- 不自动上传录音；实时语音、转写、语音分析、多人面试官可作为后续独立评估。

验收：
B1. 题目确实引用选定版本和 JD，而非默认示例材料。
B2. 追问跟随用户答案，不是固定题库循环。
B3. 用户可随时暂停/恢复，历史练习归属于对应定稿简历。
B4. 评价给出具体证据与可执行建议，不宣称模拟评分等于真实企业录用概率。
B5. 用户修订简历后，新面试使用新版本，旧练习记录仍可回放。

## 3. 暂不纳入范围

- 手机端适配与手机端文件处理。
- 多用户账号、招聘平台自动投递、SaaS 订阅和付款。
- 复杂自主 Agent 编排、联网抓取招聘网站、未经确认自动改写事实。
- 十余种简历视觉模板、实时语音面试、数字人面试官。
- 同时接入多家模型的复杂运营后台。

## 4. 发布与源代码约定

- 原仓库：gaoweiblue-source/resume-expert；只读 upstream。
- 个人 Fork：geass96/resume-expert-nextjs；本设计作为 docs/ROADMAP-v0.2-v0.3.md。
- 已存在的 geass96/resume-expert 私有 Vite 项目完全保持不变。
- 本次任务只完成方案设计、Fork、设计文档提交；不立即改变 https://resume-expert.geis.de5.net/ 的运行代码。
- v0.2.0 功能研发时单独提交，并经 CI、备份、发布与版本健康验证后再上线。
