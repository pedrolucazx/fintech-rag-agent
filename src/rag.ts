import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { LocalIndex } from "vectra";
import {
  embed,
  embedBatch,
  currentEmbeddingsProvider,
} from "./providers/embeddings.js";
import { log } from "./logger.js";

export type RetrievedChunk = {
  text: string;
  source: string;
  score: number;
};

type ChunkMetadata = {
  source: string;
  path: string;
  text: string;
};

export const MIN_SCORE = 0.5;
export const DEFAULT_INDEX_DIR = path.join(process.cwd(), "data", "index");
export const DEFAULT_DOCS_DIR = path.join(process.cwd(), "data", "docs");

function providerFile(indexDir: string): string {
  return path.join(path.dirname(indexDir), "index-provider.json");
}

export function recordIndexProvider(
  indexDir: string = DEFAULT_INDEX_DIR,
): void {
  writeFileSync(
    providerFile(indexDir),
    JSON.stringify({ provider: currentEmbeddingsProvider() }),
  );
}

function readRecordedProvider(indexDir: string): string | undefined {
  try {
    return (
      JSON.parse(readFileSync(providerFile(indexDir), "utf-8")) as {
        provider: string;
      }
    ).provider;
  } catch {
    return undefined;
  }
}

function assertProviderMatchesIndex(indexDir: string): void {
  const recorded = readRecordedProvider(indexDir);
  if (!recorded) return;
  const current = currentEmbeddingsProvider();
  if (recorded !== current) {
    throw new Error(
      `Index at ${indexDir} was built with EMBEDDINGS_PROVIDER=${recorded}, but the query is running with ${current}. 
      Re-run "npm run ingest" with the same provider, or unset EMBEDDINGS_PROVIDER to match the index.`,
    );
  }
}

function splitIntoChunks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let hasContent = false;
  let inFence = false;

  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const isHeading = !inFence && /^#{1,6}\s/.test(line);

    if (isHeading && hasContent) {
      chunks.push(current.join("\n").trim());
      current = [];
      hasContent = false;
    }
    if (!isHeading && line.trim() !== "") hasContent = true;
    current.push(line);
  }
  if (current.length > 0) chunks.push(current.join("\n").trim());

  return chunks.filter((chunk) => chunk.length > 0);
}

type ChunkToIndex = { source: string; path: string; text: string };

function collectChunks(docsDir: string = DEFAULT_DOCS_DIR): ChunkToIndex[] {
  const chunks: ChunkToIndex[] = [];

  for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourceDir = path.join(docsDir, entry.name);

    for (const file of readdirSync(sourceDir).filter((f) =>
      f.endsWith(".md"),
    )) {
      const filePath = path.join(sourceDir, file);
      const text = readFileSync(filePath, "utf-8");
      for (const chunkText of splitIntoChunks(text)) {
        chunks.push({ source: entry.name, path: filePath, text: chunkText });
      }
    }
  }

  return chunks;
}

export async function buildIndex(
  docsDir: string = DEFAULT_DOCS_DIR,
  indexDir: string = DEFAULT_INDEX_DIR,
): Promise<{ chunks: number; sources: number }> {
  const chunks = collectChunks(docsDir);
  if (chunks.length === 0) {
    log.warn("no documents found under data/docs, nothing to ingest");
    return { chunks: 0, sources: 0 };
  }

  const embeddings = await embedBatch(chunks.map((c) => c.text));
  const items = chunks.map((chunk, i) => ({
    vector: embeddings[i],
    metadata: chunk,
  }));

  const index = new LocalIndex(indexDir);
  if (await index.isIndexCreated()) {
    await index.deleteIndex();
  }
  await index.createIndex();
  await index.batchInsertItems(items);
  recordIndexProvider(indexDir);

  log.info("ingest complete", {
    chunks: chunks.length,
    sources: new Set(chunks.map((c) => c.source)).size,
  });
  return {
    chunks: chunks.length,
    sources: new Set(chunks.map((c) => c.source)).size,
  };
}

export async function retrieve(
  query: string,
  topK = 5,
  indexDir: string = DEFAULT_INDEX_DIR,
): Promise<RetrievedChunk[]> {
  const index = new LocalIndex(indexDir);
  if (!(await index.isIndexCreated())) {
    return [];
  }

  assertProviderMatchesIndex(indexDir);

  const queryVector = await embed(query);
  const results = await index.queryItems<ChunkMetadata>(
    queryVector,
    query,
    topK,
  );

  return results
    .filter((r) => r.score >= MIN_SCORE)
    .map((r) => ({
      text: r.item.metadata.text,
      source: r.item.metadata.source,
      score: r.score,
    }));
}
