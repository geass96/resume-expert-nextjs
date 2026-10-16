import { randomUUID } from "node:crypto";
import { historyDb } from "./history-db.ts";

export const AI_PURPOSES = {
  jd_analysis: "JD 解析",
  resume_diagnosis: "简历诊断与匹配",
  initial_optimization: "首次优化简历",
  interview_preparation: "面试准备内容",
  regenerate_optimization: "重新生成优化",
  experience_followup: "经历追问改写",
  self_introduction: "生成自我介绍",
  interview_answer: "模拟面试评价",
  model_connection_test: "模型连通测试",
  other: "其他模型调用",
} as const;
export type AIPurpose = keyof typeof AI_PURPOSES;
export type AIUsageStatus = "success" | "failed";
export type AIUsageRecord = {
  purpose: AIPurpose;
  provider: string;
  model: string;
  channel: "subscription" | "api";
  status: AIUsageStatus;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  attempts: number;
  errorCode?: string | null;
};
export type AIUsageFilters = {
  days?: 7 | 30 | 90 | 0;
  purpose?: AIPurpose;
  status?: AIUsageStatus;
  model?: string;
  page?: number;
  pageSize?: number;
};

function db() {
  const connection = historyDb();
  connection.exec(`CREATE TABLE IF NOT EXISTS ai_usage_calls (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    purpose TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    channel TEXT NOT NULL CHECK(channel IN ('subscription','api')),
    status TEXT NOT NULL CHECK(status IN ('success','failed')),
    duration_ms INTEGER NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    attempts INTEGER NOT NULL DEFAULT 1,
    error_code TEXT,
    CHECK(input_tokens IS NULL OR input_tokens >= 0),
    CHECK(output_tokens IS NULL OR output_tokens >= 0)
  );
  CREATE INDEX IF NOT EXISTS ai_usage_by_time ON ai_usage_calls(created_at DESC);
  CREATE INDEX IF NOT EXISTS ai_usage_by_purpose_time ON ai_usage_calls(purpose,created_at DESC);`);
  return connection;
}
function cleanText(value:string, max=120):string {
  return value.slice(0,max).replace(/[^a-zA-Z0-9._:/-]/g,"_") || "unknown";
}
function safeCount(value:number|null):number|null {
  return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;
}
export function recordAIUsage(input:AIUsageRecord) {
  const conn=db();
  conn.prepare(`INSERT INTO ai_usage_calls
   (id,created_at,purpose,provider,model,channel,status,duration_ms,input_tokens,output_tokens,attempts,error_code)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    randomUUID(),new Date().toISOString(),
    input.purpose in AI_PURPOSES?input.purpose:"other",
    cleanText(input.provider),cleanText(input.model),input.channel,
    input.status,Math.max(0,Math.min(3600000,Math.floor(input.durationMs))),
    safeCount(input.inputTokens),safeCount(input.outputTokens),
    Math.max(0,Math.min(20,Math.floor(input.attempts))),
    input.errorCode?cleanText(input.errorCode,50):null
  );
}
export function safelyRecordAIUsage(input:AIUsageRecord) {
  try { recordAIUsage(input); }
  catch {
    // Monitoring must never block or silently change an AI result.
    console.warn("[ai-usage] failed to persist metadata (no prompts or credentials logged)");
  }
}
export function queryAIUsage(filters:AIUsageFilters={}) {
  const days=[0,7,30,90].includes(filters.days??30)?(filters.days??30):30;
  const page=Math.max(1,Math.min(10000,Math.floor(filters.page||1)));
  const size=Math.max(1,Math.min(100,Math.floor(filters.pageSize||25)));
  const clauses:string[]=[];
  const args:(string|number)[]=[];
  if(days!==0) {
    clauses.push("created_at >= ?");
    args.push(new Date(Date.now()-days*86400000).toISOString());
  }
  if(filters.purpose&&filters.purpose in AI_PURPOSES){
    clauses.push("purpose = ?");args.push(filters.purpose);
  }
  if(filters.status&&["success","failed"].includes(filters.status)){
    clauses.push("status = ?");args.push(filters.status);
  }
  if(filters.model){
    clauses.push("model = ?");args.push(filters.model.slice(0,120));
  }
  const where=clauses.length?" WHERE "+clauses.join(" AND "):"";
  const database=db();
  const base=`FROM ai_usage_calls${where}`;
  type Summary={total:number;success:number;failed:number;reported:number;inputTokens:number;outputTokens:number;avgDurationMs:number|null};
  const aggregate=database.prepare(`SELECT count(*) AS total,
    coalesce(sum(CASE WHEN status='success' THEN 1 ELSE 0 END),0) AS success,
    coalesce(sum(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed,
    coalesce(sum(CASE WHEN input_tokens IS NOT NULL AND output_tokens IS NOT NULL THEN 1 ELSE 0 END),0) AS reported,
    coalesce(sum(input_tokens),0) AS inputTokens,
    coalesce(sum(output_tokens),0) AS outputTokens,
    round(avg(duration_ms)) AS avgDurationMs ${base}`).get(...args) as unknown as Summary;
  const rows=database.prepare(`SELECT id,created_at AS createdAt,purpose,provider,model,channel,status,
    duration_ms AS durationMs,input_tokens AS inputTokens,output_tokens AS outputTokens,
    attempts,error_code AS errorCode ${base}
    ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(...args,size,(page-1)*size);
  const byPurpose=database.prepare(`SELECT purpose,count(*) AS calls,
    coalesce(sum(input_tokens),0) AS inputTokens,
    coalesce(sum(output_tokens),0) AS outputTokens
    ${base} GROUP BY purpose ORDER BY calls DESC LIMIT 12`).all(...args);
  const byDay=database.prepare(`SELECT substr(created_at,1,10) AS day,count(*) AS calls,
    coalesce(sum(input_tokens),0) AS inputTokens,coalesce(sum(output_tokens),0) AS outputTokens
    ${base} GROUP BY substr(created_at,1,10) ORDER BY day DESC LIMIT 31`).all(...args);
  const models=database.prepare("SELECT model FROM ai_usage_calls GROUP BY model ORDER BY max(created_at) DESC LIMIT 50").all()
    .map(r=>String(r.model));
  return {summary:aggregate,rows,byPurpose,byDay,models,page,pageSize:size,days,
    hasMore:aggregate.total>page*size,tokenSource:"provider-reported",timezone:"UTC"};
}
