import Redis from "ioredis";
import { config } from "../config.js";
import { log } from "../logger.js";

let client: Redis | undefined;
function getClient(): Redis {
  if (!client || client.status === "end") {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });
    client.on("error", (err) => {
      log.warn("Redis connection error", { err: String(err) });
    });
  }
  return client;
}

async function readFromRedisSafely(key: string): Promise<string | null> {
  try {
    const redis = getClient();
    if (redis.status === "wait") await redis.connect();
    return await redis.get(key);
  } catch (err) {
    log.warn("Redis read failed, skipping cache", { err: String(err) });
    return null;
  }
}

async function writeToRedisSafely(key: string, value: string, ttlMs: number): Promise<void> {
  try {
    await getClient().set(key, value, "PX", ttlMs);
  } catch (err) {
    log.warn("Redis write failed, continuing without cache", { err: String(err) });
  }
}

export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  chatId?: string,
): Promise<T> {
  const cached = await readFromRedisSafely(key);
  if (cached !== null) {
    log.info("cache hit", { chatId, key: key.slice(0, 60) });
    return JSON.parse(cached) as T;
  }

  log.info("cache miss, calling fn()", { chatId, key: key.slice(0, 60) });
  const value = await fn();
  await writeToRedisSafely(key, JSON.stringify(value), ttlMs);
  return value;
}

export async function closeCache(): Promise<void> {
  if (client && client.status !== "end") {
    await client.quit();
  }
}
