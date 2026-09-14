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

test("retries with backoff on 429 then succeeds", async (t) => {
  const previous = {
    EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER,
    VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.EMBEDDINGS_PROVIDER = "voyage";
  process.env.VOYAGE_API_KEY = "test-voyage-key";

  const { embed } = await import("./embeddings.js");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ detail: "rate limited" }), {
        status: 429,
      });
    }
    return Response.json({ data: [{ embedding: [0.1, 0.2] }] });
  });

  // Real 1s wait: exercises the actual BASE_BACKOFF_MS delay — cheaper and
  // more robust here than fighting fake-timer/microtask interleaving.
  assert.deepEqual(await embed("teste"), [0.1, 0.2]);
  assert.equal(calls, 2);
});

test("honors a Retry-After header instead of the default backoff", async (t) => {
  const previous = {
    EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER,
    VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.EMBEDDINGS_PROVIDER = "voyage";
  process.env.VOYAGE_API_KEY = "test-voyage-key";

  const { embed } = await import("./embeddings.js");
  let calls = 0;
  const timestamps: number[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    timestamps.push(Date.now());
    if (calls === 1) {
      return new Response(JSON.stringify({ detail: "rate limited" }), {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }
    return Response.json({ data: [{ embedding: [0.3] }] });
  });

  assert.deepEqual(await embed("teste"), [0.3]);
  assert.equal(calls, 2);
  assert.ok(timestamps[1] - timestamps[0] < 900, "should not wait the default 1s backoff");
});
