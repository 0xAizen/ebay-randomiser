import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type RedisClientType } from "redis";

const configPath = path.join(process.cwd(), "data", "items-config.txt");
const CONFIG_KEY = "ebay_randomiser_items_config_v1";

type RedisGlobal = typeof globalThis & {
  __ebayRandomiserItemConfigRedisClient?: RedisClientType;
};

async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  const redisGlobal = globalThis as RedisGlobal;

  if (!redisGlobal.__ebayRandomiserItemConfigRedisClient) {
    redisGlobal.__ebayRandomiserItemConfigRedisClient = createClient({ url: redisUrl });
    redisGlobal.__ebayRandomiserItemConfigRedisClient.on("error", () => {
      // Request-time operations will surface errors.
    });
  }

  if (!redisGlobal.__ebayRandomiserItemConfigRedisClient.isOpen) {
    await redisGlobal.__ebayRandomiserItemConfigRedisClient.connect();
  }

  return redisGlobal.__ebayRandomiserItemConfigRedisClient;
}

async function readFileConfig(): Promise<string> {
  return fs.readFile(configPath, "utf8");
}

export async function readItemConfigText(): Promise<string> {
  const redis = await getRedisClient();
  if (redis) {
    const fromRedis = await redis.get(CONFIG_KEY);
    if (typeof fromRedis === "string" && fromRedis.trim().length > 0) {
      return fromRedis;
    }

    const seeded = await readFileConfig();
    await redis.set(CONFIG_KEY, seeded);
    return seeded;
  }

  return readFileConfig();
}

export async function writeItemConfigText(configText: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(CONFIG_KEY, configText);
    return;
  }

  await fs.writeFile(configPath, configText, "utf8");
}
