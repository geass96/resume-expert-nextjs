# Resume Expert v0.6.0 · 浏览器内 ChatGPT OAuth 授权

## 用户使用流程

1. 在个人 Windows 11 电脑上打开 https://resume-expert.geis.de5.net/ ，登录自己的简历专家账户。
2. 进入「模型配置」→「ChatGPT Plus / Pro」→ 点击「连接 ChatGPT 订阅」。
3. 页面打开运行在本机 127.0.0.1 的连接助手。点击「继续使用 ChatGPT 授权」，在 OpenAI 官方页面亲自登录、同意相应的 ChatGPT 订阅用量许可。
4. 授权完成后本机助手自动通过 HTTPS 安全地把已经校验的授权资料发送给用户自己的 VPS。返回原网页等待连接状态显示已连接。
5. 点击「读取订阅可用模型」，选择一个账号实际可用的模型并启用。

整个过程不需要执行终端命令、不需要复制 Token 或配置 SSH。本机连接助手由项目部署时单独安装，并在 Windows 用户登录时自动启动。**首次登录需在已安装助手的个人 Windows 电脑上进行。** 不应将浏览器页面误写成公开的 OpenAI OAuth 回调。

## 实现方案与安全边界

- OpenAI 仅向已获准的网站 OAuth 客户端开放公网回调；本个人开源自托管项目使用官方 localhost 127.0.0.1 OAuth 方式。助手只监听 127.0.0.1:46729，不对局域网或公网开放端口。
- 用户点击网页按钮后，网站在认证会话中签发随机一次性配对令牌，12 分钟失效；配对状态只保存 SHA-256 哈希，不存明文。
- 令牌只进入本机新窗口的 URL fragment，经本机页面主动清除浏览器地址栏再发起本地请求。回调码与访问、刷新 Token 都不会经过简历专家的网页 JS。
- 本机程序负责 PKCE、State、nonce、官方 ID Token 签名验证。成功后通过 HTTPS POST 上传至自己的 VPS，带一次性配对令牌；VPS 再通过 OpenAI JWKS 独立验证签名、issuer、audience、account subject、时间及套餐使用范围。
- 服务器以 AES-256-GCM 保存凭据到个人 SQLite。配对成功后销毁一次性令牌，防止重放。配对过程与受保护页面隔离，失败时不修改原有授权状态。
- 后续令牌刷新、模型选择以及调用官方 Responses API 都由 VPS 完成，不将凭据返回网页。没有 ChatGPT 授权时继续使用原有 Mock 或显式选择的 API Key。
- 本机连接助手属于受用户控制的软件，仅在该用户的 Windows 账户中运行。手动关闭或禁用本机助手会使以后重新授权无法从浏览器发起，但不会影响已经授权后的 VPS Token 刷新。

## 兼容性与限制

- 这是私有 Windows + Oracle VPS 的方案，不是任意公网 Web 站点的一键登录。异地电脑若未安装本机连接助手，则无法使用此按钮。
- OpenAI 对网页应用的 SIWC 接入仍有审核/试点限制。不得用服务端的 OAuth 授权码接收逻辑绕过这项限制。
- 用户本人需在 OpenAI 授权页面明确同意套餐使用权限；代码和自动化测试无法代表用户完成真实同意。
- OpenAI 官方如拒绝该场景的首次动态 OAuth 注册，必须尊重返回结果，不得将 Codex 私有令牌、ChatGPT Cookie 或未支持的网页接口冒充官方授权。

## 代码与运维

- 本机辅助进程：scripts/siwc-browser-bridge.mjs；运行登录程序：scripts/siwc-login.mjs。
- VPS 接口：/api/chatgpt-subscription/pair（认证用户签发）、/api/chatgpt-subscription/pair/complete（使用一次性配对令牌，验证 OpenAI 凭据后保存）。
- 关闭辅助进程：在 Windows 任务管理器结束该进程，并禁用任务计划程序中的 ResumeExpertOAuthBridge。
- 旧的命令行 OAuth/SSH 导入作为离线备用方案保留在 scripts/siwc-login.mjs 和 scripts/siwc-import.mjs，但不再是网页中向最终用户展示的操作流程。
- 配对凭据不会上传 GitHub、写入日志或返回到页面。

## 测试清单

1. 单元：JWT 签名校验、scope、回放和配对失效、安全存储。
2. HTTP 集成：未登录 401、跨站操作 403、登录后创建配对、无效 OAuth 凭据 400。
3. 本机辅助程序：仅本地监听、页面响应、无权限启动失败、手动点击前不主动发起 ChatGPT 授权。
4. GitHub ARM64：类型检查、Lint、单元、依赖审计、Next.js 构建、HTTP 集成与发布包。
5. 生产：备份数据库、分目录部署、健康检查、无真实凭据的配对入口和私有接口安全检查、回滚目录。
6. 模型配置页提供「测试当前订阅模型」按钮；点击后会发起一次真实 Responses API 请求，并在 AI 用量记录中留痕，可能消耗订阅额度。
7. **待用户本人进行的最终验收：** 真实 OAuth 页面确认、实际模型列表及一次订阅 Responses API 调用。未获明确授权前，不自动执行真实订阅调用。

官方参考：
https://developers.openai.com/siwc/token-sharing-open-source/sign-in
https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
https://developers.openai.com/siwc/website
https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
