import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { expandItemEntries, parseItemConfig } from "@/lib/item-config";

const configPath = path.join(process.cwd(), "data", "items-config.txt");
const fallbackStatePath = path.join(process.cwd(), "data", "spin-state.json");
const SPIN_STATE_KEY = "ebay_randomiser_spin_state_v1";

type PersistedSpinState = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
  configHash: string;
};

export type SpinState = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
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
  };
}

function toPublicState(state: PersistedSpinState): SpinState {
  return {
    items: state.items,
    pool: state.pool,
    selectedItem: state.selectedItem,
    version: state.version,
    updatedAt: state.updatedAt,
  };
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
  const kv = getKvConfig();

  if (kv) {
    const raw = await runKvCommand(["GET", SPIN_STATE_KEY]);
    if (typeof raw !== "string") return null;
    return JSON.parse(raw) as PersistedSpinState;
  }

  try {
    const raw = await fs.readFile(fallbackStatePath, "utf8");
    return JSON.parse(raw) as PersistedSpinState;
  } catch {
    return null;
  }
}

async function writeStateToStore(state: PersistedSpinState): Promise<void> {
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

  if (stored.configHash !== configHash) {
    const recreated = buildInitialState(configItems, stored.version + 1);
    await writeStateToStore(recreated);
    return recreated;
  }

  return stored;
}

export async function getSpinState(): Promise<SpinState> {
  const state = await ensureState();
  return toPublicState(state);
}

export async function spinOnce(): Promise<SpinState> {
  const state = await ensureState();

  if (state.pool.length === 0) {
    return toPublicState(state);
  }

  const selectedIndex = Math.floor(Math.random() * state.pool.length);
  const selectedItem = state.pool[selectedIndex];
  const nextPool = state.pool.filter((_, index) => index !== selectedIndex);

  const nextState: PersistedSpinState = {
    ...state,
    pool: nextPool,
    selectedItem,
    version: state.version + 1,
    updatedAt: nowIso(),
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
  };

  await writeStateToStore(nextState);
  return toPublicState(nextState);
}

export async function resetSpinStateFromItems(items: string[]): Promise<SpinState> {
  const stored = await readStateFromStore();
  const nextState = buildInitialState(items, (stored?.version ?? 0) + 1);
  await writeStateToStore(nextState);
  return toPublicState(nextState);
}
