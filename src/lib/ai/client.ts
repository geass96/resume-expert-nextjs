import { getAIConfig } from "@/lib/ai/config";
import { safelyRecordAIUsage, type AIPurpose } from "@/lib/ai-usage";
import { subscriptionCompletionJSON } from "@/lib/ai/chatgpt-siwc";
import { LLMError } from "@/lib/ai/errors";
import { parseJSONFromMessage } from "@/lib/ai/parse-json";

export { LLMError } from "@/lib/ai/errors";

interface ChatCompletionOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  purpose?: AIPurpose;
}
type UsageObserver = {
  onAttempt: () => void;
  onUsage: (input:number|null, output:number|null) => void;
};


interface ChatMessage {
  content?: string | null;
  reasoning_content?: string | null;
}

export async function chatCompletionJSON<T>(options: ChatCompletionOptions): Promise<T> {
  const config=getAIConfig();
  const started=Date.now();
  let attempts=0,inputTokens=0,outputTokens=0,usageReported=false,unreportedAttempts=0;
  const observer:UsageObserver={
    onAttempt:()=>{attempts++;unreportedAttempts++;},
    onUsage:(input,output)=>{
      if(input!==null&&output!==null){
        inputTokens+=input;outputTokens+=output;usageReported=true;unreportedAttempts=Math.max(0,unreportedAttempts-1);
      }
    },
  };
  let ok=false,errorCode:string|null=null;
  try{
    const result=await requestChatCompletionJSON<T>(options,config,observer);
    ok=true;
    return result;
  }catch(error){
    errorCode=error instanceof LLMError && error.status
      ?"http_"+error.status
      :error instanceof LLMError?"model_response_error":"request_failed";
    if(error instanceof LLMError)throw error;
    throw new LLMError(error instanceof Error?error.message:"大模型请求异常");
  }finally{
    safelyRecordAIUsage({
      purpose:options.purpose||"other",
      model:config.model,provider:config.provider,
      channel:config.provider==="chatgpt-siwc"?"subscription":"api",
      status:ok?"success":"failed",
      durationMs:Date.now()-started,
      inputTokens:usageReported&&unreportedAttempts===0?inputTokens:null,
      outputTokens:usageReported&&unreportedAttempts===0?outputTokens:null,
      attempts,errorCode,
    });
  }
}

async function requestChatCompletionJSON<T>(
  options:ChatCompletionOptions,
  config:ReturnType<typeof getAIConfig>,
  observer:UsageObserver
): Promise<T> {
  if(config.provider==="chatgpt-siwc"){
    return subscriptionCompletionJSON<T>({...options,...observer});
  }
  if(!config.apiKey)throw new LLMError("未配置 LLM_API_KEY");

  const data=await callChatCompletions(config,options,observer);
  const choice=data.choices?.[0];
  const contents=extractMessageContents(choice?.message);

  try{
    return parseJSONFromMessage<T>(contents);
  }catch(parseError){
    const raw=contents.join("\n\n");
    if(!raw)throw new LLMError("大模型返回内容为空");
    const fixed=await callChatCompletions(config,{
      ...options,temperature:0,
      system:"你是 JSON 修复器。将输入修复为合法 JSON，只输出 JSON，不要任何解释。",
      user:`修复以下 JSON：\n${raw.slice(0,14000)}`,
    },observer);
    const fixedContents=extractMessageContents(fixed.choices?.[0]?.message);
    try{return parseJSONFromMessage<T>(fixedContents);}
    catch{
      if(choice?.finish_reason==="length")throw new LLMError("大模型输出被截断，请缩短 JD/简历内容后重试");
      throw parseError instanceof LLMError?parseError:new LLMError("大模型返回的 JSON 无法解析");
    }
  }
}

async function callChatCompletions(
  config: ReturnType<typeof getAIConfig>,
  options: ChatCompletionOptions,
  observer:UsageObserver
) {
  observer.onAttempt();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    }),
  });

  if (!response.ok) {
    throw new LLMError("大模型请求失败，状态码 " + response.status, response.status);
  }

  const result=(await response.json()) as {
    usage?:{prompt_tokens?:number;completion_tokens?:number;input_tokens?:number;output_tokens?:number};
    choices?: Array<{
      finish_reason?: string;
      message?: ChatMessage;
    }>;
  };
  const u=result.usage;
  const input=u?.prompt_tokens??u?.input_tokens??null;
  const output=u?.completion_tokens??u?.output_tokens??null;
  observer.onUsage(typeof input==="number"&&Number.isSafeInteger(input)&&input>=0?input:null,
    typeof output==="number"&&Number.isSafeInteger(output)&&output>=0?output:null);
  return result;
}

function extractMessageContents(message?: ChatMessage): string[] {
  const results: string[] = [];
  const content = message?.content?.trim();
  if (content) results.push(content);

  const reasoning = message?.reasoning_content?.trim();
  if (reasoning) {
    const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) results.push(jsonMatch[0]);
  }

  return results;
}
