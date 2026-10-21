import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { historyDb } from "./history-db.ts";

export const MODEL_PROVIDER_PRESETS = {
  openai:{label:"OpenAI API",baseUrl:"https://api.openai.com/v1",suggested:"gpt-4o-mini"},
  deepseek:{label:"DeepSeek API",baseUrl:"https://api.deepseek.com",suggested:"deepseek-flash"},
  openrouter:{label:"OpenRouter 模型聚合",baseUrl:"https://openrouter.ai/api/v1",suggested:"openai/gpt-4o-mini"},
  groq:{label:"Groq API",baseUrl:"https://api.groq.com/openai/v1",suggested:"llama-3.3-70b-versatile"},
  qoder:{label:"Qoder（个人 PAT）",baseUrl:"",suggested:"auto"},
} as const;
export type ModelProviderId=keyof typeof MODEL_PROVIDER_PRESETS;
type StoredModel={id:string;provider:string;model:string;encrypted_key:string;created_at:string;updated_at:string};
function db(){
  const d=historyDb();
  d.exec(`CREATE TABLE IF NOT EXISTS model_profiles(
    id TEXT PRIMARY KEY,provider TEXT NOT NULL,model TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS model_selection (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1), selected_id TEXT, mode TEXT NOT NULL
  );`);
  return d;
}
function secretKey(){
  const root=process.env.RESUME_MODEL_ENCRYPTION_KEY||process.env.RESUME_SESSION_SECRET;
  if(!root || root.length<32) throw Error("服务器未配置模型凭据加密密钥");
  return createHash("sha256").update("resume-model-v1:"+root).digest();
}
function seal(value:string){
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",secretKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64"),cipher.getAuthTag().toString("base64"),encrypted.toString("base64")].join(".");
}
function unseal(v:string){
  const [a,b,c]=v.split(".");
  if(!a||!b||!c)throw Error("密钥数据格式无效");
  const d=createDecipheriv("aes-256-gcm",secretKey(),Buffer.from(a,"base64"));
  d.setAuthTag(Buffer.from(b,"base64"));
  return Buffer.concat([d.update(Buffer.from(c,"base64")),d.final()]).toString("utf8");
}
export function listModelSettings(){
  const d=db();
  const selected=d.prepare("SELECT selected_id,mode FROM model_selection WHERE singleton=1").get() as {selected_id?:string;mode:string}|undefined;
  const profiles=(d.prepare("SELECT id,provider,model,created_at AS createdAt,updated_at AS updatedAt FROM model_profiles ORDER BY updated_at DESC").all() as Array<{id:string;provider:string;model:string;createdAt:string;updatedAt:string}>)
    .map(p=>({...p,active:selected?.mode==="llm"&&selected.selected_id===p.id,hasKey:true}));
  return {profiles,selectedId:selected?.selected_id||null,mode:selected?.mode||"environment",providers:MODEL_PROVIDER_PRESETS};
}
export function saveModelSettings(input:{id?:string;provider:string;model:string;apiKey?:string}){
  const d=db();
  if(!Object.hasOwn(MODEL_PROVIDER_PRESETS,input.provider))throw Error("不支持该模型供应商");
  const model=input.model?.trim();
  if(!model||model.length>120||!/^[\w.\-:/]+$/.test(model))throw Error("模型 ID 无效");
  const previous=input.id?d.prepare("SELECT * FROM model_profiles WHERE id=?").get(input.id) as StoredModel|undefined:undefined;
  if(input.id&&!previous)throw Error("该模型配置不存在");
  if(previous&&previous.provider!==input.provider&&!input.apiKey?.trim())throw Error("更换供应商必须重新填写模型凭据");
  const key=input.apiKey?.trim();
  if(key&&(key.length>2000||key.length<8))throw Error("API Key 长度无效");
  if(!previous&&!key)throw Error("首次保存必须填写 API Key");
  const id=previous?.id||randomUUID(),now=new Date().toISOString();
  const ciphertext=key?seal(key):previous!.encrypted_key;
  d.prepare("INSERT INTO model_profiles(id,provider,model,encrypted_key,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at")
    .run(id,input.provider,model,ciphertext,previous?.created_at||now,now);
  return id;
}
export function setActiveModel(id:string|null){
  const d=db();
  if(id&&!d.prepare("SELECT 1 FROM model_profiles WHERE id=?").get(id))throw Error("指定的模型配置不存在");
  d.prepare("INSERT INTO model_selection(singleton,selected_id,mode) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET selected_id=excluded.selected_id,mode=excluded.mode")
    .run(id,id?"llm":"mock");
}
export function deleteModelSettings(id:string){
  const d=db();
  d.exec("BEGIN IMMEDIATE");
  try{
    const result=d.prepare("DELETE FROM model_profiles WHERE id=?").run(id);
    d.prepare("UPDATE model_selection SET selected_id=NULL,mode='mock' WHERE selected_id=?").run(id);
    d.exec("COMMIT");
    return result.changes===1;
  }catch(e){d.exec("ROLLBACK");throw e;}
}
export function activeModelCredentials(){
  const d=db();
  const selection=d.prepare("SELECT selected_id,mode FROM model_selection WHERE singleton=1").get() as {selected_id?:string;mode:string}|undefined;
  if(!selection)return null;
  if(selection.mode==="mock")return {mode:"mock" as const};
  if(selection.mode!=="llm"||!selection.selected_id)return null;
  const row=d.prepare("SELECT * FROM model_profiles WHERE id=?").get(selection.selected_id) as StoredModel|undefined;
  if(!row)return {mode:"mock" as const};
  const preset=MODEL_PROVIDER_PRESETS[row.provider as ModelProviderId];
  if(!preset)throw Error("未知模型服务");
  return {mode:"llm" as const,apiKey:unseal(row.encrypted_key),baseUrl:preset.baseUrl,model:row.model,provider:row.provider};
}
export function credentialsForModel(id:string){
  const row=db().prepare("SELECT * FROM model_profiles WHERE id=?").get(id) as StoredModel|undefined;
  if(!row)throw Error("模型配置不存在");
  const preset=MODEL_PROVIDER_PRESETS[row.provider as ModelProviderId];
  if(!preset)throw Error("不支持该供应商");
  return {apiKey:unseal(row.encrypted_key),baseUrl:preset.baseUrl,model:row.model,provider:row.provider};
}
