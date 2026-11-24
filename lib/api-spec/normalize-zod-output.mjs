import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../api-zod/src/generated/api.ts", import.meta.url);
let source = await readFile(outputPath, "utf8");
source = source
  .replaceAll("zod.int()", "zod.number().int()")
  .replaceAll("zod.url()", "zod.string().url()");
await writeFile(outputPath, source);