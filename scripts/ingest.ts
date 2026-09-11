import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LocalIndex } from "vectra";
import { embed } from "../src/embeddings.js";
import { DEFAULT_INDEX_DIR, recordIndexProvider } from "../src/rag.js";
import { log } from "../src/logger.js";

const DOCS_DIR = path.join(process.cwd(), "data", "docs");

function splitIntoChunks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,6}\s/.test(line) && current.length > 0) {
      chunks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) chunks.push(current.join("\n").trim());
  return chunks.filter((c) => c.length > 0);
}

type ChunkToIndex = { source: string; path: string; text: string };

function collectChunks(): ChunkToIndex[] {
  const chunks: ChunkToIndex[] = [];
  for (const entry of readdirSync(DOCS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourceDir = path.join(DOCS_DIR, entry.name);
    for (const file of readdirSync(sourceDir).filter((f) => f.endsWith(".md"))) {
      const filePath = path.join(sourceDir, file);
      const text = readFileSync(filePath, "utf-8");
      for (const chunkText of splitIntoChunks(text)) {
        chunks.push({ source: entry.name, path: filePath, text: chunkText });
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

  // Embed everything before touching the on-disk index, so a failure here
  // never leaves a previously-working index deleted with nothing to replace it.
  const items = [];
  for (const chunk of chunks) {
    items.push({ vector: await embed(chunk.text), metadata: chunk });
  }

  const index = new LocalIndex(DEFAULT_INDEX_DIR);
  if (await index.isIndexCreated()) {
    await index.deleteIndex();
  }
  await index.createIndex();
  await index.batchInsertItems(items);
  recordIndexProvider(DEFAULT_INDEX_DIR);
  log.info("ingest complete", { chunks: chunks.length, sources: new Set(chunks.map((c) => c.source)).size });
}

main().catch((err) => {
  log.error("ingest failed", { err: String(err) });
  process.exit(1);
});
