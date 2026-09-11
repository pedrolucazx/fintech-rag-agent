import OpenAI from "openai";
import { config } from "./config.js";
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

const MODEL = "meta/llama-3.1-8b-instruct";
const TIMEOUT_MS = 15_000;

let client: OpenAI | undefined;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: config.nvidiaApiKey,
    });
  }
  return client;
}

function toOpenAiTool(tool: ToolSchema) {
  return {
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

export async function chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
  const call = () =>
    getClient().chat.completions.create(
      {
        model: MODEL,
        messages: messages.map(({ role, content, toolCall }): OpenAI.Chat.ChatCompletionMessageParam => {
          if (role === "tool") {
            if (!toolCall?.id) throw new Error("Missing tool call id");
            return { role, content, tool_call_id: toolCall.id };
          }
          if (role === "assistant" && toolCall?.id) {
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
    log.warn("llm call failed, retrying once", { err: String(err) });
    response = await call();
  }

  const choice = response.choices[0];
  const toolCall = choice.message.tool_calls?.[0];
  if (toolCall && "function" in toolCall) {
    return {
      type: "tool_call",
      id: toolCall.id,
      name: toolCall.function.name,
      args: JSON.parse(toolCall.function.arguments || "{}"),
    };
  }
  return { type: "text", content: choice.message.content ?? "" };
}
