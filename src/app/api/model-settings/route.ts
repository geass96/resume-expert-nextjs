import { NextResponse } from "next/server";
import { protectedRequest, limitAttempt, readLimitedJson } from "@/lib/auth";
import { credentialsForModel,deleteModelSettings,listModelSettings,saveModelSettings,setActiveModel } from "@/lib/model-settings";
import { safelyRecordAIUsage } from "@/lib/ai-usage";
import { listQoderModels, qoderCompletionJSON } from "@/lib/ai/qoder";

export const runtime="nodejs";
export async function GET(request:Request){
  const denied=await protectedRequest(request);if(denied)return denied;
  return NextResponse.json(listModelSettings(),{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  const denied=await protectedRequest(request,true);if(denied)return denied;
  if(!limitAttempt("model-config",25))return NextResponse.json({error:"操作过于频繁"},{status:429});
  const parsed = await readLimitedJson<Record<string, unknown>>(request, 6000, "请求过大", "请求格式错误");
  if (!parsed.ok) return parsed.response;
  try{
    const action=parsed.data;
    if(!action||typeof action!=="object")throw Error("参数无效");
    if(action.action==="save"){
      if(typeof action.provider!=="string"||typeof action.model!=="string"||
         (action.id!==undefined&&typeof action.id!=="string")||
         (action.apiKey!==undefined&&typeof action.apiKey!=="string"))
        throw Error("参数格式无效");
      const id=saveModelSettings({
        provider: action.provider,
        model: action.model,
        ...(typeof action.id === "string" ? { id: action.id } : {}),
        ...(typeof action.apiKey === "string" ? { apiKey: action.apiKey } : {}),
      });
      return NextResponse.json({ok:true,id});
    }
    if(action.action==="activate"){
      if(typeof action.id!=="string"||action.id.length>100)throw Error("无效配置 ID");
      setActiveModel(action.id);
      return NextResponse.json({ok:true});
    }
    if(action.action==="mock"){
      setActiveModel(null);
      return NextResponse.json({ok:true});
    }
    if(action.action==="models"){
      if(typeof action.id!=="string"||action.id.length>100)throw Error("无效配置 ID");
      const config=credentialsForModel(action.id);
      if(config.provider!=="qoder")throw Error("此模型供应商不支持目录读取");
      return NextResponse.json({ok:true,models:await listQoderModels(config)},{headers:{"Cache-Control":"no-store"}});
    }
    if(action.action==="test"){
      if(typeof action.id!=="string"||action.id.length>100)throw Error("无效配置 ID");
      const config=credentialsForModel(action.id);
      const started=Date.now();
      let ok=false,inputTokens:number|null=null,outputTokens:number|null=null,errorCode:string|null="request_failed";
      try{
        if(config.provider==="qoder"){
          const result=await qoderCompletionJSON<{ok?:unknown}>(config,{
            system:'You are a connectivity probe. Return exactly {"ok":true}.',user:'Return {"ok":true}.',maxTokens:40,
            onAttempt:()=>{},onUsage:(input,output)=>{inputTokens=input;outputTokens=output;},
          });
          if(result?.ok!==true)throw Error("Qoder 模型连接测试返回格式无效");
          ok=true;errorCode=null;
          return NextResponse.json({ok:true,message:"Qoder 真实模型连接测试成功"});
        }
        // Connectivity checks use only fixed provider URLs and never store credentials.
        const response=await fetch(config.baseUrl+"/chat/completions",{
          method:"POST",signal:AbortSignal.timeout(18000),
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.apiKey},
          body:JSON.stringify({model:config.model,max_tokens:40,
            messages:[{role:"system",content:"You are a connectivity probe."},{role:"user",content:"Reply with OK."}]}),
        });
        if(!response.ok){
          errorCode="http_"+response.status;
          return NextResponse.json({ok:false,error:"服务返回 HTTP "+response.status},{status:422});
        }
        const parsed=await response.json() as {
          choices?:unknown[];
          usage?:{prompt_tokens?:number;completion_tokens?:number};
        };
        const input=parsed.usage?.prompt_tokens,output=parsed.usage?.completion_tokens;
        inputTokens=typeof input==="number"&&Number.isSafeInteger(input)&&input>=0?input:null;
        outputTokens=typeof output==="number"&&Number.isSafeInteger(output)&&output>=0?output:null;
        if(!Array.isArray(parsed.choices)||!parsed.choices.length){
          errorCode="invalid_model_response";
          return NextResponse.json({ok:false,error:"服务返回格式不兼容"},{status:422});
        }
        ok=true;errorCode=null;
        return NextResponse.json({ok:true,message:"真实模型连接测试成功"});
      }finally{
        safelyRecordAIUsage({
          purpose:"model_connection_test",provider:config.provider,model:config.model,channel:"api",
          status:ok?"success":"failed",durationMs:Date.now()-started,
          inputTokens,outputTokens,attempts:1,errorCode,
        });
      }
    }
    throw Error("操作不支持");
  }catch(e){
    // Never include upstream response bodies, tokens or exception traces in responses.
    const message=e instanceof Error && (/参数|配置|密钥|模型|供应商|请求|操作/.test(e.message))
      ?e.message:"操作失败；请核对凭据和模型名称";
    return NextResponse.json({error:message},{status:400});
  }
}
export async function DELETE(request:Request){
  const denied=await protectedRequest(request,true);if(denied)return denied;
  const parsed = await readLimitedJson<{id?: unknown}>(request, 1000, "请求过长", "请求格式错误");
  if (!parsed.ok) return parsed.response;
  try{
    const {id}=parsed.data;
    if(typeof id!=="string"||id.length>100)throw Error("ID 无效");
    return deleteModelSettings(id)?NextResponse.json({ok:true}):NextResponse.json({error:"配置不存在"},{status:404});
  }catch{return NextResponse.json({error:"删除失败"},{status:400});}
}
