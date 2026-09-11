import { pipeline } from "@xenova/transformers";

/**
 * Provider for text embeddings.
 * - "xenova": local embeddings using @xenova/transformers (default).
 * - "voyage": remote embeddings via Voyage AI API.
 */
const DEFAULT_PROVIDER = "xenova";

// Model name used for the Xenova provider.
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;
let extractor: Extractor | undefined;

/**
 * Lazily creates (or reuses) the Xenova feature‑extraction pipeline.
 */
async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractor;
}

/**
 * Voyage AI response shape (partial).
 */
interface VoyageResponse {
  data?: { embedding: number[] }[];
  embedding?: number[];
  [key: string]: any;
}

/**
 * Embed a piece of text using the selected provider.
 *
 * The provider is chosen via the `EMBEDDINGS_PROVIDER` environment variable:
 *   - "xenova" (default) – runs locally with @xenova/transformers.
 *   - "voyage" – calls the Voyage AI embeddings endpoint.
 */
export async function embed(text: string): Promise<number[]> {
  const provider = (process.env.EMBEDDINGS_PROVIDER ?? DEFAULT_PROVIDER).toLowerCase();

  if (provider === "voyage") {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required env var: VOYAGE_API_KEY (see .env.example)");
    }

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Voyage AI embeddings request failed: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as VoyageResponse;
    if (Array.isArray(data?.data?.[0]?.embedding)) {
      return data.data[0].embedding;
    }
    if (Array.isArray(data?.embedding)) {
      return data.embedding;
    }
    throw new Error("Unexpected Voyage AI response format for embeddings");
  }

  const model = await getExtractor();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
