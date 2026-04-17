import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_RANDOMISER_CHANNEL, type RandomiserChannel } from "@/lib/server-channels";
import { readSupabaseKv, writeSupabaseKv } from "@/lib/supabase-kv";

const legacyConfigPath = path.join(process.cwd(), "data", "items-config.txt");
const LEGACY_CONFIG_KEY = "ebay_randomiser_items_config_v1";

function getConfigPath(channel: RandomiserChannel): string {
  return channel === DEFAULT_RANDOMISER_CHANNEL
    ? legacyConfigPath
    : path.join(process.cwd(), "data", `items-config.${channel}.txt`);
}

function getConfigKey(channel: RandomiserChannel): string {
  return `ebay_randomiser_items_config_${channel}_v1`;
}

async function readFileConfig(channel: RandomiserChannel): Promise<string> {
  return fs.readFile(getConfigPath(channel), "utf8");
}

export async function readItemConfigText(channel: RandomiserChannel = DEFAULT_RANDOMISER_CHANNEL): Promise<string> {
  const configKey = getConfigKey(channel);
  const fromSupabase = await readSupabaseKv(configKey);
  if (typeof fromSupabase === "string" && fromSupabase.trim().length > 0) {
    return fromSupabase;
  }

  if (channel === DEFAULT_RANDOMISER_CHANNEL) {
    const legacyValue = await readSupabaseKv(LEGACY_CONFIG_KEY);
    if (typeof legacyValue === "string" && legacyValue.trim().length > 0) {
      await writeSupabaseKv(configKey, legacyValue);
      return legacyValue;
    }
  }

  try {
    const seeded = await readFileConfig(channel);
    const persisted = await writeSupabaseKv(configKey, seeded);
    if (persisted) {
      return seeded;
    }
    return seeded;
  } catch {
    if (channel !== DEFAULT_RANDOMISER_CHANNEL) {
      const base = await readItemConfigText(DEFAULT_RANDOMISER_CHANNEL);
      await writeSupabaseKv(configKey, base);
      return base;
    }

    throw new Error("Could not load item configuration.");
  }
}

export async function writeItemConfigText(
  configText: string,
  channel: RandomiserChannel = DEFAULT_RANDOMISER_CHANNEL,
): Promise<void> {
  const persisted = await writeSupabaseKv(getConfigKey(channel), configText);
  if (persisted) return;

  await fs.writeFile(getConfigPath(channel), configText, "utf8");
}
