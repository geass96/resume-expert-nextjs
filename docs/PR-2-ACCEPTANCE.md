# PR #2 补充修复、真实验收与源站分析

报告更新：2026-10-21（北京时间）。真实请求与网络复现执行于 2026-10-20；2026-10-21 复核生产服务仍为 active、发布目录仍指向 `git-3478ff6c3b8e/standalone`。PR 保留 Draft，未合并、未上线。

## 已完成的补修

1. 重新分析默认保留返回时的最新人工草稿、决策与核实说明，不再使用 `parentVersionId` 判断首次保存前的草稿是否值得保留。第一次分析仍正常初始化；新候选建议不会继承旧 ID 的决策。
2. 面试回答在 `BEGIN IMMEDIATE` 写入事务内再次检查 `deleted_at IS NULL`。删除先提交时，延迟返回的回答被拒绝，既不插入回合，也不修改软删除记录；API 返回 409，并说明回答未保存。
3. 真实验收暴露的订阅共享额度错误，按固定代码映射为明确提示，不回显供应商消息、材料片段或令牌，也不声称知道恢复时间。

三个草稿/删除回归在修复前 0/3，通过修改后 3/3。完整最终检查为 57/57 测试，类型检查、构建、隔离 HTTP 集成通过；Lint 为 0 errors / 4 条原有 warnings；生产依赖审计为 0 个已知漏洞。

浏览器在隔离 Mock 环境实际完成“首轮分析 → 人工编辑摘要与核实说明 → 首次保存前重新分析 → 返回最终简历”，确认两处人工内容均保留。该浏览器检查不能代替真实供应商全流程验收。

## 真实订阅验收：部分成功，完整流程未通过

用户明确授权后，在 VPS 临时目录构建当前修复版本，仅监听回环地址。测试材料完全虚构，使用独立登录、会话密钥和临时 SQLite，生产简历、岗位及面试数据没有复制或改写。

仅在 VPS 本机将必要的加密订阅记录、主机标识和模型选择配置复制到临时环境；密钥与令牌未输出到聊天、日志、命令参数或仓库。准备时现有 access token 有效，未触发生产令牌刷新，也没有改变生产模型选择。临时环境使用当时已选中的 `gpt-6.1-sol`。

| 阶段 | 真实结果 | 已有证据 |
| --- | --- | --- |
| 隔离登录与订阅选择 | 通过 | AI 模式为 llm，provider 为 chatgpt-siwc |
| JD 解析 | 通过 | 48,566 ms；供应商报告 input 780 / output 1,967 tokens |
| 简历诊断 | 通过 | 66,293 ms；供应商报告 input 887 / output 2,852 tokens |
| 简历优化与面试准备并发阶段 | 未完成 | 面试准备流内失败；分析请求未生成完整结果，另一个并发请求的最终供应商结算未知 |
| 针对失败阶段的一次诊断请求 | 确认额度阻断 | HTTP 200 的 SSE 内返回 error / response.failed，代码为 subscription_sharing_usage_limit_exceeded，类型为 invalid_request_error |
| 真实风格再生成、保存/恢复、新 JD 面试 | 未验收 | 因完整分析失败而未进入，不使用 Mock 冒充通过 |
| 真实令牌刷新 | 未验收 | 准备时无需刷新；Mock 生命周期回归通过不等于真实刷新通过 |

上述两次成功调用合计为供应商已报告的 input 1,667 / output 4,819 tokens；这不是本次尝试的完整计费或套餐用量。失败请求及并发中断请求不能据此算作零消耗。恢复时间、套餐剩余额度未知。没有切换到付费 API Key，也没有循环重试。

2026-10-21 已删除 VPS 临时应用、隔离库及凭据文件，确认临时 3198 端口未监听、生产服务仍 active。重跑真实验收需要重新创建隔离环境；不会自动恢复付费测试。

## 源站为什么能直达

