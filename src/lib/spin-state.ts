import { promises as fs } from "node:fs";
import { createHash, randomInt } from "node:crypto";
import path from "node:path";
import { createClient, type RedisClientType } from "redis";
import { expandItemEntries, parseItemConfig } from "@/lib/item-config";

const configPath = path.join(process.cwd(), "data", "items-config.txt");
const fallbackStatePath = path.join(process.cwd(), "data", "spin-state.json");
const SPIN_STATE_KEY = "ebay_randomiser_spin_state_v1";
const MAX_HISTORY = 200;

export type SpinRecord = {
  auctionNumber: string;
  username: string;
  item: string;
  spunAt: string;
  version: number;
};

export type BuyersGiveawayState = {
  itemName: string;
  winnerUsername: string;
  sourceEntryCount: number;
  ranAt: string;
  version: number;
};

type PersistedSpinState = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
  configHash: string;
  isOffline: boolean;
  isTestingMode: boolean;
  lastSpin: SpinRecord | null;
  history: SpinRecord[];
  buyersGiveaway: BuyersGiveawayState | null;
  currentBuyersGiveawayItem: string | null;
};

export type SpinState = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
  isOffline: boolean;
  isTestingMode: boolean;
  lastSpin: SpinRecord | null;
  history: SpinRecord[];
  buyersGiveaway: BuyersGiveawayState | null;
  currentBuyersGiveawayItem: string | null;
};

export type SpinMetaInput = {
  auctionNumber: string;
  username: string;
};

type RedisGlobal = typeof globalThis & {
  __ebayRandomiserRedisClient?: RedisClientType;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function readConfigItems(): Promise<string[]> {
  const configText = await fs.readFile(configPath, "utf8");
  return expandItemEntries(parseItemConfig(configText));
}

function hashItems(items: string[]): string {
  return createHash("sha256").update(items.join("\n")).digest("hex");
}

function buildInitialState(items: string[], version = 1): PersistedSpinState {
  return {
    items,
    pool: [...items],
    selectedItem: null,
    version,
    updatedAt: nowIso(),
    configHash: hashItems(items),
    isOffline: false,
    isTestingMode: false,
    lastSpin: null,
    history: [],
    buyersGiveaway: null,
    currentBuyersGiveawayItem: null,
  };
}

function normalizeLegacyState(state: Partial<PersistedSpinState>): PersistedSpinState {
  return {
    items: state.items ?? [],
    pool: state.pool ?? [],
    selectedItem: state.selectedItem ?? null,
    version: state.version ?? 1,
    updatedAt: state.updatedAt ?? nowIso(),
    configHash: state.configHash ?? hashItems(state.items ?? []),
    isOffline: state.isOffline ?? false,
    isTestingMode: state.isTestingMode ?? false,
    lastSpin: state.lastSpin ?? null,
    history: state.history ?? [],
    buyersGiveaway: state.buyersGiveaway ?? null,
    currentBuyersGiveawayItem: state.currentBuyersGiveawayItem ?? null,
  };
}

function toPublicState(state: PersistedSpinState): SpinState {
  return {
    items: state.items,
    pool: state.pool,
    selectedItem: state.selectedItem,
    version: state.version,
    updatedAt: state.updatedAt,
    isOffline: state.isOffline,
    isTestingMode: state.isTestingMode,
    lastSpin: state.lastSpin,
    history: state.history,
    buyersGiveaway: state.buyersGiveaway,
    currentBuyersGiveawayItem: state.currentBuyersGiveawayItem,
  };
}

function sanitizeMeta(meta: SpinMetaInput): SpinMetaInput {
  return {
    auctionNumber: meta.auctionNumber.trim(),
    username: meta.username.trim(),
  };
}

function isPoolValidForItems(pool: string[], items: string[]): boolean {
  const remaining = new Map<string, number>();
  for (const item of items) {
    remaining.set(item, (remaining.get(item) ?? 0) + 1);
  }

  for (const item of pool) {
    const count = remaining.get(item) ?? 0;
    if (count <= 0) {
      return false;
    }
    remaining.set(item, count - 1);
  }

  return true;
}

async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  const redisGlobal = globalThis as RedisGlobal;

  if (!redisGlobal.__ebayRandomiserRedisClient) {
    redisGlobal.__ebayRandomiserRedisClient = createClient({ url: redisUrl });
    redisGlobal.__ebayRandomiserRedisClient.on("error", () => {
      // Errors are surfaced on request execution; keep this silent to avoid noisy logs.
    });
  }

  if (!redisGlobal.__ebayRandomiserRedisClient.isOpen) {
    await redisGlobal.__ebayRandomiserRedisClient.connect();
  }

  return redisGlobal.__ebayRandomiserRedisClient;
}

function getKvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

async function runKvCommand(command: string[]): Promise<unknown> {
  const kv = getKvConfig();
  if (!kv) return null;

  const response = await fetch(kv.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kv.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to talk to KV.");
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload.result ?? null;
}

async function readStateFromStore(): Promise<PersistedSpinState | null> {
  const redis = await getRedisClient();
  if (redis) {
    const raw = await redis.get(SPIN_STATE_KEY);
    if (!raw) return null;
    return normalizeLegacyState(JSON.parse(raw) as Partial<PersistedSpinState>);
  }

  const kv = getKvConfig();
  if (kv) {
    const raw = await runKvCommand(["GET", SPIN_STATE_KEY]);
    if (typeof raw !== "string") return null;
    return normalizeLegacyState(JSON.parse(raw) as Partial<PersistedSpinState>);
  }

  try {
    const raw = await fs.readFile(fallbackStatePath, "utf8");
    return normalizeLegacyState(JSON.parse(raw) as Partial<PersistedSpinState>);
  } catch {
    return null;
  }
}

async function writeStateToStore(state: PersistedSpinState): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(SPIN_STATE_KEY, JSON.stringify(state));
    return;
  }

  const kv = getKvConfig();
  if (kv) {
    await runKvCommand(["SET", SPIN_STATE_KEY, JSON.stringify(state)]);
    return;
  }

  await fs.writeFile(fallbackStatePath, JSON.stringify(state, null, 2), "utf8");
}

async function ensureState(): Promise<PersistedSpinState> {
  const configItems = await readConfigItems();
  const configHash = hashItems(configItems);
  const stored = await readStateFromStore();

  if (!stored) {
    const created = buildInitialState(configItems);
    await writeStateToStore(created);
    return created;
  }

  const needsConfigRefresh = stored.configHash !== configHash;
  const needsPoolRepair = !isPoolValidForItems(stored.pool, configItems);

  if (needsConfigRefresh || needsPoolRepair) {
    const recreated = {
      ...buildInitialState(configItems, stored.version + 1),
      isOffline: stored.isOffline,
      isTestingMode: stored.isTestingMode,
      history: stored.history,
      lastSpin: stored.lastSpin,
      buyersGiveaway: stored.buyersGiveaway,
      currentBuyersGiveawayItem: stored.currentBuyersGiveawayItem,
    };

    await writeStateToStore(recreated);
    return recreated;
  }

  return stored;
}

export async function getSpinState(): Promise<SpinState> {
  const state = await ensureState();
  return toPublicState(state);
}

