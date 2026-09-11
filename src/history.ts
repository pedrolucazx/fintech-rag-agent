export type ConversationTurn = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCall: { name: string; args: Record<string, unknown> } | null;
  timestamp: number;
};

const store = new Map<string, ConversationTurn[]>();

export const history = {
  append(chatId: string, turn: ConversationTurn): void {
    const turns = store.get(chatId) ?? [];
    turns.push(turn);
    store.set(chatId, turns);
  },
  get(chatId: string): ConversationTurn[] {
    return store.get(chatId) ?? [];
  },
};
