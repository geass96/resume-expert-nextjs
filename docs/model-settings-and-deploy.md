# Resume Expert · 模型配置、证据核查、自动部署设置

## 当前开发范围

- 历史练习：确认后软删除，页面及详情接口隐藏，数据库与备份仍保留原始记录。
- 简历证据：原始材料与最终简历的文字、数字一致性检查，逐项记录手工核实依据；**不是第三方事实核查**。
- 模型配置：单用户网页登录后管理 OpenAI、DeepSeek、OpenRouter、Groq 的 OpenAI 兼容 API 服务；保存多个配置、启用/停用、连接测试。密码字段不回显，API 密钥服务端 AES-256-GCM 加密。
- 不开放任意自定义 Base URL，防止用户输入 HTTP、私网或元数据地址触发 SSRF。
- 现阶段订阅说明：部分模型商的「套餐 Token/API Key」可直接使用。pi 所支持的 ChatGPT Plus/Pro、Claude Pro/Max 与 Copilot OAuth **不等于 API Key，也未在此版本打通网页登录及刷新**。不可在配置页粘贴账号密码。
- 选择已存储的真实模型后，简历分析、文案改写、面试反馈共用所选服务端模型配置；旧数据不回填、不改写。
- 没有模型密钥时仍可使用 Mock。真实 API 连接测试发起少量实际请求，供应商可能收费。

## 模型密钥管理

- SQLite 持久化文件仍位于 `/opt/resume-expert/shared/resume-expert.sqlite`，启用本地在线备份。
- 推荐在 VPS 的 `/etc/resume-expert.env` 手动设置随机的 `RESUME_MODEL_ENCRYPTION_KEY`（至少 32 个随机字符），并备份至专用密码管理器。
- 暂未设置上述独立密钥时会使用原有 `RESUME_SESSION_SECRET` 派生；后续若更换 session secret，先迁移或导出并重建模型凭据，否则密钥无法解密。
- 不把任何 API Key、OAuth token、简历材料写入 GitHub、CI 日志、前端响应或本项目 README。
- 若怀疑凭据泄漏，请在供应商控制台轮换密钥，删除旧模型配置并重新保存。

## GitHub 自动部署前置配置（本地安装动作）

GitHub 仓库为 **公开 Fork**。GitHub Actions `check` 会自动测试并打包 ARM64；`deploy` 只在 push main 且仓库变量 `RESUME_AUTO_DEPLOY=true` 时运行，避免未配置凭据时破坏线上服务。

自动部署需要你可访问 VPS 的电脑在线，由管理员执行以下一次性动作：

1. 核实 SSH 的独立部署账号与 `sudoers` 最小权限。推荐配置独立、无法交互登录的密钥，只允许执行预期部署命令；不要直接复用个人日常 SSH 私钥。
2. 在 VPS 将此仓库的 `ops/deploy-release.sh` 安装为 root 拥有的 `/usr/local/sbin/resume-expert-release-deploy`，模式 `0755`；检查文件内容、属主、目标服务与 /opt 路径。
3. 为 GitHub Actions 创建独立 SSH 私钥，公钥写入目标用户的 `authorized_keys`，按最小必要 sudo 权限授予调用部署脚本的能力。
4. 在 GitHub **Settings → Secrets and variables → Actions** 中添加 Repository Secrets:
   - `RESUME_DEPLOY_SSH_KEY`: 独立部署私钥
   - `RESUME_DEPLOY_KNOWN_HOSTS`: 已经通过可信渠道核验的 VPS SSH 主机公钥行（不能从未校验的 ssh-keyscan 结果直接信任）
5. 添加 Repository Variables:
   - `RESUME_DEPLOY_HOST`: VPS 域名或地址
   - `RESUME_DEPLOY_USER`: 专用部署用户
   - `RESUME_AUTO_DEPLOY`: 暂不设置；待首次受控部署验证成功后设为 `true`
6. 配置 Environment `production` 与保护策略。启用后 push main 且 CI 成功将上传 ARM64 构建包，通过 SSH 推送到 VPS；部署脚本先在线备份 SQLite，然后切换新发布目录、健康检查失败自动回滚应用代码。原数据库和密钥配置不被覆盖。
7. 测试首次失败回滚、无权限的 SSH 密钥、错误健康提交号以及旧版本恢复。 **这些真实 VPS 操作未执行前，不要宣称自动部署已启用。**

## 回滚与安全限制

- 数据库为增量 schema（新面试软删除字段、模型配置表），旧代码一般不会执行新增 API，但已有数据可能依赖新代码。
- 代码切换不会回滚数据库迁移；涉及破坏性 schema 更改时需要额外数据兼容评估。
- 模型凭据随 SQLite 备份保留，备份文件权限应继续是 `0600`，异地备份前须加密。
- 建议以后给模型真实调用添加费用/Token 预算、失败重试保护和独立密钥轮换 UI。
