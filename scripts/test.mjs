import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync(".qa", { recursive: true });
await build({ entryPoints: ["tests/entry.ts"], bundle: true, packages: "external", platform: "node", format: "esm", outfile: ".qa/support.mjs" });
const result = spawnSync(process.execPath, ["--test", "tests/core.test.mjs", "tests/formats.test.mjs", "tests/ui.test.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
