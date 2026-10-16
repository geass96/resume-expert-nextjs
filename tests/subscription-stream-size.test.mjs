import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeHistoryDb } from '../src/lib/history-db.ts';
import { saveSubscription, selectSubscription, SIWC_SCOPE } from '../src/lib/chatgpt-subscription.ts';
import { subscriptionCompletionJSON } from '../src/lib/ai/chatgpt-siwc.ts';

test('subscription accepts a small JSON result carried by SSE larger than 250 KB', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-stream-regression-'));
  const originalFetch = globalThis.fetch;
  process.env.RESUME_DATA_DIR = dir;
  process.env.RESUME_MODEL_ENCRYPTION_KEY = 'isolated-stream-regression-key-never-used-in-production';
  try {
    saveSubscription({issuer:'https://auth.openai.com',subject:'fixture',client_id:'oaiapp_fixtureclient',
      access_token:'fixture-token',refresh_token:'fixture-refresh',id_token:'fixture-id',
      scope:SIWC_SCOPE,expires_in:3600,saved_at:new Date().toISOString(),ext_agent_host_id:'fixture-host'});
    selectSubscription('gpt-6-luna');
    const event = data => 'data: '+JSON.stringify(data)+'\n\n';
    const message = JSON.stringify({value:'中'.repeat(1500)});
    const wire = [...message].map(delta=>event({type:'response.output_text.delta',delta,obfuscation:'x'.repeat(200)})).join('')
      + event({type:'response.completed',response:{usage:{input_tokens:100,output_tokens:4}}});
    assert(Buffer.byteLength(wire)>250000);
    let cancelled = false;
    globalThis.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).max_output_tokens,3000);
      return new Response(new ReadableStream({
      start(controller) {
        for(let i=0;i<wire.length;i+=4096)controller.enqueue(new TextEncoder().encode(wire.slice(i,i+4096)));
        controller.close();
      }, cancel(){cancelled=true;}
    }), {headers:{'content-type':'text/event-stream'}});
    };
    let usage;
    assert.deepEqual(await subscriptionCompletionJSON({system:'fixture',user:'fixture',maxTokens:3000,onUsage:(...values)=>{usage=values;}}),JSON.parse(message));
    assert.deepEqual(usage,[100,4]);
    assert.equal(cancelled,false);
    const oversized = new Uint8Array(8*1024*1024+1);
    globalThis.fetch=async()=>new Response(new ReadableStream({
      start(controller){controller.enqueue(oversized);},
      cancel(){cancelled=true;}
    }));
    await assert.rejects(subscriptionCompletionJSON({system:'fixture',user:'fixture'}),/安全长度/);
    assert.equal(cancelled,true,'the rejected response stream must be cancelled');
    globalThis.fetch=async()=>new Response(event({type:'response.output_text.delta',delta:'x'.repeat(140001)})
      +event({type:'response.completed'}));
    await assert.rejects(subscriptionCompletionJSON({system:'fixture',user:'fixture'}),/订阅输出过长/);
  } finally {
    globalThis.fetch=originalFetch;
    closeHistoryDb();
    delete process.env.RESUME_DATA_DIR;
    delete process.env.RESUME_MODEL_ENCRYPTION_KEY;
    rmSync(dir,{recursive:true,force:true});
  }
});
