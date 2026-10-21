# 简历专家

基于目标岗位 JD 的 AI 简历优化 Agent Web App。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand
- lucide-react

## 快速开始

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## 知识卡片

“历史与练习 → 知识卡片”提供48张AI产品经理复习卡，支持翻卡、主题/到期/薄弱筛选、个人项目回答、服务器进度保存及离线版进度导入。无需分析简历或调用模型。使用和数据边界见 [知识卡片说明](docs/KNOWLEDGE-CARDS.md)。

## 使用流程

1. 点击「使用示例数据」填充示例
2. 点击「开始分析」；若尚未启用真实模型则使用 Mock，否则调用当前已启用的模型
3. 按左侧流程导航逐步查看各模块结果
4. 在「经历追问」中填写回答并生成 bullet
5. 在「导出结果」中复制最终简历

## 大模型接入

1. 复制环境变量模板：

```bash
cp .env.example .env.local
```

2. 填写 API Key 与模型配置（支持 OpenAI 兼容接口）：

```env
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

3. 重启开发服务器。顶部导航会显示 **AI 模式**；未配置 Key 时自动使用 **Mock 模式**。

### 常用 Provider 示例

| Provider | LLM_BASE_URL | LLM_MODEL |
|----------|--------------|-----------|
| OpenAI | https://api.openai.com/v1 | gpt-4o-mini |
| DeepSeek | https://api.deepseek.com/v1 | deepseek-chat |
| Moonshot | https://api.moonshot.cn/v1 | moonshot-v1-8k |

### Qoder 个人 PAT

在「模型配置」选择「Qoder（个人 PAT）」，填写 PAT 并保存；点击「读取 Qoder 可用模型」，自行选择账号支持的模型后再次保存。也可直接填写官方模型 ID；`auto` 表示 Qoder 自动选模。最后点击「测试」和「启用」。创建 PAT、部署要求和验收边界见 [Qoder 接入说明](docs/QODER.md)。

## 项目结构

```
src/
├── app/                 # Next.js App Router
├── components/
│   ├── layout/          # 布局组件
│   ├── steps/           # 流程步骤页面
│   ├── shared/          # 共享 UI 辅助
│   └── ui/              # shadcn/ui 组件
├── services/ai/         # AI 服务层
│   ├── resumeAgent.ts         # 客户端 API 调用
│   ├── resumeAgent.server.ts  # 服务端路由（Mock / LLM 切换）
│   ├── resumeAgent.llm.ts     # 真实大模型调用
│   └── resumeAgent.mock.ts    # Mock 数据
├── app/api/             # Next.js API Routes（保护 API Key）
│   ├── analyze/
│   ├── optimize/
│   └── follow-up/bullet/
├── store/               # Zustand 状态管理
└── types/               # TypeScript 类型定义
```

## v0.5.0 — ChatGPT Plus/Pro 订阅 OAuth（个人自托管）

提供 OpenAI 官方 Sign in with ChatGPT 的本机 OAuth → SSH 导入自托管 VM 流程，服务端加密令牌与自动刷新、模型列表与启用、正式 Responses API 流式调用及断开授权。公网 Web 端不伪造 OAuth 回调，且未获得用户授权时保持 Mock/API Key 模式。
本机与 VPS 的授权步骤、安全限制、验收状态参阅 docs/CHATGPT-SUBSCRIPTION.md。真实订阅额度调用须本人明确授予 ChatGPT 计划使用许可并完成一次授权测试。

## v0.6.0 - Browser-first ChatGPT OAuth

The Model Settings page now offers a browser-based "Connect ChatGPT" entrypoint on the owners Windows PC. A localhost-only companion (127.0.0.1:46729) starts the official OAuth loopback authorization; after consent, its authenticated one-time pairing securely delivers verified credentials to the users self-hosted VPS via HTTPS. No user terminal commands, SSH commands, copied tokens, browser cookies, or paid API fallback are required.

Windows helper is configured to launch on user sign-in; reinstall when moving the project to another PC. See docs/CHATGPT-BROWSER-OAUTH.md for architecture and security; docs/CHATGPT-SUBSCRIPTION.md remains a manual legacy fallback. Official authorization and plan usage must still be approved by the account owner.


## v0.7.0 - AI usage and call records

Added the AI usage dashboard to left navigation and Model Settings. Server-side SQLite records each logical AI inference (function, provider/model, subscription/API channel, success/failure, duration, attempts, and actual provider-reported input/output Tokens). Supports time/function/model/status filters, daily totals, group summaries, pagination, and secure owner-only API. Missing usage is explicitly unknown; this is not a ChatGPT subscription balance dashboard. Logs start at v0.7.0; older requests are not backfilled. Details: docs/AI-USAGE-v0.7.md.
