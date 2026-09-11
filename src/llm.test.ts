import { test, describe } from "node:test";
import assert from "node:assert";

describe("llm.ts — provider selection (no network calls)", () => {
  test("config reads LLM_PROVIDER and EMBEDDINGS_PROVIDER from env", async () => {
    // Test default values
    process.env.LLM_PROVIDER = "";
    process.env.NVIDIA_API_KEY = "test-nvidia-key";
    process.env.GEMINI_API_KEY = "";
    process.env.EMBEDDINGS_PROVIDER = "";
    process.env.VOYAGE_API_KEY = "";

    const { config } = await import("./config.js");
    assert.strictEqual(config.llmProvider, "nvidia");
    assert.strictEqual(config.nvidiaApiKey, "test-nvidia-key");
    assert.strictEqual(config.geminiApiKey, "");
    assert.strictEqual(config.embeddingsProvider, "xenova");
    assert.strictEqual(config.voyageApiKey, "");
  });

  test("config reads LLM_PROVIDER=gemini", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.NVIDIA_API_KEY = "test-nvidia-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.EMBEDDINGS_PROVIDER = "";
    process.env.VOYAGE_API_KEY = "";

    // ESM modules are cached across tests, so this reads the same config
    // singleton as the previous test — getters re-read process.env live.
    const { config } = await import("./config.js");
    // The test just verifies the config object reads env correctly
    assert.strictEqual(config.llmProvider, "gemini");
    assert.strictEqual(config.geminiApiKey, "test-gemini-key");
  });

  test("config reads EMBEDDINGS_PROVIDER=voyage", async () => {
    process.env.LLM_PROVIDER = "nvidia";
    process.env.NVIDIA_API_KEY = "test-nvidia-key";
    process.env.GEMINI_API_KEY = "";
    process.env.EMBEDDINGS_PROVIDER = "voyage";
    process.env.VOYAGE_API_KEY = "test-voyage-key";

    const { config } = await import("./config.js");
    assert.strictEqual(config.embeddingsProvider, "voyage");
    assert.strictEqual(config.voyageApiKey, "test-voyage-key");
  });
});