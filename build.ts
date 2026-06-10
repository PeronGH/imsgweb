import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import tailwind from "bun-plugin-tailwind";
import { SveltePlugin } from "bun-plugin-svelte";

const EMBED_STUB = "./server/rpc/imsg.embedded";

/**
 * IMSGWEB_EMBED_IMSG must be an explicit path to the REAL imsg binary —
 * for homebrew that's "$(brew --prefix imsg)/libexec/imsg"; bin/imsg is a
 * shell shim and embedding it would ship a dangling pointer. The binary's
 * directory is embedded whole (tar.gz) because imsg loads sibling
 * resources at runtime (PhoneNumberKit/SQLite bundles, bridge dylib).
 */
async function resolveImsgDirToEmbed(): Promise<string | null> {
  const env = process.env["IMSGWEB_EMBED_IMSG"]?.trim();
  if (env === undefined || env === "") return null;
  const file = Bun.file(env);
  if (!(await file.exists())) {
    throw new Error(`IMSGWEB_EMBED_IMSG points at a missing file: ${env}`);
  }
  if ((await file.slice(0, 2).text()) === "#!") {
    throw new Error(
      `IMSGWEB_EMBED_IMSG: ${env} is a script shim, not the real binary — ` +
        'use e.g. "$(brew --prefix imsg)/libexec/imsg"',
    );
  }
  return dirname(realpathSync(env));
}

const embedDir = await resolveImsgDirToEmbed();
try {
  if (embedDir !== null) {
    // swap the committed empty stub for the real payload so the
    // `with { type: "file" }` import in server/rpc/embedded.ts bundles it
    await Bun.$`tar -czf ${EMBED_STUB} -C ${embedDir} .`;
  }

  await Bun.build({
    entrypoints: ["./index.ts"],
    compile: { outfile: "./dist/imsgweb" },
    plugins: [SveltePlugin(), tailwind],
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
} finally {
  if (embedDir !== null) await Bun.write(EMBED_STUB, new Uint8Array());
}

console.log(
  embedDir === null
    ? "Built dist/imsgweb (imsg from PATH at runtime)"
    : `Built dist/imsgweb (embedded imsg from ${embedDir})`,
);
