import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LocalIndex } from "vectra";
import { embed, currentEmbeddingsProvider } from "./embeddings.js";

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

function providerFile(indexDir: string): string {
  return path.join(path.dirname(indexDir), "index-provider.json");
}

/** Records which embeddings provider built the index at `indexDir`, so a later query with a different provider can fail loudly instead of returning meaningless scores. */
export function recordIndexProvider(indexDir: string = DEFAULT_INDEX_DIR): void {
  writeFileSync(providerFile(indexDir), JSON.stringify({ provider: currentEmbeddingsProvider() }));
}

function assertProviderMatchesIndex(indexDir: string): void {
  let recorded: string;
  try {
    recorded = (JSON.parse(readFileSync(providerFile(indexDir), "utf-8")) as { provider: string }).provider;
  } catch {
    return; // no record (older index or first run) — nothing to compare against
  }
  const current = currentEmbeddingsProvider();
  if (recorded !== current) {
    throw new Error(
      `Index at ${indexDir} was built with EMBEDDINGS_PROVIDER=${recorded}, but the query is running with ${current}. Re-run "npm run ingest" with the same provider, or unset EMBEDDINGS_PROVIDER to match the index.`,
    );
  }
}

/**
 * Retrieve top‑K most similar chunks for a query.
 */
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
  const results = await index.queryItems<ChunkMetadata>(queryVector, query, topK);

  return results
    .filter((r) => r.score >= MIN_SCORE)
    .map((r) => ({
      text: r.item.metadata.text,
      source: r.item.metadata.source,
      score: r.score,
    }));
}
