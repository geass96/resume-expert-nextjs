import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { closeHistoryDb } from "../src/lib/history-db.ts";
import { recordAIUsage,queryAIUsage } from "../src/lib/ai-usage.ts";
import { parseSubscriptionEvents,readSubscriptionEvents } from "../src/lib/ai/chatgpt-siwc.ts";

test("AI usage records provider-reported tokens, filters, pagination and no secret content",()=>{
 const directory=mkdtempSync(join(tmpdir(),"resume-usage-test-"));
 const previous=process.env.RESUME_DATA_DIR;
 process.env.RESUME_DATA_DIR=directory;
 try {
   const initial=queryAIUsage();
   assert.equal(initial.summary.total,0);
   const example={purpose:"jd_analysis",provider:"chatgpt-siwc",model:"gpt-6-luna",
     channel:"subscription",status:"success",durationMs:1480,inputTokens:43,
     outputTokens:9,attempts:1};
   recordAIUsage(example);
   recordAIUsage({...example,purpose:"interview_answer",durationMs:3500,
     inputTokens:null,outputTokens:null,status:"failed",attempts:2,errorCode:"http_429"});
   recordAIUsage({...example,purpose:"self_introduction",provider:"openai-compatible",
     channel:"api",model:"gpt-4o-mini",durationMs:500,inputTokens:100,outputTokens:80});
   const all=queryAIUsage({days:0});
   assert.equal(all.summary.total,3);
   assert.equal(all.summary.success,2);
   assert.equal(all.summary.failed,1);
   assert.equal(all.summary.reported,2);
   assert.equal(all.summary.inputTokens,143);
   assert.equal(all.summary.outputTokens,89);
   assert.equal(all.byDay.reduce((n,d)=>n+d.calls,0),3);
   assert.equal(all.byPurpose.reduce((n,d)=>n+d.calls,0),3);
   const failed=queryAIUsage({days:0,status:"failed"});
   assert.equal(failed.summary.total,1);
   assert.equal(failed.rows[0].inputTokens,null);
   assert.equal(failed.rows[0].errorCode,"http_429");
   assert.equal(queryAIUsage({days:0,purpose:"jd_analysis"}).summary.total,1);
   assert.equal(queryAIUsage({days:0,model:"gpt-4o-mini"}).summary.total,1);
   const page=queryAIUsage({days:0,page:1,pageSize:2});
   assert.equal(page.rows.length,2);
   assert.equal(page.hasMore,true);
   assert.equal(queryAIUsage({days:0,page:2,pageSize:2}).rows.length,1);
   // UI cannot accidentally expose prompts, account cookies or OAuth/API secrets.
   const database=new DatabaseSync(join(directory,"resume-expert.sqlite"),{readOnly:true});
   try {
     const columns=(database.prepare("PRAGMA table_info(ai_usage_calls)").all()).map(x=>String(x.name));
     assert(!columns.some(x=>/secret|token_value|prompt|content|credential|api_key/i.test(x)));
     assert(!JSON.stringify(all).includes("Bearer"));
   }finally{database.close();}
 }finally{
   closeHistoryDb();
   rmSync(directory,{recursive:true,force:true});
   if(previous===undefined)delete process.env.RESUME_DATA_DIR;
   else process.env.RESUME_DATA_DIR=previous;
 }
});


test("Responses stream usage is extracted from response.completed, not guessed",()=>{
 const text=JSON.stringify({type:"response.output_text.delta",delta:'{"ok":true}'});
 const done=JSON.stringify({type:"response.completed",response:{usage:{input_tokens:35,output_tokens:9}}});
 const events=["data: "+text+"\n\n","data: "+done+"\n\n"];
 const result=parseSubscriptionEvents(events);
 assert.equal(result.text,'{"ok":true}');
 assert.equal(result.inputTokens,35);
 assert.equal(result.outputTokens,9);
 assert.equal(readSubscriptionEvents(events),result.text);
 const unreported=parseSubscriptionEvents(["data: "+text+"\n\n","data: "+JSON.stringify({type:"response.completed"})+"\n\n"]);
 assert.equal(unreported.inputTokens,null);
 assert.equal(unreported.outputTokens,null);
});
