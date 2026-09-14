import { test } from "node:test";
import assert from "node:assert/strict";

test("rejects an unrecognized EMBEDDINGS_PROVIDER instead of silently falling back", async (t) => {
  const { embed } = await import("./embeddings.js");
  const previous = process.env.EMBEDDINGS_PROVIDER;
  t.after(() => {
    if (previous === undefined) delete process.env.EMBEDDINGS_PROVIDER;
    else process.env.EMBEDDINGS_PROVIDER = previous;
  });
  process.env.EMBEDDINGS_PROVIDER = "nvidia";
  await assert.rejects(embed("teste"), /Unknown EMBEDDINGS_PROVIDER: "nvidia"/);
});
