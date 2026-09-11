import { pipeline } from "@xenova/transformers";
import { config } from "./config.js";
import { log } from "./logger.js";

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const TIMEOUT_MS = 15_000;

type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;
let extractorPromise: Promise<Extractor> | undefined;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractorPromise;
}

async function embedVoyage(text: string): Promise<number[]> {
  if (!config.voyageApiKey) throw new Error("VOYAGE_API_KEY is required when EMBEDDINGS_PROVIDER=voyage");
  const call = () =>
    fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.voyageApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "voyage-3", input: [text] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let response;
  try {
    response = await call();
  } catch (err) {
    log.warn("voyage embeddings call failed, retrying once", { err: String(err) });
    response = await call();
  }

  if (!response.ok) {
    throw new Error(`Voyage AI embeddings request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

/** Provider selected via `EMBEDDINGS_PROVIDER` ("xenova" default, or "voyage"). */
export function currentEmbeddingsProvider(): string {
  return config.embeddingsProvider.toLowerCase();
}

/**
 * Embed a piece of text using the selected provider (`EMBEDDINGS_PROVIDER`):
 * "xenova" (default, local) or "voyage" (remote, `VOYAGE_API_KEY`).
 */
export async function embed(text: string): Promise<number[]> {
  const provider = currentEmbeddingsProvider();

  if (provider === "voyage") {
    return embedVoyage(text);
  }

  const model = await getExtractor();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
