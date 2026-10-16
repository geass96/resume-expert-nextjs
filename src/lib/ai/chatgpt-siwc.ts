import { parseJSONFromMessage } from "./parse-json.ts";
import { subscriptionAccessToken, selectedSubscription, SIWC_BASE } from "../chatgpt-subscription.ts";
import { LLMError } from "./errors.ts";

type Options={system:string;user:string;maxTokens?:number} & TokenObserver;
type TokenObserver={
 onAttempt?:()=>void;
 onUsage?:(input:number|null,output:number|null)=>void;
};

export function readSubscriptionEvents(chunks:string[]):string{
 return parseSubscriptionEvents(chunks).text;
}
export function parseSubscriptionEvents(chunks:string[]):{
 text:string; inputTokens:number|null;outputTokens:number|null;
}{

 let buffer="",text="",completed=false;
 let inputTokens:number|null=null,outputTokens:number|null=null;
 for(const chunk of chunks){
   buffer+=chunk.replace(/\r\n/g,"\n");
   let stop:number;
   while((stop=buffer.indexOf("\n\n"))>=0){
     const block=buffer.slice(0,stop);buffer=buffer.slice(stop+2);
     const data=block.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trim()).join("\n");
     if(!data||data==="[DONE]")continue;
     let event:Record<string,unknown>;
     try {event=JSON.parse(data);}catch{throw new LLMError("订阅返回的流事件格式异常");}
     if(event.type==="response.output_text.delta"&&typeof event.delta==="string"){
       text+=event.delta;
       if(text.length>140000)throw new LLMError("订阅输出过长");
     }
     if(event.type==="response.failed"||event.type==="response.incomplete"||event.type==="error")
       throw new LLMError("ChatGPT 订阅请求未成功完成："+String(event.type));
     if(event.type==="response.completed"){
       completed=true;
       const response=event.response as {usage?:{input_tokens?:number;output_tokens?:number}}|undefined;
       const input=response?.usage?.input_tokens,output=response?.usage?.output_tokens;
       inputTokens=typeof input==="number"&&Number.isSafeInteger(input)&&input>=0?input:null;
       outputTokens=typeof output==="number"&&Number.isSafeInteger(output)&&output>=0?output:null;
     }
   }
 }
 if(!completed)throw new LLMError("ChatGPT 订阅响应中断，未收到完成标志");
 if(!text.trim())throw new LLMError("ChatGPT 订阅未返回文本");
 return {text,inputTokens,outputTokens};
}
async function subscriptionResponse(options:Options, token:string){
 options.onAttempt?.();
 const res=await fetch(SIWC_BASE+"/responses",{
   method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({
     model:selectedSubscription()?.model,
     instructions:options.system,
     input:[{role:"user",content:options.user}],
     max_output_tokens:options.maxTokens ?? 8192,
     store:false,stream:true
   }),
   signal:AbortSignal.timeout(90000),cache:"no-store"
 });
 if(!res.ok){
   // Never echo provider response text: it may include private data.
   throw new LLMError("ChatGPT 订阅服务返回 HTTP "+res.status,res.status);
 }
 if(!res.body)throw new LLMError("没有返回流式响应");
 const chunks:string[]=[];
 const decoder=new TextDecoder();
 const reader=res.body.getReader();
 let total=0;
 try{
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     total+=value.byteLength;
     // SSE repeats metadata and obfuscation on deltas, so its wire size is
     // substantially larger than output text. Keep both bounds independent.
     if(total>8*1024*1024)throw new LLMError("模型响应超出安全长度");
     chunks.push(decoder.decode(value,{stream:true}));
   }
   chunks.push(decoder.decode());
 }catch(error){
   await reader.cancel().catch(()=>{});
   throw error;
 }finally{reader.releaseLock();}
 const parsed=parseSubscriptionEvents(chunks);
 options.onUsage?.(parsed.inputTokens,parsed.outputTokens);
 return parsed.text;
}
export async function subscriptionCompletionJSON<T>(options:Options):Promise<T>{
 let accessToken=await subscriptionAccessToken();
 let content:string;
 try{
   content=await subscriptionResponse(options,accessToken);
 }catch(error){
   if(!(error instanceof LLMError) || error.status!==401)throw error;
   accessToken=await subscriptionAccessToken(true);
   content=await subscriptionResponse(options,accessToken);
 }
 try{return parseJSONFromMessage<T>([content]);}
 catch{throw new LLMError("订阅模型没有返回有效 JSON，请重新尝试");}
}
