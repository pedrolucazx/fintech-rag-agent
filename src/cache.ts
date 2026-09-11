import Redis from "ioredis";

const REDIS_URL = "redis://localhost:6379";

let client: Redis | undefined;
function getClient(): Redis {
  if (!client) {
    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });
    client.on("error", (err) => {
      console.warn("[cache] Redis connection error", { err: String(err) });
    });
  }
  return client;
}

// Cache is a best-effort optimization, never a hard dependency: any Redis
// failure (read or write) is logged and skipped, falling through to fn()
// directly — a Redis outage must never take down the bot's actual LLM calls.
export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  let cached: string | null = null;
  try {
    const redis = getClient();
    if (redis.status === "wait") await redis.connect();
    cached = await redis.get(key);
  } catch (err) {
    console.warn("[cache] Redis read failed, skipping cache", { err: String(err) });
  }
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const value = await fn();

  try {
    await getClient().set(key, JSON.stringify(value), "PX", ttlMs);
  } catch (err) {
    console.warn("[cache] Redis write failed, continuing without cache", { err: String(err) });
  }

  return value;
}

export async function closeCache(): Promise<void> {
  if (client && client.status !== "end") {
    await client.quit();
  }
}