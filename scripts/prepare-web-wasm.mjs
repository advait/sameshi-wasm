import { access, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("artifacts/wasm/sameshi-engine.wasm");
const destinationPath = resolve("public/wasm/sameshi-engine.wasm");

async function main() {
  await access(sourcePath, constants.R_OK).catch(() => {
    throw new Error(
      `Missing WASM artifact at ${sourcePath}. Run \`bun run build:wasm\` first to compile the engine.`,
    );
  });

  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  console.log(`Prepared ${destinationPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
