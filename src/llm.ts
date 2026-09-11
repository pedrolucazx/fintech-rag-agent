import OpenAI from "openai";
import { config } from "./config.js";
import { getOrSet } from "./cache.js";
import { log } from "./logger.js";
import type { ConversationTurn } from "./history.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCall?: ConversationTurn["toolCall"];
};
export type ToolSchema = { name: string; description: string; parameters: Record<string, unknown> };
export type ChatResult =
  | { type: "tool_call"; id?: string; name: string; args: Record<string, unknown> }
  | { type: "text"; content: string };

const NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";
const GEMINI_MODEL = "gemini-1.5-flash";
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let nvidiaClient: OpenAI | undefined;
let geminiClient: OpenAI | undefined;

function getNvidiaClient(): OpenAI {
  if (!nvidiaClient) {
    nvidiaClient = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: config.nvidiaApiKey,
    });
  }
  return nvidiaClient;
}

function getGeminiClient(): OpenAI {
  if (!geminiClient) {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is required when LLM_PROVIDER=gemini (see .env.example)");
    }
    geminiClient = new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: config.geminiApiKey,
    });
  }
  return geminiClient;
}

function getClient(): OpenAI {
  return config.llmProvider === "gemini" ? getGeminiClient() : getNvidiaClient();
}

function getModel(): string {
  return config.llmProvider === "gemini" ? GEMINI_MODEL : NVIDIA_MODEL;
}

function toOpenAiTool(tool: ToolSchema) {
  return {
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

// ponytail: keyed on message/tool content only, no chatId — two different
// chats that happen to send byte-identical messages (only realistic for a
// first message with no history yet) share a cache hit. Adding chatId would
// mean threading it through chat()'s public signature and every ChatFn
// caller in harness.ts (touched independently by 3 other in-flight
// branches right now); also consistent with spec.md's Assumptions, which
// already document no per-user ownership/isolation elsewhere in this bot.
// Revisit if per-user isolation is ever added for real.
function buildCacheKey(messages: ChatMessage[], tools: ToolSchema[]): string {
  const provider = config.llmProvider;
  const payload = JSON.stringify({ provider, messages, tools });
  return `llm:${provider}:${payload}`;
}

async function callLlm(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
  const client = getClient();
  const model = getModel();

  const call = () =>
    client.chat.completions.create(
      {
        model,
        messages: messages.map(({ role, content, toolCall }): OpenAI.Chat.ChatCompletionMessageParam => {
          if (role === "tool") {
            if (!toolCall?.id) throw new Error("Missing tool call id");
            return { role, content, tool_call_id: toolCall.id };
          }
          if (role === "assistant" && toolCall) {
            if (!toolCall.id) throw new Error("Missing tool call id");
            return { role, content, tool_calls: [{
              id: toolCall.id,
              type: "function",
              function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) },
            }] };
          }
          return { role, content };
        }),
        tools: tools.length > 0 ? tools.map(toOpenAiTool) : undefined,
        parallel_tool_calls: tools.length > 0 ? false : undefined,
      },
      { timeout: TIMEOUT_MS },
    );

  let response;
  try {
    response = await call();
  } catch (err) {
    log.warn("llm call failed, retrying once", { err: String(err), provider: config.llmProvider });
    response = await call();
  }

  const choice = response.choices[0];
  const toolCall = choice.message.tool_calls?.[0];
  if (toolCall && "function" in toolCall) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch (err) {
      log.warn("tool call arguments were not valid JSON, treating as empty", {
        name: toolCall.function.name,
        err: String(err),
      });
    }
    return {
      type: "tool_call",
      id: toolCall.id,
      name: toolCall.function.name,
      args,
    };
  }
  return { type: "text", content: choice.message.content ?? "" };
}

export async function chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
  const key = buildCacheKey(messages, tools);
  return getOrSet(key, CACHE_TTL_MS, () => callLlm(messages, tools));
}