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

export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getClient();
  if (redis.status === "wait") {
    await redis.connect();
  }

  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const value = await fn();
  await redis.set(key, JSON.stringify(value), "PX", ttlMs);
  return value;
}

export async function closeCache(): Promise<void> {
  if (client && client.status !== "end") {
    await client.quit();
  }
}