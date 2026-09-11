import { config } from "./config.js";

export async function embed(text: string): Promise<number[]> {
  const provider = config.embeddingsProvider;

  if (provider === "voyage") {
    if (!config.voyageApiKey) {
      throw new Error("VOYAGE_API_KEY is required when EMBEDDINGS_PROVIDER=voyage (see .env.example)");
    }
    return embedVoyage(text);
  }

  return embedXenova(text);
}

// Cache the in-flight Promise, not the resolved value — caching the value
// leaves a window between the "not loaded yet" check and the await where two
// concurrent embed() calls both start loading the model.
let extractorPromise: ReturnType<typeof loadExtractor> | undefined;
async function loadExtractor() {
  const { pipeline } = await import("@xenova/transformers");
  return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
}

async function embedXenova(text: string): Promise<number[]> {
  if (!extractorPromise) extractorPromise = loadExtractor();
  const embedder = await extractorPromise;
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data) as number[];
}

async function embedVoyage(text: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.voyageApiKey}`,
    },
    body: JSON.stringify({
      model: "voyage-3",
      input: [text],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} ${error}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}