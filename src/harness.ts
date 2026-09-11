import { chat, type ChatMessage, type ChatResult, type ToolSchema } from "./llm.js";
import { history } from "./history.js";
import { log } from "./logger.js";

const systemPrompt: ChatMessage = {
  role: "system",
  content:
    "Você é o assistente de atendimento financeiro da ConectaNet, uma operadora de internet. " +
    "Responda dúvidas de fatura e pagamento de forma direta e educada, em português.",
};

type ToolDefinition = {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

const toolRegistry: ToolDefinition[] = [];

export function registerTool(schema: ToolSchema, execute: ToolDefinition["execute"]): void {
  toolRegistry.push({ schema, execute });
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = toolRegistry.find((t) => t.schema.name === name);
  if (!tool) {
    log.warn("unknown tool requested by LLM", { name });
    return JSON.stringify({ error: `tool ${name} not found` });
  }
  const result = await tool.execute(args);
  return JSON.stringify(result);
}

type ChatFn = (messages: ChatMessage[], tools: ToolSchema[]) => Promise<ChatResult>;

export async function runHarness(chatId: string, userMessage: string, chatFn: ChatFn = chat): Promise<string> {
  history.append(chatId, { role: "user", content: userMessage, toolCall: null, timestamp: Date.now() });

  while (true) {
    const messages: ChatMessage[] = [
      systemPrompt,
      ...history.get(chatId).map(({ role, content }) => ({ role, content })),
    ];
    const result = await chatFn(
      messages,
      toolRegistry.map((t) => t.schema),
    );

    if (result.type === "tool_call") {
      const toolResult = await executeTool(result.name, result.args);
      history.append(chatId, {
        role: "tool",
        content: toolResult,
        toolCall: { name: result.name, args: result.args },
        timestamp: Date.now(),
      });
      continue;
    }

    history.append(chatId, { role: "assistant", content: result.content, toolCall: null, timestamp: Date.now() });
    return result.content;
  }
}
