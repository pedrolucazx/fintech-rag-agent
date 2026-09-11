import path from "node:path";
import { LocalIndex } from "vectra";
import { embed } from "./embeddings.js";

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
