import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { getOrSet, closeCache } from "./cache.js";

describe("cache.ts — Redis cache behavior", () => {
  let callCount = 0;

  const fn = async () => {
    callCount++;
    return { value: callCount };
  };

  before(async () => {
    // Ensure Redis is reachable by doing a quick operation
    await getOrSet("cache:health", 1000, async () => ({ ok: true }));
  });

  after(async () => {
    await closeCache();
  });

  test("same key within TTL returns cached value without calling fn again", async () => {
    callCount = 0;
    const key = "cache:test:same-key";

    const result1 = await getOrSet(key, 5000, fn);
    const result2 = await getOrSet(key, 5000, fn);

    assert.strictEqual(result1.value, 1);
    assert.strictEqual(result2.value, 1);
    assert.strictEqual(callCount, 1);
  });

  test("different key calls fn again", async () => {
    callCount = 0;
    const key1 = "cache:test:diff-key-1";
    const key2 = "cache:test:diff-key-2";

    const result1 = await getOrSet(key1, 5000, fn);
    const result2 = await getOrSet(key2, 5000, fn);

    assert.strictEqual(result1.value, 1);
    assert.strictEqual(result2.value, 2);
    assert.strictEqual(callCount, 2);
  });

  test("expired key (TTL elapsed) calls fn again", async () => {
    callCount = 0;
    const key = "cache:test:expired-key";

    const result1 = await getOrSet(key, 50, fn);
    assert.strictEqual(result1.value, 1);
    assert.strictEqual(callCount, 1);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 100));

    const result2 = await getOrSet(key, 50, fn);
    assert.strictEqual(result2.value, 2);
    assert.strictEqual(callCount, 2);
  });
});