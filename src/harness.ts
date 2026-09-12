import { randomUUID } from "node:crypto";
import { chat, type ChatMessage, type ChatResult, type ToolSchema } from "./providers/llm.js";
import { history } from "./history.js";
import { log } from "./logger.js";
import {
  abrirTicket,
  abrirTicketSchema,
  consultarStatusFatura,
  consultarStatusFaturaSchema,
} from "./tools.js";
import { retrieve, type RetrievedChunk } from "./rag.js";

const systemPrompt: ChatMessage = {
  role: "system",
  content:
    "Você é o assistente de atendimento financeiro da ConectaNet, uma operadora de internet. " +
    "Responda em português, de forma direta, curta e confiante — como quem sabe exatamente o que " +
    "está dizendo. Não peça desculpas, não hedge, não repita a mesma ressalva mais de uma vez, não " +
    "diga 'não tenho certeza' nem sugira 'consulte outra fonte' — se a resposta está no contexto, " +
    "afirme. " +
    "Baseie sua resposta apenas no contexto fornecido em mensagens 'system' marcadas como Contexto. " +
    "Se o contexto vier vazio ou não cobrir a pergunta, diga uma única vez, em uma frase curta, que " +
    "não tem essa informação — sem rodeio, sem se desculpar, sem inventar. " +
    "Para consultar status de fatura/pagamento, use consultar_status_fatura e responda com base no resultado. " +
    "Se não houver identificador da fatura na conversa, pergunte ao cliente o identificador " +
    "(ou mês de referência) antes de chamar a tool. Nunca invente ou assuma um id; " +
    "se o mês não resolver o identificador, peça o id. Reutilize o id informado no histórico. " +
    "Se o resultado for nao_encontrado, informe que a fatura não foi encontrada e peça para conferir o id. " +
    "Para abrir um chamado, use abrir_ticket somente quando tiver um assunto curto e uma descrição clara " +
    "do problema relatado pelo cliente, incluindo dados relevantes já mencionados. Se o cliente apenas pedir " +
    "um chamado sem explicar o problema, pergunte o que aconteceu antes de chamar a tool.",
};

function contextMessage(chunks: RetrievedChunk[]): ChatMessage {
  const content =
    chunks.length === 0
      ? "Contexto: nenhum documento relevante encontrado."
      : "Contexto:\n" + chunks.map((c) => `[fonte: ${c.source}] ${c.text}`).join("\n\n");
  return { role: "system", content };
}

type ToolDefinition = {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>, chatId: string) => Promise<unknown>;
};

const toolRegistry: ToolDefinition[] = [
  { schema: consultarStatusFaturaSchema, execute: consultarStatusFatura },
  { schema: abrirTicketSchema, execute: abrirTicket },
];

async function executeTool(name: string, args: Record<string, unknown>, chatId: string): Promise<string> {
  const tool = toolRegistry.find((t) => t.schema.name === name);
  if (!tool) {
    log.warn("unknown tool requested by LLM", { name });
    return JSON.stringify({ error: `tool ${name} not found` });
  }
  try {
    return JSON.stringify(await tool.execute(args, chatId));
  } catch (err) {
    log.warn("tool execution failed", { name, err: String(err) });
    return JSON.stringify({ error: err instanceof Error ? err.message : "Falha ao executar a tool" });
  }
}

type ChatFn = (messages: ChatMessage[], tools: ToolSchema[]) => Promise<ChatResult>;

// ponytail: per-chatId promise chain, not a distributed lock — enough to stop two
// in-flight messages for the SAME chat from interleaving history.append calls
// (a real risk since a tool-call round trip awaits an LLM call mid-turn). Different
// chatIds still run fully concurrently.
const chatLocks = new Map<string, Promise<unknown>>();
function withChatLock<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chatLocks.get(chatId) ?? Promise.resolve();
  const result = prev.then(fn, fn);
  chatLocks.set(
    chatId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

const MAX_TOOL_ITERATIONS = 5;

export async function runHarness(
  chatId: string,
  userMessage: string,
  chatFn: ChatFn = chat,
  retrieveFn: (query: string) => Promise<RetrievedChunk[]> = retrieve,
): Promise<string> {
  return withChatLock(chatId, () => runHarnessTurn(chatId, userMessage, chatFn, retrieveFn));
}

async function runHarnessTurn(
  chatId: string,
  userMessage: string,
  chatFn: ChatFn,
  retrieveFn: (query: string) => Promise<RetrievedChunk[]>,
): Promise<string> {
  history.append(chatId, { role: "user", content: userMessage, toolCall: null, timestamp: Date.now() });
  const retrievedChunks = await retrieveFn(userMessage);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const messages: ChatMessage[] = [
      systemPrompt,
      contextMessage(retrievedChunks),
      ...history.get(chatId).map(({ role, content, toolCall }) => ({ role, content, toolCall })),
    ];
    const result = await chatFn(
      messages,
      toolRegistry.map((t) => t.schema),
    );

    if (result.type === "tool_call") {
      // `||`, not `??` — a provider-returned empty string is falsy-but-defined
      // and should be treated as "no id" same as null/undefined.
      const toolCall = { id: result.id || randomUUID(), name: result.name, args: result.args };
      history.append(chatId, {
        role: "assistant", content: "", toolCall, timestamp: Date.now(),
      });
      const toolResult = await executeTool(result.name, result.args, chatId);
      history.append(chatId, {
        role: "tool",
        content: toolResult,
        toolCall,
        timestamp: Date.now(),
      });
      continue;
    }

    history.append(chatId, { role: "assistant", content: result.content, toolCall: null, timestamp: Date.now() });
    return result.content;
  }

  const fallback = "Não consegui concluir sua solicitação agora, pode tentar de novo?";
  log.warn("tool-call loop hit MAX_TOOL_ITERATIONS", { chatId, MAX_TOOL_ITERATIONS });
  history.append(chatId, { role: "assistant", content: fallback, toolCall: null, timestamp: Date.now() });
  return fallback;
}
