import { after, test } from "node:test";
import { closeCache } from "./providers/cache.js";

import assert from "node:assert/strict";
import { runHarness } from "./harness.js";
import type { ChatMessage, ChatResult, ToolSchema } from "./providers/llm.js";
import type { RetrievedChunk } from "./rag.js";
import { abrirTicketSchema, consultarStatusFaturaSchema } from "./tools.js";

// Unit tests mock retrieval too — without this, runHarness falls back to the
// real embed()/vectra index and these stop being fast, deterministic unit tests.
after(closeCache);

const mockRetrieve = async (_query: string): Promise<RetrievedChunk[]> => [];

test("returns text directly when the LLM responds with final text", async () => {
  const mockChat = async (_messages: ChatMessage[], _tools: ToolSchema[]): Promise<ChatResult> => ({
    type: "text",
    content: "oi",
  });

  const result = await runHarness("chat-1", "oi", mockChat, mockRetrieve);
  assert.equal(result, "oi");
});

test("consults invoices and preserves the tool exchange for the next turn", async () => {
  for (const id of ["fat_202509", "fat_000000"]) {
    let calls = 0;
    const mockChat = async (messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> => {
      assert.deepEqual(tools, [consultarStatusFaturaSchema, abrirTicketSchema]);
      if (++calls === 1) {
        return { type: "tool_call", id: "call-invoice", name: "consultar_status_fatura", args: { id } };
      }
      const [assistant, tool] = messages.slice(-2);
      assert.equal(assistant.role, "assistant");
      assert.equal(assistant.toolCall?.id, "call-invoice");
      assert.equal(tool.role, "tool");
      assert.deepEqual(tool.toolCall, assistant.toolCall);
      const invoice = JSON.parse(tool.content);
      assert.deepEqual(invoice, id === "fat_202509"
        ? { id, status: "paga", valor: 99.9, vencimento: "2026-09-10" }
        : { id, status: "nao_encontrado" });
      return { type: "text", content: invoice.status };
    };
    const chatId = `invoice-${id}`;
    assert.equal(await runHarness(chatId, `Minha fatura ${id} já foi paga?`, mockChat, mockRetrieve),
      id === "fat_202509" ? "paga" : "nao_encontrado");
    assert.equal(calls, 2);
    await runHarness(chatId, "Qual era a fatura?", async (messages) => {
      assert.equal(messages.find((message) => message.role === "tool")?.toolCall?.args.id, id);
      return { type: "text", content: id };
    }, mockRetrieve);
  }
});

test("asks for a missing identifier and consults after the user supplies it", async () => {
  const chatId = "invoice-missing-id";
  assert.equal(await runHarness(chatId, "Minha fatura já caiu o pagamento?", async (messages) => {
    assert.match(messages[0].content, /Nunca invente ou assuma um id/);
    assert.match(messages[0].content, /antes de chamar a tool/);
    assert.equal(messages.some((message) => message.role === "tool"), false);
    return { type: "text", content: "Qual o identificador da fatura?" };
  }, mockRetrieve), "Qual o identificador da fatura?");
  let calls = 0;
  assert.equal(await runHarness(chatId, "fat_202509", async (messages) => {
    if (++calls === 1) {
      assert.equal(messages.at(-2)?.content, "Qual o identificador da fatura?");
      return { type: "tool_call", name: "consultar_status_fatura", args: { id: "fat_202509" } };
    }
    return { type: "text", content: JSON.parse(messages.at(-1)!.content).status };
  }, mockRetrieve), "paga");
});

test("invalid tool arguments return an error to the model without stopping the conversation", async () => {
  let calls = 0;
  const result = await runHarness("invoice-invalid-id", "Minha fatura foi paga?", async (messages) => {
    if (++calls === 1) return { type: "tool_call", name: "consultar_status_fatura", args: {} };
    assert.match(JSON.parse(messages.at(-1)!.content).error, /identificador/);
    return { type: "text", content: "Qual o identificador da fatura?" };
  }, mockRetrieve);
  assert.equal(result, "Qual o identificador da fatura?");
  assert.equal(calls, 2);
});

test("LLM adapter sends the assistant tool call and matching result over the SDK transport", async (t) => {
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
  });
  let calls = 0;
  const toolCall = {
    id: "call-sdk-invoice", type: "function",
    function: { name: "consultar_status_fatura", arguments: '{"id":"fat_202509"}' },
  };
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.deepEqual(body.tools, [
      { type: "function", function: consultarStatusFaturaSchema },
      { type: "function", function: abrirTicketSchema },
    ]);
    assert.equal(body.parallel_tool_calls, false);
    if (++calls === 1) {
      return Response.json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [toolCall] } }] });
    }
    assert.deepEqual(body.messages.at(-2), { role: "assistant", content: "", tool_calls: [toolCall] });
    assert.deepEqual(body.messages.at(-1), {
      role: "tool", tool_call_id: toolCall.id,
      content: JSON.stringify({ id: "fat_202509", status: "paga", valor: 99.9, vencimento: "2026-09-10" }),
    });
    return Response.json({ choices: [{ message: { role: "assistant", content: "Sua fatura está paga." } }] });
  });
  assert.equal(await runHarness("invoice-sdk", `Minha fatura fat_202509 já foi paga? ${crypto.randomUUID()}`, undefined, mockRetrieve), "Sua fatura está paga.");
  assert.equal(calls, 2);
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
