import { buildIndex, DEFAULT_INDEX_DIR, DEFAULT_DOCS_DIR } from "../src/rag.js";
import { log } from "../src/logger.js";

async function main(): Promise<void> {
  const result = await buildIndex(DEFAULT_DOCS_DIR, DEFAULT_INDEX_DIR);
  if (result.chunks === 0) {
    process.exit(0);
  }
}

main().catch((err) => {
  log.error("ingest failed", { err: String(err) });
  process.exit(1);
});