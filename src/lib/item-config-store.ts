import { promises as fs } from "node:fs";
import path from "node:path";
import { readSupabaseKv, writeSupabaseKv } from "@/lib/supabase-kv";

const configPath = path.join(process.cwd(), "data", "items-config.txt");
const CONFIG_KEY = "ebay_randomiser_items_config_v1";

async function readFileConfig(): Promise<string> {
  return fs.readFile(configPath, "utf8");
}

export async function readItemConfigText(): Promise<string> {
  const fromSupabase = await readSupabaseKv(CONFIG_KEY);
  if (typeof fromSupabase === "string" && fromSupabase.trim().length > 0) {
    return fromSupabase;
  }

  const seeded = await readFileConfig();
  const persisted = await writeSupabaseKv(CONFIG_KEY, seeded);
  if (persisted) {
    return seeded;
  }

  return seeded;
}

export async function writeItemConfigText(configText: string): Promise<void> {
  const persisted = await writeSupabaseKv(CONFIG_KEY, configText);
  if (persisted) return;

  await fs.writeFile(configPath, configText, "utf8");
}