置信度：高。正常域名访问经过 Cloudflare，响应包含 `Server: cloudflare` 与 CF-RAY；将相同域名强制解析到 VPS IPv4，仍得到 `Server: openresty` 和同一生产 commit 的健康结果。匿名直连 `/api/history` 返回 401，未证明绕过应用密码认证。

最小复现（只读）：

```powershell
curl.exe --noproxy '*' -skS --resolve resume-expert.geis.de5.net:443:137.131.20.193 https://resume-expert.geis.de5.net/api/health
```

`-k` 仅用于这一次诊断：源站使用 Cloudflare Origin CA 服务器证书，本机通常不信任该证书。证书不受普通浏览器信任，不会阻止主动客户端连接；没有关闭系统或浏览器证书验证。

读取到的实际路径为：

```text
普通访客 → Cloudflare → VPS 公网 443 → SNI 分流 → 127.0.0.1:8443 → 127.0.0.1:3101
主动直连 → VPS IP + 正确 SNI/Host ────────────→ 相同站点 → 相同应用

公网 443 的特定 www.cloudflare.com SNI → 127.0.0.1:1443（REALITY）
其他 SNI                              → 127.0.0.1:8443（HTTPS 站点）
```

具体证据：

- 主机 `1PANEL_BASIC` 防火墙链允许所有来源 TCP 443、UDP 443、TCP 80，没有在该入口把简历站点限制为 Cloudflare 来源。成功直连也证明该次外部 IPv4 路径没有被云网络入口阻断。
- OpenResty stream 配置只按 `$ssl_preread_server_name` 选择后端，`ssl_preread on` 不验证客户端来自 Cloudflare。正确 SNI 是公开域名信息。
- `/opt/1panel/www/conf.d/resume-expert.conf` 中的 HTTPS server 监听 `127.0.0.1:8443 ssl`，代理到 `127.0.0.1:3101`，没有来源白名单或 `ssl_verify_client`。应用只监听回环地址也不能阻止反向代理接受公网直连。
- 源站证书签发者为 Cloudflare Origin SSL Certificate Authority。这是服务器身份和链路加密用途，不等于对 Cloudflare 回源客户端进行认证。
- 443 stream 后端连接没有配置 PROXY protocol；8443 所见连接来源是回环代理。直接在 8443 使用现有 `$remote_addr` 套 Cloudflare IP 白名单会判断错误，不能把这一改动当成可直接上线的修复。

Cloudflare 的 DNS/橙云决定正常 DNS 查询与访问经过代理，不会自动改写你的 VPS 防火墙，或关闭已知源 IP 的直接访问路径。见 [Cloudflare DNS 工作方式](https://developers.cloudflare.com/fundamentals/concepts/how-cloudflare-works/) 与 [回源认证原理](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/explanation/)。没有登录 Cloudflare 控制台，不声称已经核查控制台中的全部规则。

## 下一步与发布条件

1. 先审阅本 PR 最终提交及 CI；真实订阅验收仍未完成，不能直接写成“生产全链路通过”。确认订阅共享额度恢复后，再用脱敏材料补完分析、拒绝/采纳、换风格、新 JD 保存/恢复及面试。
2. 针对简历 HTTPS server 评估并配置 Authenticated Origin Pulls（客户端证书校验），或设计能正确保留源地址的站点专用入口。AOP 需要 Cloudflare 与源站两端协同；控制台权限、功能可用性和回滚路径需在实施时确认。
3. 不对整机 TCP 443 设置 Cloudflare-only 白名单，避免阻断 REALITY；不在现有回环代理链上凭可伪造请求头做来源认证。实施后分别验收域名访问成功、源站直连拒绝和 REALITY 客户端连接。
4. 备份恢复与发布回滚演练、导出与明确定稿版本的绑定仍未处理。PDF/Word 解析和正式导出继续延期。

本次只分析入口，没有更改 Cloudflare DNS、OCI、iptables、OpenResty 或 REALITY 配置。
