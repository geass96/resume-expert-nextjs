> **v0.6.0:** Browser-first setup is now implemented. On your configured Windows PC, click the ChatGPT connection button in Model Settings; no manual command or SSH transfer is needed. See [CHATGPT-BROWSER-OAUTH.md](CHATGPT-BROWSER-OAUTH.md). The steps below are an optional legacy fallback.

# Resume Expert · ChatGPT Plus/Pro SIWC 订阅连接

## 适用边界

- OpenAI 官方 Sign in with ChatGPT（SIWC）开源客户端/私人自托管 VM 路径。该路径在电脑本机 127.0.0.1 完成 OAuth 后，经 SSH 将凭据交给自托管 VPS。不是在公网域名上直接发起普通 Web OAuth。
- 商业及由第三方远程托管的服务，需要通过 OpenAI 的合作伙伴申请。你自己的私人 VPS 是否符合开放资格，以 OpenAI 实际授权/应用资格为准。禁止用 Cookie、抓包或私有 ChatGPT 后台接口绕过官方授权。
- 本项目专供单一拥有者，不共享 ChatGPT 订阅给其他人；原先的 API Key/Mock 仍保留。

## 第一次连接：Windows 电脑操作

1. 本机在项目目录执行以下命令，Node.js 24 必须已安装：

    Set-Location D:\Codex\resume-expert-personal
    node scripts/siwc-login.mjs

2. 程序启动临时本机回调并显示官方授权链接，你自己在系统浏览器打开 OpenAI URL、登录 Plus/Pro、阅读并明确批准订阅套餐使用许可。
3. 程序校验 state、PKCE、OIDC ID Token 签名、issuer、audience、nonce 与授权 scope，保存到用户目录 .resume-expert/siwc-chatgpt.json。不要在聊天中发送该文件或其中的 token。
4. 确认已校验 VPS SSH 主机指纹，在 Windows PowerShell 执行下列命令，把 JSON 经过 SSH 标准输入发送到 VPS。凭据不会作为 SSH 命令参数出现：

    Get-Content "$HOME\.resume-expert\siwc-chatgpt.json" -Raw |
      ssh -T ubuntu@137.131.20.193 "sudo /opt/resume-expert/bin/node --env-file=/etc/resume-expert.env /opt/resume-expert/current/scripts/siwc-import.mjs"

5. 访问 https://resume-expert.geis.de5.net/，打开「模型配置」→「ChatGPT Plus/Pro」，刷新连接状态、读取官方模型目录、选定并启用模型。

## 技术与安全

- 服务器保存在现有 SQLite，敏感 OAuth 凭据通过 AES-256-GCM 加密，使用 RESUME_MODEL_ENCRYPTION_KEY（如设置）或 RESUME_SESSION_SECRET 衍生；固定密钥必须在改动前备份。
- 导入器必须由 VPS 管理员在可信 SSH 通道调用，调用时不将 token 输出到命令行或 GitHub。
- VM 生成独立稳定的 ext_agent_host_id，不覆盖本机 Host ID。认证完成后由 VM 刷新令牌。
- 唯一订阅推理端点 https://api.openai.com/v1/responses，参数 store=false、stream=true。只有收到 response.completed 才视为成功。
- 订阅流失败、限流、未授权不会偷偷切换到需要单独付费的 API Key。
- 断开授权会尝试官方 revocation_endpoint；失败时清除本机凭据并提示你在 ChatGPT 设置中手动撤销。
- 随 SQLite 在线备份的授权信息虽经应用级加密，远端备份仍需加密保护。
- 真实套餐余额并非这个功能能推断，请以 ChatGPT 设置中显示的使用限制和状态为准。

## 本版本验收边界

- 未取得用户本人 OAuth 同意时，只能通过模拟凭据进行安全、数据库、刷新与流式响应测试；不能宣称 OAuth 真正登录、套餐使用额度验证完成。
- 官方模型可用范围由授权账号的实际 /v1/models 返回，可能变动。
- 如果需要商业/远程托管应用的特别批准，先通过 OpenAI 官方 interest form 申请，不将个人自托管许可擅自扩大到其他用户。

官方资料：
https://developers.openai.com/siwc/token-sharing-open-source
https://developers.openai.com/siwc/token-sharing-open-source/sign-in
https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
https://openai.com/policies/sign-in-with-chatgpt-terms/
