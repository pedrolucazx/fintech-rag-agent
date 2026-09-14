import { pipeline } from "@xenova/transformers";
import { config } from "../config.js";
import { log } from "../logger.js";

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const TIMEOUT_MS = 15_000;

export interface EmbeddingsProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;

class XenovaEmbeddingsProvider implements EmbeddingsProvider {
  private extractorPromise?: Promise<Extractor>;

  private getExtractor(): Promise<Extractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
    }
    return this.extractorPromise;
  }

  async embed(text: string): Promise<number[]> {
    const model = await this.getExtractor();
    const output = await model(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

class VoyageEmbeddingsProvider implements EmbeddingsProvider {
  private async call(input: string[]): Promise<number[][]> {
    if (!config.voyageApiKey)
      throw new Error(
        "VOYAGE_API_KEY is required when EMBEDDINGS_PROVIDER=voyage",
      );
    const request = () =>
      fetch("https://ai.mongodb.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.voyageApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "voyage-finance-2", input }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    let response;
    try {
      response = await request();
    } catch (err) {
      log.warn("voyage embeddings call failed, retrying once", {
        err: String(err),
      });
      response = await request();
    }

    if (!response.ok) {
      throw new Error(
        `Voyage AI embeddings request failed: ${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.call([text]);
    return embedding;
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return this.call(texts);
  }
}

const factories: Record<string, () => EmbeddingsProvider> = {
  xenova: () => new XenovaEmbeddingsProvider(),
  voyage: () => new VoyageEmbeddingsProvider(),
};

export function currentEmbeddingsProvider(): string {
  return config.embeddingsProvider.toLowerCase();
}

const instances = new Map<string, EmbeddingsProvider>();

function getProvider(): EmbeddingsProvider {
  const name = currentEmbeddingsProvider();
  let instance = instances.get(name);
  if (!instance) {
    instance = (factories[name] ?? factories.xenova)();
    instances.set(name, instance);
  }
  return instance;
}

export function embed(text: string): Promise<number[]> {
  return getProvider().embed(text);
}

export function embedBatch(texts: string[]): Promise<number[][]> {
  return getProvider().embedBatch(texts);
}
