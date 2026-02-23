import { promises as fs } from "node:fs";
import path from "node:path";
import { readSupabaseKv, writeSupabaseKv } from "@/lib/supabase-kv";

export type StaffCatalogItem = {
  id: string;
  name: string;
  gbpValue: number;
};

const catalogPath = path.join(process.cwd(), "data", "staff-catalog.json");
const CATALOG_KEY = "ebay_randomiser_staff_catalog_v1";

const defaultCatalog: StaffCatalogItem[] = [
  { id: "mega-brave-booster-box", name: "Mega Brave Booster Box", gbpValue: 109.99 },
  { id: "mega-symphonia-booster-box", name: "Mega Symphonia Booster Box", gbpValue: 109.99 },
  { id: "mega-inferno-booster-box", name: "Mega Inferno Booster Box", gbpValue: 109.99 },
  { id: "mega-dream-booster-box", name: "Mega Dream Booster Box", gbpValue: 109.99 },
  { id: "nihil-zero-booster-box", name: "Nihil Zero Booster Box", gbpValue: 99.99 },
  { id: "mega-brave-booster-pack", name: "Mega Brave Booster Pack", gbpValue: 4.99 },
  { id: "mega-symphonia-booster-pack", name: "Mega Symphonia Booster Pack", gbpValue: 4.99 },
  { id: "mega-inferno-booster-pack", name: "Mega Inferno Booster Pack", gbpValue: 4.99 },
  { id: "mega-dream-booster-pack", name: "Mega Dream Booster Pack", gbpValue: 4.99 },
  { id: "nihil-zero-booster-pack", name: "Nihil Zero Booster Pack", gbpValue: 4.49 },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeCatalogId(name: string): string {
  return slugify(name);
}

function normalizeCatalog(items: StaffCatalogItem[]): StaffCatalogItem[] {
  return items
    .map((item) => ({
      id: makeCatalogId(item.id || item.name),
      name: item.name.trim(),
      gbpValue: Number(item.gbpValue),
    }))
    .filter((item) => item.name && Number.isFinite(item.gbpValue) && item.gbpValue > 0);
}

async function ensureCatalog(): Promise<void> {
  try {
    await fs.access(catalogPath);
  } catch {
    await fs.writeFile(catalogPath, `${JSON.stringify(defaultCatalog, null, 2)}\n`, "utf8");
  }
}

export async function readStaffCatalog(): Promise<StaffCatalogItem[]> {
  const raw = await readSupabaseKv(CATALOG_KEY);
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = JSON.parse(raw) as StaffCatalogItem[];
    return normalizeCatalog(parsed);
  }

  const seeded = normalizeCatalog(defaultCatalog);
  const seededRaw = JSON.stringify(seeded);
  const persisted = await writeSupabaseKv(CATALOG_KEY, seededRaw);
  if (persisted) return seeded;

  await ensureCatalog();
  const fileRaw = await fs.readFile(catalogPath, "utf8");
  const parsed = JSON.parse(fileRaw) as StaffCatalogItem[];
  return normalizeCatalog(parsed);
}

export async function writeStaffCatalog(items: StaffCatalogItem[]): Promise<void> {
  const normalized = normalizeCatalog(items);
  const persisted = await writeSupabaseKv(CATALOG_KEY, JSON.stringify(normalized));
  if (persisted) return;

  await fs.writeFile(catalogPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}
