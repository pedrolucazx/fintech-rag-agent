import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildIndex, retrieve, DEFAULT_INDEX_DIR } from "./rag.js";

describe("rag.ts — retrieval", () => {
  let testIndexDir: string;

  before(async () => {
    testIndexDir = mkdtempSync(path.join(tmpdir(), "rag-test-"));
    // Build a test index with fixture data
    await buildIndex(
      path.join(process.cwd(), "data", "docs"),
      testIndexDir,
    );
  });

  after(() => {
    rmSync(testIndexDir, { recursive: true, force: true });
  });

  test("retrieve returns the chunk from the expected source for a known question", async () => {
    const results = await retrieve("quais tipos de chave PIX existem?", 5, testIndexDir);
    assert.ok(results.length > 0);
    assert.equal(results[0]?.source, "regulamentacao-pix");
  });

  test("retrieve returns an empty list for a question outside the corpus", async () => {
    const results = await retrieve("por que minha internet caiu ontem?", 5, testIndexDir);
    assert.deepEqual(results, []);
  });
});