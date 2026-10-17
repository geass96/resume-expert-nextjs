# Resume Expert · 模型配置、安全与自动部署

## 当前实现范围

- 应用定位：个人单用户、自托管的 AI 简历工作台，不是多租户 SaaS。
- 简历工作流：JD 解析、诊断、岗位匹配、经历追问、简历优化、定稿、面试准备、历史版本和模拟面试。
- API Key 模型：支持 OpenAI、DeepSeek、OpenRouter、Groq 的预设 OpenAI 兼容端点；可保存多个配置、测试、启用和删除。服务端以 AES-256-GCM 加密密钥，不向前端回显。
- ChatGPT 订阅 OAuth：浏览器优先的本机授权助手与一次性配对导入已经实现；VPS 端校验 OpenAI ID Token、加密保存凭据、刷新令牌、读取授权账号可用模型、启用模型、调用 Responses API 和断开授权。操作流程见 [CHATGPT-BROWSER-OAUTH.md](CHATGPT-BROWSER-OAUTH.md)。旧的本机 OAuth/SSH 导入流程仅作为备用方案。
- 不开放任意自定义 Base URL，避免用户配置 HTTP、私网或云元数据地址造成 SSRF。
- 没有启用真实模型时使用 Mock。ChatGPT 订阅面板的「测试当前订阅模型」会发起一次真实模型请求并写入 AI 用量记录；只有需要验收真实调用时才点击。
- AI 输出在进入工作流前进行运行时结构校验；校验失败应显示错误，不应把不完整结构当成有效结果。
- 证据核查仅比较用户材料与生成结果中的文字/数字并记录人工核实依据，不等于第三方事实核查。

## 模型密钥与数据保护

- SQLite 生产数据库：/opt/resume-expert/shared/resume-expert.sqlite。
- 推荐在 VPS 的 /etc/resume-expert.env 设置独立随机的 RESUME_MODEL_ENCRYPTION_KEY（至少 32 个随机字符），并保存在专用密码管理器中。
- 未设置独立密钥时，凭据加密会使用 RESUME_SESSION_SECRET 派生的密钥。轮换 Session Secret 前，必须先规划现有模型凭据的迁移或重建，否则旧凭据将无法解密。
- 原始简历、JD、最终简历和分析记录保存在 SQLite 中，**当前不是数据库级透明加密**。必须通过最小文件权限、主机访问控制和备份加密保护这些数据。
- 不把 API Key、OAuth token、Cookie、简历材料、SQLite 运行库或备份提交到 GitHub、CI 日志或截图。
- .gitignore 已忽略 SQLite/DB 文件及常见备份目录；忽略规则不能自动取消已经被 Git 跟踪的文件，推送前仍需检查 git ls-files 与差异。
- 生产 SQLite 在线备份保存在 /var/backups/resume-expert，应维持 0600 文件权限。该目录中的本机备份不等于异地灾难恢复；异地上传前必须加密，并定期演练恢复。

## 请求安全与限流

- 登录、AI 请求和 OAuth 配对导入使用 CF-Connecting-IP 作为客户端限流标识，不再信任请求方可自行构造的 X-Forwarded-For。
- **前置条件：源站必须禁止绕过 Cloudflare 直接访问。** 如果攻击者能直接连接源站并自行设置 CF-Connecting-IP，该头就不能被视为可信客户端地址。应在云防火墙/主机防火墙/反向代理层限制源站入口，仅允许预期的 Cloudflare 流量。
- 缺少或格式不正确的 Cloudflare IP 头会归入 unknown，不会回退到 X-Forwarded-For。本应用当前为单实例，内存限流在进程重启后会清零；多实例部署应使用共享限流存储或边缘规则。
- JSON API 使用按 UTF-8 字节数限制的流式读取，即使 Content-Length 缺失也会执行实际读取上限。上限由具体 API 的输入规模决定。
- 对公开的 /api/chatgpt-subscription/pair/complete，应用按客户端 IP 限流；还应在 Cloudflare 为该路径配置边缘速率规则，防止分布式流量消耗服务端验证资源。

## GitHub 自动部署前置配置

GitHub 仓库为公开 Fork。GitHub Actions 会执行类型检查、Lint、测试、生产依赖审计、Next.js 构建、HTTP 集成测试并打包 ARM64 发布包。deploy 仅在 push main 且仓库变量 RESUME_AUTO_DEPLOY=true 时运行。

自动部署需要管理员完成以下一次性配置：

1. 核实 SSH 的独立部署账号与 sudoers 最小权限。推荐使用独立、不能交互登录的密钥，只允许执行预期部署命令；不要复用日常 SSH 私钥。
2. 在 VPS 将 ops/deploy-release.sh 安装为 root 拥有的 /usr/local/sbin/resume-expert-release-deploy，模式 0755；检查脚本内容、属主、服务名及 /opt 路径。
3. 为 GitHub Actions 创建独立 SSH 密钥，公钥写入目标用户的 authorized_keys，仅授予调用部署脚本所需的 sudo 权限。
4. 在 GitHub Settings → Secrets and variables → Actions 中添加 Repository Secrets：
   - RESUME_DEPLOY_SSH_KEY：独立部署私钥
   - RESUME_DEPLOY_KNOWN_HOSTS：通过可信渠道核验的 VPS SSH 主机公钥行，不能直接信任未经验证的 ssh-keyscan 输出
5. 添加 Repository Variables：
   - RESUME_DEPLOY_HOST：VPS 域名或地址
   - RESUME_DEPLOY_USER：专用部署用户
   - RESUME_AUTO_DEPLOY：首次受控部署验证完成前保持未启用
6. 配置 production Environment 及必要的保护策略。启用后，push main 且 CI 成功会上传 ARM64 构建包，通过 SSH 部署；脚本先在线备份 SQLite，再切换发布目录并进行健康检查，失败时回滚应用代码。原数据库和环境配置不应被发布包覆盖。
7. 首次启用前测试失败回滚、无权限 SSH 密钥、错误健康检查提交号和旧版本恢复。以上真实 VPS 操作未执行前，不得声称自动部署已启用。

## 回滚与验收边界

- 代码回滚不等于数据库迁移回滚。破坏性 Schema 变更必须单独制定数据兼容和恢复方案。
- CI 通过只证明自动化检查通过，不代表真实 OAuth、订阅额度或生产浏览器流程已经验证。
- 真实 ChatGPT 订阅测试会使用账号当前可用的订阅额度；未经本人授权，不得用真实令牌或额度进行自动化测试。
- 生产发布后应验证 /api/health 返回预期 Commit SHA，匿名请求被拒绝，登录后的模型配置与用量页面正常，并确认历史记录可以保存和恢复。
