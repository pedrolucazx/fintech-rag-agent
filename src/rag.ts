import path from "node:path";
import { pipeline } from "@xenova/transformers";
import { LocalIndex } from "vectra";

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

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
// ponytail: fixed threshold calibrated against the seed corpus (matches ~0.7+, unrelated ~0.35-0.4); revisit if corpus grows/diversifies
export const MIN_SCORE = 0.5;
export const DEFAULT_INDEX_DIR = path.join(process.cwd(), "data", "index");

type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;

let extractor: Extractor | undefined;
async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractor;
}

export async function embed(text: string): Promise<number[]> {
  const model = await getExtractor();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
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

  const queryVector = await embed(query);
  const results = await index.queryItems<ChunkMetadata>(queryVector, query, topK);

  return results
    .filter((r) => r.score >= MIN_SCORE)
    .map((r) => ({ text: r.item.metadata.text, source: r.item.metadata.source, score: r.score }));
}
