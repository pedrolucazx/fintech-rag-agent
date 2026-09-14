import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildIndex, retrieve, DEFAULT_INDEX_DIR } from "./rag.js";

describe("rag.ts — retrieval", () => {
  let testIndexDir: string;
  let previousProvider: string | undefined;

  before(async () => {
    // Force a deterministic, free, local embeddings provider regardless of
    // whatever EMBEDDINGS_PROVIDER a developer has set in their real .env —
    // otherwise this test silently depends on ambient environment state
    // (and, if set to "voyage", makes real rate-limited network calls).
    previousProvider = process.env.EMBEDDINGS_PROVIDER;
    process.env.EMBEDDINGS_PROVIDER = "xenova";

    testIndexDir = mkdtempSync(path.join(tmpdir(), "rag-test-"));
    // Build a test index with fixture data
    await buildIndex(path.join(process.cwd(), "data", "docs"), testIndexDir);
  });

  after(() => {
    rmSync(testIndexDir, { recursive: true, force: true });
    if (previousProvider === undefined) delete process.env.EMBEDDINGS_PROVIDER;
    else process.env.EMBEDDINGS_PROVIDER = previousProvider;
  });

  test("retrieve returns the chunk from the expected source for a known question", async () => {
    const results = await retrieve(
      "quais tipos de chave PIX existem?",
      5,
      testIndexDir,
    );
    assert.ok(results.length > 0);
    assert.equal(results[0]?.source, "regulamentacao-pix");
  });

  test("retrieve returns an empty list for a question outside the corpus", async () => {
    const results = await retrieve(
      "por que minha internet caiu ontem?",
      5,
      testIndexDir,
    );
    assert.deepEqual(results, []);
  });
});
