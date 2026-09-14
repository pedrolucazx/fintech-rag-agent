import OpenAI from "openai";
import { config } from "../config.js";
import { getOrSet } from "./cache.js";
import { log } from "../logger.js";
import type { ConversationTurn } from "../history.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCall?: ConversationTurn["toolCall"];
};
export type ToolSchema = { name: string; description: string; parameters: Record<string, unknown> };
export type ChatResult =
  | { type: "tool_call"; id?: string; name: string; args: Record<string, unknown> }
  | { type: "text"; content: string };

const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface LlmProvider {
  chat(messages: ChatMessage[], tools: ToolSchema[], chatId?: string): Promise<ChatResult>;
}

const openAiToolCache = new Map<string, OpenAI.Chat.ChatCompletionTool>();

function toOpenAiTool(tool: ToolSchema): OpenAI.Chat.ChatCompletionTool {
  const key = tool.name;
  let cached = openAiToolCache.get(key);
  if (!cached) {
    cached = {
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    };
    openAiToolCache.set(key, cached);
  }
  return cached;
}

function toOpenAiMessages(messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map(({ role, content, toolCall }) => {
    if (role === "tool") {
      if (!toolCall?.id) throw new Error("Missing tool call id");
      return { role, content, tool_call_id: toolCall.id };
    }
    if (role === "assistant" && toolCall) {
      if (!toolCall.id) throw new Error("Missing tool call id");
      return {
        role,
        content,
        tool_calls: [{
          id: toolCall.id,
          type: "function",
          function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) },
        }],
      };
    }
    return { role, content };
  });
}

function parseChatCompletion(response: OpenAI.Chat.ChatCompletion): ChatResult {
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
    return { type: "tool_call", id: toolCall.id, name: toolCall.function.name, args };
  }
  return { type: "text", content: choice.message.content ?? "" };
}

type OpenAiCompatibleConfig = {
  baseURL: string;
  getApiKey: () => string;
  getModel: () => string;
  missingKeyMessage?: string;
};

class OpenAiCompatibleLlmProvider implements LlmProvider {
  private client?: OpenAI;

  constructor(private readonly options: OpenAiCompatibleConfig) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.options.getApiKey();
      if (!apiKey && this.options.missingKeyMessage) {
        throw new Error(this.options.missingKeyMessage);
      }
      this.client = new OpenAI({ baseURL: this.options.baseURL, apiKey, maxRetries: 1 });
    }
    return this.client;
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
    const response = await this.getClient().chat.completions.create(
      {
        model: this.options.getModel(),
        messages: toOpenAiMessages(messages),
        tools: tools.length > 0 ? tools.map(toOpenAiTool) : undefined,
        parallel_tool_calls: tools.length > 0 ? false : undefined,
      },
      { timeout: TIMEOUT_MS },
    );
    return parseChatCompletion(response);
  }
}

function currentModel(): string {
  return config.llmProvider === "gemini" ? config.geminiModel : config.nvidiaModel;
}

class FallbackLlmProvider implements LlmProvider {
  constructor(
    private readonly primary: LlmProvider,
    private readonly secondary: LlmProvider,
    private readonly secondaryName: string,
  ) {}

  async chat(messages: ChatMessage[], tools: ToolSchema[], chatId?: string): Promise<ChatResult> {
    try {
      return await this.primary.chat(messages, tools, chatId);
    } catch (err) {
      log.warn("primary LLM provider failed, falling back", {
        chatId,
        fallbackTo: this.secondaryName,
        err: String(err),
      });
      return this.secondary.chat(messages, tools, chatId);
    }
  }
}

class CachedLlmProvider implements LlmProvider {
  constructor(
    private readonly inner: LlmProvider,
    private readonly providerName: string,
  ) {}

  chat(messages: ChatMessage[], tools: ToolSchema[], chatId?: string): Promise<ChatResult> {
    const payload = JSON.stringify({ provider: this.providerName, model: currentModel(), messages, tools });
    const key = `llm:${this.providerName}:${payload}`;
    return getOrSet(key, CACHE_TTL_MS, () => this.inner.chat(messages, tools), chatId);
  }
}

const factories: Record<string, () => LlmProvider> = {
  nvidia: () =>
    new OpenAiCompatibleLlmProvider({
      baseURL: "https://integrate.api.nvidia.com/v1",
      getApiKey: () => config.nvidiaApiKey,
      getModel: () => config.nvidiaModel,
    }),
  gemini: () =>
    new OpenAiCompatibleLlmProvider({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      getApiKey: () => config.geminiApiKey,
      getModel: () => config.geminiModel,
      missingKeyMessage: "GEMINI_API_KEY is required when LLM_PROVIDER=gemini (see .env.example)",
    }),
};

const instances = new Map<string, LlmProvider>();

function getProvider(): LlmProvider {
  const name = config.llmProvider.toLowerCase();
  let instance = instances.get(name);
  if (!instance) {
    const factory = factories[name];
    if (!factory) {
      throw new Error(
        `Unknown LLM_PROVIDER: "${name}" (expected one of: ${Object.keys(factories).join(", ")})`,
      );
    }
    const fallbackName = name === "nvidia" ? "gemini" : "nvidia";
    const withFallback = new FallbackLlmProvider(factory(), factories[fallbackName](), fallbackName);
    instance = new CachedLlmProvider(withFallback, name);
    instances.set(name, instance);
  }
  return instance;
}

export async function chat(messages: ChatMessage[], tools: ToolSchema[], chatId?: string): Promise<ChatResult> {
  return getProvider().chat(messages, tools, chatId);
}
