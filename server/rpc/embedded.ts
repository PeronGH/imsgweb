/**
 * Optional imsg distribution bundled into the compiled executable.
 *
 * `server/rpc/imsg.embedded` is an empty stub in the repo; build.ts
 * temporarily replaces it with a tar.gz of the imsg binary's directory
 * when IMSGWEB_EMBED_IMSG is set, so the `with { type: "file" }` import
 * embeds it. Embedded files live on the executable's virtual filesystem
 * and can't be spawned, so the archive is extracted to a temp directory
 * once per process.
 */
// node:fs sync APIs — this runs inside the rpc client's synchronous
// spawn path, and Bun has no sync write
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import embeddedFile from "./imsg.embedded" with { type: "file" };

let extracted: string | null | undefined;

/** True when this build bundles an imsg distribution. */
export function hasEmbeddedImsg(): boolean {
  try {
    return statSync(embeddedFile).size > 0;
  } catch {
    // stub unreadable (dev cwd quirks) — behave like a non-embedded build
    return false;
  }
}

/** Path to the extracted embedded imsg, or null when none was bundled. */
export function embeddedImsgPath(): string | null {
  if (extracted !== undefined) return extracted;
  extracted = null;
  if (!hasEmbeddedImsg()) return null;
  try {
    const dir = join(tmpdir(), `imsgweb-imsg-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const archive = join(dir, "dist.tar.gz");
    writeFileSync(archive, readFileSync(embeddedFile));
    const tar = Bun.spawnSync(["tar", "-xzf", archive, "-C", dir]);
    if (tar.exitCode !== 0) throw new Error("tar failed");
    const binary = join(dir, "imsg");
    chmodSync(binary, 0o755);
    extracted = binary;
  } catch (error) {
    console.error("imsgweb: embedded imsg unusable, using PATH:", error);
  }
  return extracted;
}
