# v0.2.0 实施说明（个人电脑优先）

本版本已引入：Next.js 16.4.1、单人密码登录、API 访问保护、SQLite 历史简历、不可变保存与恢复、版本对比、确认采纳/拒绝及编辑简历、追问 bullet 归档、绑定已定稿版本的一分钟/三分钟自我介绍。

## 关键安全配置

私有环境变量应由 systemd EnvironmentFile 注入，必须在 Git 工作区之外。不要写入 .env.example：
- RESUME_PUBLIC_ORIGIN=https://resume-expert.geis.de5.net
- RESUME_DATA_DIR=/opt/resume-expert/shared
- RESUME_PASSWORD_SALT=随机字符串
- RESUME_PASSWORD_HASH=scrypt(密码,salt,32).hex()
- RESUME_SESSION_SECRET=长度至少 32 的随机密钥
- USE_MOCK_AI=true（若暂时没有大模型密钥）

生产页面与私有 API 默认拒绝匿名访问；登录使用 HttpOnly、SameSite=Strict、Secure Cookie；写入接口检查 Origin。AI 请求限制 10 次/分钟，基础 API 有进程级限流，LLM 请求超时为 90 秒。此版本尚未引入分布式速率限制和每日费用预算。

## 业务说明

1. 在输入页面完成 JD 和简历分析。
2. 在“简历优化”逐项选择目标段落并采纳，或拒绝建议。
3. 在“经历追问”选择要加入的工作/项目，确认追加 bullet。
4. 到“最终简历”检查并手动修改草稿。
5. 在“历史版本”指定岗位、备注并点击“确认定稿并保存版本”。
6. 两个版本可并排对比；恢复旧版时只更换编辑草稿，重新定稿才创建新版本，旧版仍保持不变。
7. 在“面试准备”使用已保存版本的自我介绍生成入口；没配置 LLM 时只生成标记明确的 Mock 示例草稿。

历史数据存于 /opt/resume-expert/shared/resume-expert.sqlite，使用 WAL；发版不可替换此目录。老版网站仅内存工作流，无历史库可迁移。测试只能使用隔离数据库。

## 未完成/限制

- 尚未接入真实付费 LLM API Key，当前 Mock 结果为演示数据，不可作为真实求职评分。
- 未开发真正的 Word/PDF 导入导出；仍保留纯文本复制功能。
- 历史对比为结构化简历的并排对应行差异，尚不是精细字符级 diff。
- 每次保存版本均是全量不可变快照；目前主要保存最终简历的结构化字段，主简历管理仍是轻量级。
- 部分来自原始上游的 AI 提示词和 Mock 数据尚未补全独立真实性评测。
- 密码失效/忘记时需要在 VPS 管理环境中重新生成哈希；尚无自助找回页面。
-  v0.3.0 文字模拟面试仍属于下一版开发计划，不在此次交付。
- PC 桌面端为唯一正式验收范围，不安排手机端优化。

## 发布约束

在本地和 CI 运行 npm ci、npm run typecheck、npm run lint、npm test、npm audit --omit=dev 和 npm run build，随后运行 node scripts/integration.mjs。提交 main 后在 VPS 保留上一版发布目录，执行 SQLite 备份、权限校验、部署健康探测，失败切回旧软链接和旧服务。
