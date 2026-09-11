import { randomUUID } from "node:crypto";
import { chat, type ChatMessage, type ChatResult, type ToolSchema } from "./llm.js";
import { history } from "./history.js";
import { log } from "./logger.js";
import { consultarStatusFatura, consultarStatusFaturaSchema } from "./tools.js";

const systemPrompt: ChatMessage = {
  role: "system",
  content:
    "Você é o assistente de atendimento financeiro da ConectaNet, uma operadora de internet. " +
    "Responda dúvidas de fatura e pagamento de forma direta e educada, em português. " +
    "Para consultar status de fatura/pagamento, use consultar_status_fatura e responda com base no resultado. " +
    "Se não houver identificador da fatura na conversa, pergunte ao cliente o identificador " +
    "(ou mês de referência) antes de chamar a tool. Nunca invente ou assuma um id; " +
    "se o mês não resolver o identificador, peça o id. Reutilize o id informado no histórico. " +
    "Se o resultado for nao_encontrado, informe que a fatura não foi encontrada e peça para conferir o id.",
};

type ToolDefinition = {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

const toolRegistry: ToolDefinition[] = [
  { schema: consultarStatusFaturaSchema, execute: consultarStatusFatura },
];

export function registerTool(schema: ToolSchema, execute: ToolDefinition["execute"]): void {
  toolRegistry.push({ schema, execute });
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = toolRegistry.find((t) => t.schema.name === name);
  if (!tool) {
    log.warn("unknown tool requested by LLM", { name });
    return JSON.stringify({ error: `tool ${name} not found` });
  }
  try {
    return JSON.stringify(await tool.execute(args));
  } catch (err) {
    log.warn("tool execution failed", { name, err: String(err) });
    return JSON.stringify({ error: err instanceof Error ? err.message : "Falha ao executar a tool" });
  }
}

type ChatFn = (messages: ChatMessage[], tools: ToolSchema[]) => Promise<ChatResult>;

export async function runHarness(chatId: string, userMessage: string, chatFn: ChatFn = chat): Promise<string> {
  history.append(chatId, { role: "user", content: userMessage, toolCall: null, timestamp: Date.now() });

  while (true) {
    const messages: ChatMessage[] = [
      systemPrompt,
      ...history.get(chatId).map(({ role, content, toolCall }) => ({ role, content, toolCall })),
    ];
    const result = await chatFn(
      messages,
      toolRegistry.map((t) => t.schema),
    );

    if (result.type === "tool_call") {
      const toolCall = { id: result.id ?? randomUUID(), name: result.name, args: result.args };
      history.append(chatId, {
        role: "assistant", content: "", toolCall, timestamp: Date.now(),
      });
      const toolResult = await executeTool(result.name, result.args);
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
}
