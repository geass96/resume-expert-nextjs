import assert from 'node:assert/strict';
import {test} from 'node:test';
import {streamJSON} from '../src/lib/ai/stream-json.ts';

test('long analysis sends a response before models finish and remains valid JSON',async()=>{
  let complete;
  const task=new Promise(resolve=>{complete=resolve;});
  const pending=streamJSON(()=>task);
  const response=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve(null),50))]);
  complete({result:{name:'fixture'}});
  assert(response,'headers must be sent while model calls are still pending');
  const reader=response.body.getReader();
  const first=await reader.read();
  assert.equal(new TextDecoder().decode(first.value).trim(),'','first chunk keeps proxy connection alive');
  let text=new TextDecoder().decode(first.value);
  while(true){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);}
  assert.deepEqual(JSON.parse(text),{result:{name:'fixture'}});
});

test('streamed failures remain an explicit error and never become a result',async()=>{
  const response=await streamJSON(async()=>{throw new Error('private provider response');});
  assert.deepEqual(await response.json(),{error:'分析失败，请稍后重试'});
});

test('cancelled consumers can settle without leaving a heartbeat or enqueueing',async()=>{
  let complete;
  const response=await streamJSON(()=>new Promise(resolve=>{complete=resolve;}));
  await response.body.cancel();
  complete({result:'fixture'});
  await new Promise(resolve=>setImmediate(resolve));
});
