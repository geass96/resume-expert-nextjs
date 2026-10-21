import assert from "node:assert/strict";
import { test } from "node:test";
import { rateLimitClientKey, parseLimitedJson } from "../src/lib/request-security.ts";

function streamedRequest(text, headers = {}) {
  const bytes = new TextEncoder().encode(text);
  return new Request("http://127.0.0.1/api/test", {
    method: "POST",
    headers,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    duplex: "half",
  });
}

test("rate limit identity trusts a valid Cloudflare client IP, not X-Forwarded-For", () => {
  const prior=process.env.RESUME_TRUST_CLOUDFLARE_IP;
  process.env.RESUME_TRUST_CLOUDFLARE_IP="true";
  try {
  const first = new Request("https://example.test", {
    headers: { "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.1" },
  });
  const spoofed = new Request("https://example.test", {
    headers: { "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.99, 203.0.113.10" },
  });
  const differentClient = new Request("https://example.test", {
    headers: { "cf-connecting-ip": "203.0.113.11", "x-forwarded-for": "198.51.100.1" },
  });
  assert.equal(rateLimitClientKey(first), "203.0.113.10");
  assert.equal(rateLimitClientKey(spoofed), rateLimitClientKey(first));
  assert.notEqual(rateLimitClientKey(differentClient), rateLimitClientKey(first));
  } finally {
    if(prior===undefined)delete process.env.RESUME_TRUST_CLOUDFLARE_IP;
    else process.env.RESUME_TRUST_CLOUDFLARE_IP=prior;
  }
});

test("direct-origin headers cannot vary the default single-owner rate-limit bucket", () => {
  const prior=process.env.RESUME_TRUST_CLOUDFLARE_IP;
  delete process.env.RESUME_TRUST_CLOUDFLARE_IP;
  try {
    const first=new Request("https://example.test",{headers:{"cf-connecting-ip":"203.0.113.10"}});
    const spoofed=new Request("https://example.test",{headers:{"cf-connecting-ip":"203.0.113.11","x-forwarded-for":"198.51.100.2"}});
    assert.equal(rateLimitClientKey(first),"unknown");
    assert.equal(rateLimitClientKey(spoofed),rateLimitClientKey(first));
  } finally {
    if(prior===undefined)delete process.env.RESUME_TRUST_CLOUDFLARE_IP;
    else process.env.RESUME_TRUST_CLOUDFLARE_IP=prior;
  }
});

test("invalid or missing Cloudflare client IP does not fall back to spoofable X-Forwarded-For", () => {
  const request = new Request("https://example.test", {
    headers: { "cf-connecting-ip": "attacker-controlled", "x-forwarded-for": "203.0.113.99" },
  });
  assert.equal(rateLimitClientKey(request), "unknown");
});

test("request body limits reject oversized Content-Length before parsing", async () => {
  const request = new Request("http://127.0.0.1/api/test", {
    method: "POST",
    headers: { "content-length": "999", "content-type": "application/json" },
    body: "{}",
  });
  const result = await parseLimitedJson(request, 10, "too large", "invalid");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("request body limits enforce actual streamed bytes when Content-Length is absent", async () => {
  const result = await parseLimitedJson(streamedRequest(JSON.stringify({ value: "x".repeat(100) })), 16, "too large", "invalid");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("request body limits count UTF-8 bytes and reject malformed JSON", async () => {
  const oversized = await parseLimitedJson(streamedRequest("你你"), 5, "too large", "invalid");
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.status, 413);

  const malformed = await parseLimitedJson(streamedRequest("{broken"), 100, "too large", "invalid");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.status, 400);
});

test("request body reader accepts valid bounded JSON", async () => {
  const result = await parseLimitedJson(streamedRequest(JSON.stringify({ ok: true })), 100, "too large", "invalid");
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, { ok: true });
});

test("JSON API bodies must be objects and invalid responses never contain private input",async()=>{
  for(const value of ["null","[]",'"FAKE_PII"',"123","FAKE_PII_NOT_JSON"]){
    const result=await parseLimitedJson(streamedRequest(value),100,"too large","invalid");
    assert.deepEqual(result,{ok:false,status:400,message:"invalid"});
    assert(!JSON.stringify(result).includes("FAKE_PII"));
  }
});
