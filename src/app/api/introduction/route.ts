import { NextResponse } from "next/server";
import { protectedRequest,checkPayload,limitAttempt } from "@/lib/auth";
import { getVersion,introductionFor,saveIntroduction } from "@/lib/history-db";
import { getAIConfig } from "@/lib/ai/config";
import { chatCompletionJSON } from "@/lib/ai/client";
export const runtime="nodejs";
export async function GET(request:Request) {
 const denied=await protectedRequest(request);if(denied)return denied;
 const url=new URL(request.url),id=url.searchParams.get("versionId")||"",duration=Number(url.searchParams.get("duration")||1);
 if(!getVersion(id))return NextResponse.json({error:"版本不存在"},{status:404});
 return NextResponse.json({introduction:introductionFor(id,duration)||null});
}
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 const oversized=checkPayload(request,12000);if(oversized)return oversized;
 if(!limitAttempt("intro:"+(request.headers.get("x-forwarded-for")||"owner"),5))return NextResponse.json({error:"请求过于频繁"},{status:429});
 try {
  const body=await request.json(),version=getVersion(String(body.versionId||"")),duration=Number(body.duration);
  if(!version||![1,3].includes(duration))return NextResponse.json({error:"版本或时长无效"},{status:400});
  if(body.content!==undefined) {
   if(typeof body.content!=="string"||!body.content.trim()||body.content.length>5000)return NextResponse.json({error:"正文无效"},{status:400});
   saveIntroduction(version.id,duration,body.content,"manual");return NextResponse.json({content:body.content,mode:"manual"});
  }
  const resume=version.snapshot,config=getAIConfig();
  let content:string,mode:string;
  if(config.mode==="llm"){
   const output=await chatCompletionJSON<{introduction:string}>({
    system:"根据已经人工确认的简历撰写中文面试自我介绍。绝对不编造经历、数字、项目或技能。只返回 JSON 对象，属性 introduction。",
    user:"岗位："+version.role+"。公司："+version.company+"。时长："+duration+"分钟。简历："+JSON.stringify(resume).slice(0,10000),
    maxTokens:duration===1?650:1600
   });
   content=String(output.introduction||"").slice(0,5000);mode="llm";
  }else{
   content="【示例草稿，非 AI 生成，请自行核实】\n我目前应聘"+version.role+"。"+resume.summary+"\n核心技能："+resume.coreSkills.slice(0,5).join("、")+"。\n希望结合已有项目经历为团队创造价值。";
   mode="mock";
  }
  saveIntroduction(version.id,duration,content,mode);
  return NextResponse.json({content,mode});
 }catch{return NextResponse.json({error:"生成失败，请稍后重试"},{status:500});}
}
