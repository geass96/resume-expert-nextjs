import { isIP } from "node:net";

export type ParsedJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; message: string };

/**
 * Only trust Cloudflare's single-client address header, never the caller-controlled
 * X-Forwarded-For chain. The origin must not be directly reachable around Cloudflare.
 */
export function rateLimitClientKey(request: Request): string {
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
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, status: 400, message: invalidMessage };
    }
  } catch {
    return { ok: false, status: 400, message: invalidMessage };
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}
