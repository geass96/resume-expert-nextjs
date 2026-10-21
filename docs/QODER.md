# Qoder 个人 PAT 接入

本项目通过官方 `@qoder-ai/qoder-agent-sdk@1.0.54` 接入 Qoder，认证方式为个人 PAT。用户选择的模型适用于新发起的分析、优化、追问、自我介绍和面试调用。

## 使用

1. 在 [Qoder Account → Integrations](https://qoder.com/account/integrations) 创建具有所需模型访问权限的 PAT。不要把 PAT 发到聊天、提交到 Git，或填写 Qoder 账号密码。
2. 打开「模型配置」，服务商选择「Qoder（个人 PAT）」。首次可保留模型 ID `auto`，填写 PAT 并保存。保存新配置不会自动启用。
3. 点击「读取 Qoder 可用模型」。目录来自当前 PAT 对应账号；不可用模型在下拉框中禁选。选择模型后再次保存。也可手工填写已知的官方模型 ID，不支持的 ID 会由 Qoder 拒绝。
4. 点击该配置的「测试」执行一次真实 JSON 推理。测试和业务调用会产生 Qoder 用量，计费、Credits 和账号权限以 Qoder 实际规则为准。
5. 点击「启用」。以后新发起的调用使用此配置。编辑已经启用的配置并保存会立即影响后续调用；历史生成结果不会自动重写。
6. PAT 过期时编辑配置并填写新 PAT。SDK 不刷新 PAT；读取模型目录前须先保存更新后的凭据。删除当前配置会切换到 Mock。

`auto` 是 Qoder 自动路由，不代表某个固定底层模型。需要自己固定模型时，请选择账号目录返回的具体模型 ID。目录可能随账号权限和产品调整而变化，不硬编码宣传页列出的模型。

## 部署与调用边界

- PAT 复用现有 AES-256-GCM 加密存储和模型选择机制。浏览器仅收到脱敏配置、模型目录、状态和安全错误；日志不保存令牌、提示词或简历内容。
- 使用独立 Qoder SDK 适配器，不把 Qoder 假定为 OpenAI Chat Completions 端点，不提供任意回源地址。
- SDK 工具集合为空，并拒绝权限请求；不加载服务器的设置、MCP、插件、技能或记忆，不持久化 SDK 会话。每次请求使用临时工作目录和独立 HOME，清除应用环境密钥，结束后关闭运行时并清理临时目录。
- 请求超时 90 秒、最多一轮推理。只接受成功完成的 `result`，拒绝截断、超大、不完整或无法解析的结果。现有业务响应结构校验继续生效。
- SDK 没有本适配器可使用的硬性 `max_tokens` 选项；现有功能的输出预算作为提示词约束发送，不能视为账单上限。温度使用 Qoder 默认配置。
- Qoder 调用复用现有 AI 用量日志，渠道记为 API；显示 SDK 实际返回的 input/output Tokens，缺失时为未知。目录读取不提交用户消息，不进行文本推理，也不计作本应用的 AI 推理记录。
- Next.js 将 SDK 作为服务端外部依赖，并在 standalone 中包含 SDK 和安装时下载的运行时文件。新环境必须允许 npm 安装脚本及 Qoder 官方下载站访问。Windows 本机构建不能替代 Linux ARM64 发布构建。
- 不会在 Qoder 失败后切换到其他供应商，不改变已有 ChatGPT 连接、API 配置和简历历史数据。

## 验收范围

自动化验证使用模拟凭据、模拟 SDK 和独立数据库，覆盖加密配置、明确启用、模型更新、目录读取、禁用工具、环境隔离、失败和截断响应、临时目录清理、权限和 CSRF。真实 PAT 登录、实际账号目录、真实推理质量及 VPS 网络可达性须在用户配置 PAT 后单独验证；不能将模拟测试表述为真实接入验证。

## 官方依据

- [Agent SDK 概述](https://docs.qoder.com/cli/sdk/overview)
- [PAT 认证及轮换](https://docs.qoder.com/cli/sdk/authentication)
- [模型选择与账号模型目录](https://docs.qoder.com/cli/sdk/model-policy)
- [TypeScript 配置、工具禁用及会话控制](https://docs.qoder.com/cli/sdk/references-typescript)
