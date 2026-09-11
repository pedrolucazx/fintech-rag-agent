import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { LocalIndex } from "vectra";
import { embed, DEFAULT_INDEX_DIR } from "../src/rag.js";
import { log } from "../src/logger.js";

const DOCS_DIR = path.join(process.cwd(), "data", "docs");

function splitIntoChunks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && current.length > 0) {
      chunks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) chunks.push(current.join("\n").trim());

  return chunks.filter((chunk) => chunk.length > 0);
}

type ChunkToIndex = { source: string; path: string; text: string };

function collectChunks(): ChunkToIndex[] {
  const chunks: ChunkToIndex[] = [];

  for (const source of readdirSync(DOCS_DIR)) {
    const sourceDir = path.join(DOCS_DIR, source);
    if (!statSync(sourceDir).isDirectory()) continue;

    for (const file of readdirSync(sourceDir).filter((f) => f.endsWith(".md"))) {
      const filePath = path.join(sourceDir, file);
      const text = readFileSync(filePath, "utf-8");
      for (const chunkText of splitIntoChunks(text)) {
        chunks.push({ source, path: filePath, text: chunkText });
      }
    }
  }

  return chunks;
}

async function main(): Promise<void> {
  const chunks = collectChunks();
  if (chunks.length === 0) {
    log.warn("no documents found under data/docs, nothing to ingest");
    return;
  }

  const index = new LocalIndex(DEFAULT_INDEX_DIR);
  if (await index.isIndexCreated()) {
    await index.deleteIndex();
  }
  await index.createIndex();

  const items = [];
  for (const chunk of chunks) {
    items.push({ vector: await embed(chunk.text), metadata: chunk });
  }
  await index.batchInsertItems(items);

  log.info("ingest complete", { chunks: chunks.length, sources: new Set(chunks.map((c) => c.source)).size });
}

main().catch((err) => {
  log.error("ingest failed", { err: String(err) });
  process.exit(1);
});
