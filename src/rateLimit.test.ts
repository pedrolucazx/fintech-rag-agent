import { test } from "node:test";
import assert from "node:assert/strict";
import { isRateLimited } from "./rateLimit.js";

test("allows messages under the limit and blocks past it", () => {
  const chatId = `rate-test-${crypto.randomUUID()}`;
  for (let i = 0; i < 10; i++) {
    assert.equal(isRateLimited(chatId), false);
  }
  assert.equal(isRateLimited(chatId), true);
});

test("tracks each chatId independently", () => {
  const chatA = `rate-test-a-${crypto.randomUUID()}`;
  const chatB = `rate-test-b-${crypto.randomUUID()}`;
  for (let i = 0; i < 10; i++) isRateLimited(chatA);
  assert.equal(isRateLimited(chatA), true);
  assert.equal(isRateLimited(chatB), false);
});
