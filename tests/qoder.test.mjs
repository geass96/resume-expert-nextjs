import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { qoderCompletionJSON, listQoderModels, qoderOptions } from "../src/lib/ai/qoder.ts";

const credentials = { apiKey: "synthetic-qoder-pat", model: "account-model" };
function runtimeFor(messages = [], models = []) {
  const state = { closed: 0, calls: [] };
  return {
    state, accessToken: token => ({ type: "accessToken", accessToken: token }),
    query: params => {
      state.calls.push(params);
      return {
        async *[Symbol.asyncIterator]() { for (const message of messages) yield message; },
        getAvailableModels: async () => models,
        close: async () => { state.closed++; },
      };
    },
  };
}
function observer() {
  return { attempts: 0, usage: null, system: "Return a resume JSON object.", user: "Synthetic resume.",
    onAttempt() { this.attempts++; }, onUsage(input, output) { this.usage = [input, output]; } };
}
const result = overrides => ({ type: "result", subtype: "success", is_error: false,
  result: '{"ok":true}', usage: { input_tokens: 12, output_tokens: 5 }, ...overrides });

test("Qoder disables tools, memory, transcripts and host settings; excludes application secrets", async () => {
  process.env.QODER_TEST_SECRET = "must-not-reach-runtime";
  try {
    const sdk = runtimeFor();
    const options = qoderOptions(credentials.apiKey, credentials.model, "isolated-directory", new AbortController(), sdk);
    assert.deepEqual(options.tools, []);
    assert.deepEqual(options.settingSources, []);
    assert.deepEqual(options.mcpServers, {});
    assert.deepEqual(options.skills, []);
    assert.deepEqual(options.plugins, []);
    assert.equal(options.memory.projectScope, false);
    assert.equal(options.memory.userScope, false);
    assert.equal(options.memory.generation.enabled, false);
    assert.equal(options.memory.consumption.enabled, false);
    assert.equal(options.strictMcpConfig, true);
    assert.equal(options.persistSession, false);
    assert.equal(options.maxTurns, 1);
    assert.equal(options.env.QODER_TEST_SECRET, undefined);
    assert.equal(options.env.RESUME_SESSION_SECRET, undefined);
    assert.equal(options.env.QODER_CONFIG_DIR, "isolated-directory");
    assert.equal((await options.canUseTool()).behavior, "deny");
  } finally { delete process.env.QODER_TEST_SECRET; }
});

test("Qoder completion uses the chosen model, records usage and removes its temporary home", async () => {
  const sdk = runtimeFor([result()]);
  const input = observer();
  assert.deepEqual(await qoderCompletionJSON(credentials, input, sdk), { ok: true });
  assert.equal(input.attempts, 1);
  assert.deepEqual(input.usage, [12, 5]);
  assert.equal(sdk.state.calls[0].options.model, credentials.model);
  assert.equal(sdk.state.closed, 1);
  assert.equal(existsSync(sdk.state.calls[0].options.cwd), false);
});

test("Qoder never accepts partial, failed, truncated or malformed output", async () => {
  for (const messages of [[], [{type:"assistant",message:{content:[{type:"text",text:'{"ok":true}'}]}}],
    [result({subtype:"error_during_execution",errors:[credentials.apiKey]})],
    [result({is_error:true})], [result({stop_reason:"max_tokens"})], [result({result:"invalid"})],
    [result({result:"x".repeat(1024*1024+1)})]]) {
    const sdk = runtimeFor(messages);
    await assert.rejects(qoderCompletionJSON(credentials, observer(), sdk), error => !error.message.includes(credentials.apiKey));
    assert.equal(sdk.state.closed, 1);
    assert.equal(existsSync(sdk.state.calls[0].options.cwd), false);
  }
});

test("Qoder catalog uses control requests without submitting inference and preserves account availability", async () => {
  const sdk = runtimeFor([], [
    {value:"account-model",displayName:"Account Model",isEnabled:true},
    {value:"restricted",displayName:"Restricted",isEnabled:false},
    {value:"bad model",displayName:"Invalid",isEnabled:true},
  ]);
  assert.deepEqual(await listQoderModels(credentials, sdk), [
    {id:"account-model",name:"Account Model",enabled:true}, {id:"restricted",name:"Restricted",enabled:false},
  ]);
  const prompt = sdk.state.calls[0].prompt;
  assert.equal(typeof prompt, "object");
  assert.deepEqual(await prompt.next(), {value:undefined,done:true});
  assert.equal(sdk.state.closed, 1);
  assert.equal(existsSync(sdk.state.calls[0].options.cwd), false);
});

test("Qoder empty catalog and SDK exceptions return sanitized actionable errors", async () => {
  await assert.rejects(listQoderModels(credentials, runtimeFor()), /模型目录暂不可用/);
  const sdk = runtimeFor();
  sdk.query = () => { throw Error("upstream secret " + credentials.apiKey); };
  await assert.rejects(qoderCompletionJSON(credentials, observer(), sdk), error =>
    error.message.includes("检查 PAT") && !error.message.includes(credentials.apiKey));
});

test("Qoder missing usage remains unknown", async () => {
  const input = observer();
  await qoderCompletionJSON(credentials, input, runtimeFor([result({usage:undefined})]));
  assert.deepEqual(input.usage, [null, null]);
});

test("Qoder catalog timeout releases held input, closes runtime and removes its home", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const sdk = runtimeFor();
  let ready;
  const started = new Promise(resolve => {ready = resolve;});
  sdk.query = params => {
    sdk.state.calls.push(params);
    ready();
    return {
      getAvailableModels: () => new Promise((_, reject) => params.options.abortController.signal.addEventListener("abort", () => reject(Error("cancelled")), {once:true})),
      close: async () => {sdk.state.closed++;},
    };
  };
  const pending = listQoderModels(credentials, sdk);
  const rejected = assert.rejects(pending, /超时/);
  await started;
  t.mock.timers.tick(90000);
  await rejected;
  assert.equal(sdk.state.closed, 1);
  assert.equal(existsSync(sdk.state.calls[0].options.cwd), false);
  assert.deepEqual(await sdk.state.calls[0].prompt.next(), {value:undefined,done:true});
});
