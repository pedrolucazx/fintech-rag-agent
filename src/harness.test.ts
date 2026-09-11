import { test } from "node:test";
import assert from "node:assert/strict";
import { runHarness } from "./harness.js";
import type { ChatMessage, ChatResult, ToolSchema } from "./llm.js";
import type { RetrievedChunk } from "./rag.js";

// Unit tests mock retrieval too — without this, runHarness falls back to the
// real embed()/vectra index and these stop being fast, deterministic unit tests.
const mockRetrieve = async (_query: string): Promise<RetrievedChunk[]> => [];

test("returns text directly when the LLM responds with final text", async () => {
  const mockChat = async (_messages: ChatMessage[], _tools: ToolSchema[]): Promise<ChatResult> => ({
    type: "text",
    content: "oi",
  });

  const result = await runHarness("chat-1", "oi", mockChat, mockRetrieve);
  assert.equal(result, "oi");
});

test("executes a tool call then makes a second call before returning text", async () => {
  let calls = 0;
  const mockChat = async (): Promise<ChatResult> => {
    calls++;
    if (calls === 1) {
      return { type: "tool_call", name: "noop", args: {} };
    }
    return { type: "text", content: "done" };
  };

  const result = await runHarness("chat-2", "faz algo", mockChat, mockRetrieve);
  assert.equal(result, "done");
  assert.equal(calls, 2);
});
