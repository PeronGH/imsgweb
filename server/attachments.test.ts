import { afterAll, expect, test } from "bun:test";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  attachmentResponse,
  attachmentUrl,
  isFresh,
  parseRange,
  resolveAttachmentPath,
} from "./attachments";

const ATTACHMENTS = join(homedir(), "Library/Messages/Attachments");
const CONVERTED = join(homedir(), "Library/Caches/imsg/converted-attachments");

test("attachmentUrl maps store paths to short URLs and round-trips", () => {
  expect(attachmentUrl(join(ATTACHMENTS, "ab/cd/photo.heic"))).toBe(
    "/api/attachments/messages/ab/cd/photo.heic",
  );
  expect(attachmentUrl(join(CONVERTED, "voice abc.m4a"))).toBe(
    "/api/attachments/converted/voice%20abc.m4a",
  );
  expect(attachmentUrl("~/Library/Messages/Attachments/ab/photo.heic")).toBe(
    "/api/attachments/messages/ab/photo.heic",
  );
  // what the URL encodes must resolve back to the same file
  expect(resolveAttachmentPath("messages", "ab/cd/photo.heic")).toBe(
    join(ATTACHMENTS, "ab/cd/photo.heic"),
  );
  expect(resolveAttachmentPath("converted", "voice abc.m4a")).toBe(
    join(CONVERTED, "voice abc.m4a"),
  );
});

test("attachmentUrl refuses paths outside the stores", () => {
  expect(attachmentUrl("/etc/passwd")).toBeNull();
  expect(attachmentUrl(ATTACHMENTS + "Evil/x")).toBeNull();
  expect(attachmentUrl(ATTACHMENTS)).toBeNull();
});

test("resolveAttachmentPath rejects traversal out of the root", () => {
  expect(resolveAttachmentPath("messages", "../../.ssh/id_ed25519")).toBeNull();
  expect(resolveAttachmentPath("messages", "..")).toBeNull();
  expect(resolveAttachmentPath("messages", "a/../../etc/passwd")).toBeNull();
  expect(resolveAttachmentPath("converted", "/etc/passwd")).toBeNull();
});

test("isFresh matches ETags and falls back to If-Modified-Since", () => {
  const etag = '"10-1700000000000"';
  expect(isFresh({ ifNoneMatch: etag }, etag, 1700000000000)).toBe(true);
  expect(isFresh({ ifNoneMatch: `"other", ${etag}` }, etag, 0)).toBe(true);
  expect(isFresh({ ifNoneMatch: '"stale"' }, etag, 0)).toBe(false);
  // If-None-Match takes precedence over a stale If-Modified-Since
  expect(
    isFresh(
      { ifNoneMatch: '"stale"', ifModifiedSince: new Date().toUTCString() },
      etag,
      0,
    ),
  ).toBe(false);
  const mtime = Date.parse("2026-06-01T00:00:00Z");
  expect(
    isFresh({ ifModifiedSince: new Date(mtime).toUTCString() }, etag, mtime),
  ).toBe(true);
  expect(
    isFresh(
      { ifModifiedSince: new Date(mtime - 1000).toUTCString() },
      etag,
      mtime,
    ),
  ).toBe(false);
  expect(isFresh({}, etag, mtime)).toBe(false);
});

test("parseRange handles the single-range forms and bounds", () => {
  expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
  expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  expect(parseRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
  expect(parseRange("bytes=1000-", 1000)).toBeNull();
  expect(parseRange("bytes=5-2", 1000)).toBeNull();
  expect(parseRange("bytes=-", 1000)).toBeNull();
  expect(parseRange("items=0-1", 1000)).toBeNull();
  expect(parseRange("bytes=0-", 0)).toBeNull();
});

const tempFile = join(tmpdir(), `imsgweb-test-${crypto.randomUUID()}.txt`);
afterAll(async () => {
  await Bun.file(tempFile)
    .delete()
    .catch(() => undefined);
});

test("attachmentResponse serves immutable, validator-bearing responses", async () => {
  await Bun.write(tempFile, "hello attachments");

  const ok = await attachmentResponse(tempFile, new Headers());
  expect(ok.status).toBe(200);
  expect(ok.headers.get("cache-control")).toBe(
    "private, max-age=31536000, immutable",
  );
  const etag = ok.headers.get("etag");
  expect(etag).toStartWith('"');
  expect(await ok.text()).toBe("hello attachments");

  const cached = await attachmentResponse(
    tempFile,
    new Headers({ "if-none-match": etag ?? "" }),
  );
  expect(cached.status).toBe(304);
  expect(cached.headers.get("etag")).toBe(etag);

  const partial = await attachmentResponse(
    tempFile,
    new Headers({ range: "bytes=0-4" }),
  );
  expect(partial.status).toBe(206);
  expect(partial.headers.get("content-range")).toBe("bytes 0-4/17");
  expect(await partial.text()).toBe("hello");

  const unsatisfiable = await attachmentResponse(
    tempFile,
    new Headers({ range: "bytes=999-" }),
  );
  expect(unsatisfiable.status).toBe(416);
  expect(unsatisfiable.headers.get("content-range")).toBe("bytes */17");
});

test("attachmentResponse 404s missing files without caching the miss", async () => {
  const gone = await attachmentResponse(
    join(tmpdir(), "imsgweb-test-does-not-exist"),
    new Headers(),
  );
  expect(gone.status).toBe(404);
  expect(gone.headers.get("cache-control")).toBe("no-store");
});
