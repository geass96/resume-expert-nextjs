import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options, Query, SDKUserMessage } from "@qoder-ai/qoder-agent-sdk";
import { LLMError } from "./errors.ts";
import { parseJSONFromMessage } from "./parse-json.ts";

type Runtime = Pick<typeof import("@qoder-ai/qoder-agent-sdk"), "query" | "accessToken">;
type Credentials = { apiKey: string; model: string };
export type QoderModel = { id: string; name: string; enabled: boolean };
type CompletionOptions = {
  system: string; user: string; maxTokens?: number;
  onAttempt: () => void;
  onUsage: (input: number | null, output: number | null) => void;
};

// A separate, disposable home avoids loading host credentials, memory or project context.
export function qoderOptions(token: string, model: string, directory: string, controller: AbortController,
  runtime: Pick<Runtime, "accessToken">): Options {
  const env: Record<string, string | undefined> = Object.fromEntries(Object.keys(process.env).map(key => [key, undefined]));
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "LANG", "LC_ALL", "TZ", "TMPDIR", "TEMP", "TMP"])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { HOME: directory, USERPROFILE: directory, APPDATA: directory,
    LOCALAPPDATA: directory, QODER_CONFIG_DIR: directory });
  return {
    auth: runtime.accessToken(token), model, cwd: directory, env, abortController: controller,
    tools: [], allowedTools: [], skills: [], plugins: [], extensions: [],
    mcpServers: {}, allowedMcpServerNames: [], strictMcpConfig: true,
    settingSources: [], persistSession: false,
    memory: { mode: "custom", projectScope: false, userScope: false,
      generation: { enabled: false }, consumption: { enabled: false } },
    maxTurns: 1, permissionMode: "default", promptSuggestions: false,
    canUseTool: async () => ({ behavior: "deny", message: "Tools are disabled for resume inference." }),
    stderr: () => {}, debug: false, controlRequestTimeoutMs: 20000, closeGraceMs: 500,
  };
}

async function withQoder<T>(credentials: Credentials, operation: (runtime: Runtime, options: Options, track: (q: Query) => Query) => Promise<T>,
  runtime?: Runtime): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "resume-qoder-"));
  const controller = new AbortController();
  let session: Query | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sdk = runtime ?? await import("@qoder-ai/qoder-agent-sdk");
    return await Promise.race([
      operation(sdk, qoderOptions(credentials.apiKey, credentials.model, directory, controller, sdk), q => { session = q; return q; }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new LLMError("Qoder 请求超时，请稍后重试")); }, 90000);
      }),
    ]);
  } catch (error) {
    if (error instanceof LLMError) throw error;
    // SDK exceptions and runtime diagnostics may contain prompts or credentials.
    throw new LLMError("Qoder 请求失败，请检查 PAT、模型权限及服务器网络");
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    try { await session?.close(); } catch { /* Never expose SDK cleanup diagnostics. */ }
    await rm(directory, { recursive: true, force: true });
  }
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function qoderCompletionJSON<T>(credentials: Credentials, input: CompletionOptions, runtime?: Runtime): Promise<T> {
  return withQoder(credentials, async (sdk, options, track) => {
    input.onAttempt();
    const q = track(sdk.query({
      prompt: "Return only a JSON object for the following resume task.\n" + input.user,
      options: { ...options, systemPrompt: input.system + "\n只输出 JSON；不要使用工具。"
        + (input.maxTokens ? `\n请将输出控制在约 ${input.maxTokens} tokens 以内。` : "") },
    }));
    for await (const message of q) {
      if (message.type !== "result") continue;
      input.onUsage(tokenCount(message.usage?.input_tokens), tokenCount(message.usage?.output_tokens));
      if (message.subtype !== "success" || message.is_error)
        throw new LLMError("Qoder 未完成推理，请检查 PAT 或模型权限后重试");
      if (message.stop_reason === "max_tokens" || message.stop_reason === "length")
        throw new LLMError("Qoder 输出被截断，请缩短简历内容后重试");
      if (typeof message.result !== "string" || Buffer.byteLength(message.result, "utf8") > 1024 * 1024)
        throw new LLMError("Qoder 返回内容过大或格式无效");
      return parseJSONFromMessage<T>([message.result]);
    }
    throw new LLMError("Qoder 返回不完整，未收到推理完成结果");
  }, runtime);
}

export async function listQoderModels(credentials: Credentials, runtime?: Runtime): Promise<QoderModel[]> {
  return withQoder(credentials, async (sdk, options, track) => {
    // Keep input open for control requests; no user message or inference is sent.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const signal = options.abortController?.signal;
    signal?.addEventListener("abort", release, { once: true });
    async function* emptyInput(): AsyncGenerator<SDKUserMessage> { await held; }
    let q: Query | undefined;
    try {
      q = track(sdk.query({ prompt: emptyInput(), options }));
      const models = await q.getAvailableModels();
      const result = models.filter(model => typeof model.value === "string"
        && model.value.length <= 120 && /^[\w.\-:/]+$/.test(model.value))
        .slice(0, 300).map(model => ({ id: model.value, name: model.displayName || model.value, enabled: model.isEnabled === true }));
      if (!result.length) throw new LLMError("Qoder 模型目录暂不可用，请检查 PAT 后重试，或手动填写模型 ID");
      return result;
    } finally { signal?.removeEventListener("abort", release); release(); }
  }, runtime);
}
