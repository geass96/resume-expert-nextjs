# Resume Expert v0.7.0 · AI 用量与调用记录

## 目标与入口

侧边栏新增 **AI 用量**，模型配置新增 **打开用量统计**。展示最近 7、30、90 天与全部调用，支持按功能、模型、成功/失败筛选；包括调用总量、成功率、已报告 Token、平均耗时、按 UTC 日柱状图、按功能汇总以及每页 25 条的明细。

## 何时产生一条记录

仅在服务端真正执行一次逻辑 AI 推理时插入一行，包括：
- JD 解析、简历诊断与匹配、初次优化、面试准备（首次完整分析共 4 个逻辑调用）
- 重新生成优化、经历追问改写、生成自我介绍、模拟面试每轮答案评价
- 页面 API Key 模型连接测试（注意：可能产生少量 API 计费用量）

每行包含功能名称、提供商和模型、**订阅 OAuth** 或 **API Key** 路由、完成状态、毫秒耗时、物理尝试次数、服务商**实际报告**的输入/输出 Token、固定格式失败状态码。SQLite 表为 ai_usage_calls，独立于历史简历版本，不写入 OAuth 令牌、API Key、完整提示词、简历、JD、回答或响应文本。

Mock、只打开历史页面、模型列表查询、证据规则核查、手动编辑等不会进入 AI 推理日志。

## 统计口径

- 一个 `chatCompletionJSON` 逻辑调用对应一条记录。单个调用有自动重试或 JSON 修复请求时，`attempts` 显示物理请求次数；用量仅在所有提供商请求返回计数后才作为完整数字显示，避免部分计量看似总量。
- OAuth Responses 从流中的 `response.completed.response.usage.input_tokens/output_tokens` 读取；普通 Chat Completions 读取 `usage.prompt_tokens/completion_tokens`。如果供应商没有完整返回，则输入输出保存为 NULL，前端显示“未返回”。
- 汇总中“已报告 Tokens”仅累加返回了完整数字的行；未报告不能被误解为零开销。
- HTTP 失败与网络错误记录固定的错误分类，不回显服务商响应、用户提示词或秘钥。
- 总量统计只反映 **v0.7.0 上线以后的请求**，不能倒查之前的 ChatGPT Plus / Pro 消耗。
- **没有剩余订阅额度、官方用量配额或账单费用的查询**，不能把 Tokens 计数当作 ChatGPT 套餐余额；不同模型 Token 也不能直接换算成美元。
- 使用 UTC 日历天作为趋势分组；具体明细时间由浏览器以本地时区显示。

## 安全与持久化

- `GET /api/ai/usage` 必须登录单用户会话，未登录返回 HTTP 401；页面不会读取 SQLite 或明文凭据。
- 只接受受限参数 `days=(7|30|90|0)`、`purpose`、`status`、`model`、`page`、`pageSize`，用 SQLite 预处理 SQL，分页上限 100 条。
- 所有记录保存在现有 `RESUME_DATA_DIR/resume-expert.sqlite`，沿用原先 SQLite 在线备份策略。若监控写入失败，模型请求本身不会因日志中断。
- 暂不自动清理已保存用量记录，以避免未经用户同意删除历史数据；后续可加入保留周期、CSV 导出、每日预算告警。
- 生产环境上线前对 SQLite 做在线备份和完整性校验，不覆盖真实简历数据。

## 验收

- `npm run typecheck`
- `npm run lint`
- `npm test`（用量过滤和 Stream Usage 测试）
- `npm run build`
- `node scripts/integration.mjs`（未登录 401、合法筛选 200、恶意参数 400、无凭据泄露）
- Windows Edge 桌面 UI 测试
- GitHub ARM64 CI 与生产版本健康检查
- 在隔离测试数据中产生真实 AI 请求并确认页面显示用量及来源（不动个人简历）
