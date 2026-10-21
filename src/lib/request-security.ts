import { isIP } from "node:net";

export type ParsedJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; message: string };

/**
 * Single-owner limits share a bucket by default. Cloudflare's address is trusted
 * only after the operator explicitly enables it behind a verified origin guard.
 */
export function rateLimitClientKey(request: Request): string {
  if(process.env.RESUME_TRUST_CLOUDFLARE_IP!=="true")return "unknown";
  const address = request.headers.get("cf-connecting-ip")?.trim();
  return address && isIP(address) ? address.toLowerCase() : "unknown";
}

/** Read at most maximum bytes, even when Content-Length is missing or dishonest. */
export async function parseLimitedJson<T>(
  request: Request,
  maximum: number,
  tooLargeMessage = "请求内容过大",
  invalidMessage = "请求格式错误"
): Promise<ParsedJsonResult<T>> {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error("Invalid request body limit");

  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximum) {
    return { ok: false, status: 413, message: tooLargeMessage };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, message: invalidMessage };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximum) {
        try { await reader.cancel(); } catch {}
        return { ok: false, status: 413, message: tooLargeMessage };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, status: 400, message: invalidMessage };
    }

    try {
      const data:unknown=JSON.parse(text);
      if(!data||typeof data!=="object"||Array.isArray(data))
        return {ok:false,status:400,message:invalidMessage};
      return { ok: true, data: data as T };
    } catch {
      return { ok: false, status: 400, message: invalidMessage };
    }
  } catch {
    return { ok: false, status: 400, message: invalidMessage };
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}
