/**
 * Serves local attachment files to the browser with long-lived caching.
 *
 * URLs are store-relative (/api/attachments/<store>/<relative path>) so
 * they don't leak the home directory and stay short. The URL path is
 * attacker-controllable; resolveAttachmentPath's prefix check against
 * imsg's two attachment stores is the entire trust model — everything
 * else 404s.
 */
import { homedir } from "node:os";
import { resolve, sep } from "node:path";

const ROOTS = {
  // original attachments, as stored by Messages.app
  messages: resolve(homedir(), "Library/Messages/Attachments"),
  // imsg's ffmpeg conversion cache (content-addressed names)
  converted: resolve(homedir(), "Library/Caches/imsg/converted-attachments"),
} as const;
export type AttachmentStore = keyof typeof ROOTS;
export const ATTACHMENT_STORES = Object.keys(ROOTS) as [
  AttachmentStore,
  ...AttachmentStore[],
];

/** Files here are immutable: originals never change once written, and
 *  converted names embed a hash of the source's size+mtime. */
const CACHE_FOREVER = "private, max-age=31536000, immutable";

/** Map an absolute path from an imsg payload to its serving URL; null when
 *  it lives outside the stores (rare: imsg's tmp-dir conversion fallback). */
export function attachmentUrl(rawPath: string): string | null {
  const path = resolve(
    rawPath.startsWith("~/") ? resolve(homedir(), rawPath.slice(2)) : rawPath,
  );
  for (const store of ATTACHMENT_STORES) {
    const root = ROOTS[store];
    if (path.startsWith(root + sep)) {
      const relative = path
        .slice(root.length + 1)
        .split(sep)
        .map(encodeURIComponent)
        .join("/");
      return `/api/attachments/${store}/${relative}`;
    }
  }
  return null;
}

export function resolveAttachmentPath(
  store: AttachmentStore,
  relativePath: string,
): string | null {
  const root = ROOTS[store];
  const resolved = resolve(root, relativePath);
  return resolved.startsWith(root + sep) ? resolved : null;
}

/** True when the client's cached copy is still valid (→ 304). */
export function isFresh(
  headers: { ifNoneMatch?: string; ifModifiedSince?: string },
  etag: string,
  mtimeMs: number,
): boolean {
  if (headers.ifNoneMatch !== undefined) {
    return headers.ifNoneMatch
      .split(",")
      .map((tag) => tag.trim())
      .some((tag) => tag === etag || tag === `W/${etag}` || tag === "*");
  }
  if (headers.ifModifiedSince !== undefined) {
    const since = Date.parse(headers.ifModifiedSince);
    // HTTP dates have second precision; floor mtime to compare fairly
    return !Number.isNaN(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
  }
  return false;
}

/** Single-range parser: bytes=a-b | bytes=a- | bytes=-suffix. */
export function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size === 0) return null;
  const startStr = match[1] ?? "";
  const endStr = match[2] ?? "";
  if (startStr === "" && endStr === "") return null;
  if (startStr === "") {
    const suffix = Number(endStr);
    if (suffix === 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(startStr);
  if (start >= size) return null;
  const end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
  if (end < start) return null;
  return { start, end };
}

/** Serve an already-validated absolute path with conditional-request and
 *  Range support. */
export async function attachmentResponse(
  filePath: string,
  requestHeaders: Headers,
): Promise<Response> {
  const file = Bun.file(filePath);
  const stat = await file.stat().catch(() => null);
  if (!stat?.isFile()) {
    // pending iCloud downloads can materialize later — never cache a miss
    return new Response("not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const etag = `"${stat.size}-${stat.mtimeMs}"`;
  const headers: Record<string, string> = {
    etag,
    "last-modified": new Date(stat.mtimeMs).toUTCString(),
    "cache-control": CACHE_FOREVER,
    "accept-ranges": "bytes",
  };

  const conditional = {
    ifNoneMatch: requestHeaders.get("if-none-match") ?? undefined,
    ifModifiedSince: requestHeaders.get("if-modified-since") ?? undefined,
  };
  if (isFresh(conditional, etag, stat.mtimeMs)) {
    return new Response(null, { status: 304, headers });
  }

  const rangeHeader = requestHeaders.get("range");
  if (rangeHeader !== null) {
    const range = parseRange(rangeHeader, stat.size);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, "content-range": `bytes */${stat.size}` },
      });
    }
    return new Response(file.slice(range.start, range.end + 1), {
      status: 206,
      headers: {
        ...headers,
        "content-type": file.type,
        "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
      },
    });
  }

  return new Response(file, {
    headers: { ...headers, "content-type": file.type },
  });
}
