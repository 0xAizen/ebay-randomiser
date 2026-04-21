import { promises as fs } from "node:fs";
import { randomInt } from "node:crypto";
import path from "node:path";
import {
  ENERGY_BREAK_SPOTS,
  type EnergyBreakSpot,
  type EnergyBreakState,
  type EnergyBreakSpotName,
} from "@/lib/energy-break-shared";
import { readSupabaseKv, writeSupabaseKv } from "@/lib/supabase-kv";

const ENERGY_BREAK_STATE_KEY = "ebay_energy_break_state_v1";
const fallbackStatePath = path.join(process.cwd(), "data", "energy-break-state.json");

function nowIso(): string {
  return new Date().toISOString();
}

function buildInitialState(): EnergyBreakState {
  return {
    breakNumber: "",
    setName: "",
    spots: ENERGY_BREAK_SPOTS.map((energy) => ({ energy, username: "" })),
    currentBuyersGiveawayItem: "",
    buyersGiveaway: null,
    updatedAt: nowIso(),
  };
}

function normalizeState(input: Partial<EnergyBreakState> | null | undefined): EnergyBreakState {
  const byEnergy = new Map(
    (input?.spots ?? []).map((spot) => [spot.energy.toLowerCase(), typeof spot.username === "string" ? spot.username : ""]),
  );

  return {
    breakNumber: typeof input?.breakNumber === "string" ? input.breakNumber : "",
    setName: typeof input?.setName === "string" ? input.setName : "",
    spots: ENERGY_BREAK_SPOTS.map((energy) => ({
      energy,
      username: byEnergy.get(energy.toLowerCase()) ?? "",
    })),
    currentBuyersGiveawayItem: typeof input?.currentBuyersGiveawayItem === "string" ? input.currentBuyersGiveawayItem : "",
    buyersGiveaway:
      input?.buyersGiveaway &&
      typeof input.buyersGiveaway.itemName === "string" &&
      typeof input.buyersGiveaway.winnerUsername === "string" &&
      typeof input.buyersGiveaway.winnerEnergy === "string" &&
      typeof input.buyersGiveaway.sourceEntryCount === "number" &&
      typeof input.buyersGiveaway.ranAt === "string"
        ? {
            itemName: input.buyersGiveaway.itemName,
            winnerUsername: input.buyersGiveaway.winnerUsername,
            winnerEnergy: input.buyersGiveaway.winnerEnergy as EnergyBreakSpotName,
            sourceEntryCount: input.buyersGiveaway.sourceEntryCount,
            ranAt: input.buyersGiveaway.ranAt,
          }
        : null,
    updatedAt: input?.updatedAt ?? nowIso(),
  };
}

async function readStateFromStore(): Promise<EnergyBreakState | null> {
  const fromSupabase = await readSupabaseKv(ENERGY_BREAK_STATE_KEY);
  if (typeof fromSupabase === "string" && fromSupabase.trim().length > 0) {
    return normalizeState(JSON.parse(fromSupabase) as Partial<EnergyBreakState>);
  }

  try {
    const raw = await fs.readFile(fallbackStatePath, "utf8");
    const parsed = normalizeState(JSON.parse(raw) as Partial<EnergyBreakState>);
    await writeSupabaseKv(ENERGY_BREAK_STATE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return null;
  }
}

async function writeStateToStore(state: EnergyBreakState): Promise<void> {
  const persisted = await writeSupabaseKv(ENERGY_BREAK_STATE_KEY, JSON.stringify(state));
  if (persisted) return;

  await fs.writeFile(fallbackStatePath, JSON.stringify(state, null, 2), "utf8");
}

export async function getEnergyBreakState(): Promise<EnergyBreakState> {
  const stored = await readStateFromStore();
  if (stored) return stored;

  const created = buildInitialState();
  await writeStateToStore(created);
  return created;
}

export async function saveEnergyBreakState(
  spots: EnergyBreakSpot[],
  breakNumber: string,
  setName: string,
): Promise<EnergyBreakState> {
  const current = await getEnergyBreakState();
  const nextState = normalizeState({
    spots,
    breakNumber: breakNumber.trim(),
    setName: setName.trim(),
    currentBuyersGiveawayItem: current.currentBuyersGiveawayItem,
    buyersGiveaway: current.buyersGiveaway,
    updatedAt: nowIso(),
  });
  await writeStateToStore(nextState);
  return nextState;
}

export async function clearEnergyBreakState(): Promise<EnergyBreakState> {
  const nextState = buildInitialState();
  await writeStateToStore(nextState);
  return nextState;
}

export async function setEnergyBreakBuyersGiveawayItem(itemName: string): Promise<EnergyBreakState> {
  const current = await getEnergyBreakState();
  const cleanItemName = itemName.trim();

  if (!cleanItemName) {
    throw new Error("Buyer's giveaway item name is required.");
  }

  const nextState = normalizeState({
    ...current,
    currentBuyersGiveawayItem: cleanItemName,
    updatedAt: nowIso(),
  });
  await writeStateToStore(nextState);
  return nextState;
}

export async function runEnergyBreakBuyersGiveaway(): Promise<EnergyBreakState> {
  const current = await getEnergyBreakState();
  const cleanItemName = current.currentBuyersGiveawayItem.trim();

  if (!cleanItemName) {
    throw new Error("Set a buyer's giveaway item before running the draw.");
  }

  const entries = current.spots.filter((spot) => spot.username.trim().length > 0);
  if (entries.length === 0) {
    throw new Error("No filled energy spots available for buyer's giveaway.");
  }

  const winner = entries[randomInt(entries.length)];
  const nextState = normalizeState({
    ...current,
    currentBuyersGiveawayItem: "",
    buyersGiveaway: {
      itemName: cleanItemName,
      winnerUsername: winner.username.trim(),
      winnerEnergy: winner.energy,
      sourceEntryCount: entries.length,
      ranAt: nowIso(),
    },
    updatedAt: nowIso(),
  });

  await writeStateToStore(nextState);
  return nextState;
}