export async function spinOnce(meta: SpinMetaInput): Promise<SpinState> {
  const state = await ensureState();
  const cleanMeta = sanitizeMeta(meta);

  if (!cleanMeta.auctionNumber || !cleanMeta.username) {
    throw new Error("Auction number and username are required.");
  }

  if (!state.isTestingMode) {
    const exists = state.history.some(
      (record) => record.auctionNumber.toLowerCase() === cleanMeta.auctionNumber.toLowerCase(),
    );
    if (exists) {
      throw new Error(
        `Auction number ${cleanMeta.auctionNumber} already exists. Use a unique auction number or ask owner to enable testing mode.`,
      );
    }
  }

  if (state.pool.length === 0) {
    return toPublicState(state);
  }

  // Legitimate draw rule:
  // Every remaining entry has equal probability (1 / pool.length).
  // No weighting multipliers or per-item bias are applied.
  const selectedIndex = randomInt(state.pool.length);
  const selectedItem = state.pool[selectedIndex];
  const nextPool = state.pool.filter((_, index) => index !== selectedIndex);
  const nextVersion = state.version + 1;

  const record: SpinRecord = {
    auctionNumber: cleanMeta.auctionNumber,
    username: cleanMeta.username,
    item: selectedItem,
    spunAt: nowIso(),
    version: nextVersion,
  };

  const nextState: PersistedSpinState = {
    ...state,
    pool: nextPool,
    selectedItem,
    version: nextVersion,
    updatedAt: record.spunAt,
    lastSpin: record,
    history: [record, ...state.history].slice(0, MAX_HISTORY),
    buyersGiveaway: state.buyersGiveaway,
    currentBuyersGiveawayItem: state.currentBuyersGiveawayItem,
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function resetSpinState(): Promise<SpinState> {
  const state = await ensureState();

  const nextState: PersistedSpinState = {
    ...state,
    pool: [...state.items],
    selectedItem: null,
    version: state.version + 1,
    updatedAt: nowIso(),
    isOffline: state.isOffline,
    isTestingMode: state.isTestingMode,
    buyersGiveaway: state.buyersGiveaway,
    currentBuyersGiveawayItem: state.currentBuyersGiveawayItem,
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function resetSpinStateFromItems(items: string[]): Promise<SpinState> {
  const stored = await readStateFromStore();
  const nextState = buildInitialState(items, (stored?.version ?? 0) + 1);

  if (stored) {
    nextState.isOffline = stored.isOffline;
    nextState.isTestingMode = stored.isTestingMode;
    nextState.history = stored.history;
    nextState.lastSpin = stored.lastSpin;
    nextState.buyersGiveaway = stored.buyersGiveaway;
    nextState.currentBuyersGiveawayItem = stored.currentBuyersGiveawayItem;
  }

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function setPublicOffline(isOffline: boolean): Promise<SpinState> {
  const state = await ensureState();
  const nextState: PersistedSpinState = {
    ...state,
    isOffline,
    buyersGiveaway: state.buyersGiveaway,
    currentBuyersGiveawayItem: state.currentBuyersGiveawayItem,
    version: state.version + 1,
    updatedAt: nowIso(),
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function setTestingMode(isTestingMode: boolean): Promise<SpinState> {
  const state = await ensureState();
  const nextState: PersistedSpinState = {
    ...state,
    isTestingMode,
    buyersGiveaway: state.buyersGiveaway,
    currentBuyersGiveawayItem: state.currentBuyersGiveawayItem,
    version: state.version + 1,
    updatedAt: nowIso(),
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function clearSpinHistory(): Promise<SpinState> {
  const state = await ensureState();
  const nextState: PersistedSpinState = {
    ...state,
    lastSpin: null,
    history: [],
    selectedItem: null,
    buyersGiveaway: null,
    currentBuyersGiveawayItem: null,
    version: state.version + 1,
    updatedAt: nowIso(),
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function resetPoolAndClearHistory(): Promise<SpinState> {
  const state = await ensureState();
  const nextState: PersistedSpinState = {
    ...state,
    pool: [...state.items],
    selectedItem: null,
    lastSpin: null,
    history: [],
    buyersGiveaway: null,
    currentBuyersGiveawayItem: null,
    version: state.version + 1,
    updatedAt: nowIso(),
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function setCurrentBuyersGiveawayItem(itemName: string): Promise<SpinState> {
  const state = await ensureState();
  const cleanItemName = itemName.trim();

  if (!cleanItemName) {
    throw new Error("Buyer's giveaway item name is required.");
  }

  const nextState: PersistedSpinState = {
    ...state,
    currentBuyersGiveawayItem: cleanItemName,
    version: state.version + 1,
    updatedAt: nowIso(),
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function runBuyersGiveaway(itemName?: string): Promise<SpinState> {
  const state = await ensureState();
  const cleanItemName = itemName?.trim() || state.currentBuyersGiveawayItem?.trim() || "";

  if (!cleanItemName) {
    throw new Error("Set a buyer's giveaway item first.");
  }
  if (state.history.length === 0) {
    throw new Error("No auction entries available for buyer's giveaway.");
  }

  const entries = state.history.map((record) => record.username);
  const winnerIndex = randomInt(entries.length);
  const winnerUsername = entries[winnerIndex];
  const ranAt = nowIso();
  const nextVersion = state.version + 1;

  const nextState: PersistedSpinState = {
    ...state,
    buyersGiveaway: {
      itemName: cleanItemName,
      winnerUsername,
      sourceEntryCount: entries.length,
      ranAt,
      version: nextVersion,
    },
    currentBuyersGiveawayItem: null,
    version: nextVersion,
    updatedAt: ranAt,
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}
