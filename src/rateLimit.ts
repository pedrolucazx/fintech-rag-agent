const WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 10;

const hitsByChat = new Map<string, number[]>();

export function isRateLimited(chatId: string): boolean {
  const now = Date.now();
  const recentHits = (hitsByChat.get(chatId) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  recentHits.push(now);
  hitsByChat.set(chatId, recentHits);
  return recentHits.length > MAX_MESSAGES_PER_WINDOW;
}
