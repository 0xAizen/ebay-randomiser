"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpinRecord = {
  auctionNumber: string;
  username: string;
  item: string;
  spunAt: string;
  version: number;
};

type BuyersGiveawayState = {
  itemName: string;
  winnerUsername: string;
  sourceEntryCount: number;
  ranAt: string;
  version: number;
};

type SpinStatePayload = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
  isOffline: boolean;
  isTestingMode: boolean;
  totalCount: number;
  remainingCount: number;
  removedCount: number;
  progressPercent: number;
  lastSpin: SpinRecord | null;
  history: SpinRecord[];
  recentBulkResults: SpinRecord[];
  buyersGiveaway: BuyersGiveawayState | null;
  currentBuyersGiveawayItem: string | null;
  showObsBuyersGiveaway: boolean;
  lastAuditNote: string | null;
  isOwner: boolean;
  error?: string;
};

type SpinActionResponse = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
  isOffline: boolean;
  isTestingMode: boolean;
  lastSpin: SpinRecord | null;
  history: SpinRecord[];
  recentBulkResults: SpinRecord[];
  buyersGiveaway: BuyersGiveawayState | null;
  currentBuyersGiveawayItem: string | null;
  showObsBuyersGiveaway: boolean;
  lastAuditNote: string | null;
  isOwner?: boolean;
  bulkResults?: SpinRecord[];
  error?: string;
};

type ItemsConfigResponse = {
  configText: string;
  totalItems: number;
  expandedItems: string[];
  state?: SpinStatePayload;
  message?: string;
  error?: string;
};

type StaffCatalogItem = {
  id: string;
  name: string;
  gbpValue: number;
};

type StaffCatalogResponse = {
  items: StaffCatalogItem[];
  error?: string;
};

type StaffCatalogEdit = {
  name: string;
  gbpValue: string;
};
type CatalogTab = "all" | "boxes" | "slabs" | "cases" | "packs" | "other";
const GIVEAWAY_ROLL_MS = 2000;
const GIVEAWAY_TICK_MS = 90;
const MAIN_CARD_BG_IMAGE = "url('/main-card-bg.png')";

function shuffleItems(items: string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseQtyMap(configText: string, catalog: StaffCatalogItem[]): Record<string, string> {
  const lines = configText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const map = Object.fromEntries(catalog.map((item) => [item.name, ""])) as Record<string, string>;

  const lineRegex = /^(.*?)\s*-\s*QTY\s*(\d+)$/i;
  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;
    const name = match[1].trim();
    const qty = match[2];
    if (name in map) {
      map[name] = qty;
    }
  }

  return map;
}

function buildConfigTextFromQtys(catalog: StaffCatalogItem[], qtyMap: Record<string, string>): string {
  const lines: string[] = [];

  for (const item of catalog) {
    const raw = qtyMap[item.name]?.trim() ?? "";
    if (!raw) continue;
    const qty = Number(raw);
    if (!Number.isInteger(qty) || qty < 1) continue;
    lines.push(`${item.name} - QTY ${qty}`);
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function reconcileQtyMap(catalog: StaffCatalogItem[], currentMap: Record<string, string>): Record<string, string> {
  return Object.fromEntries(catalog.map((item) => [item.name, currentMap[item.name] ?? ""])) as Record<string, string>;
}

function reconcileCatalogEdits(catalog: StaffCatalogItem[], current: Record<string, StaffCatalogEdit>): Record<string, StaffCatalogEdit> {
  return Object.fromEntries(
    catalog.map((item) => [
      item.id,
      {
        name: current[item.id]?.name ?? item.name,
        gbpValue: current[item.id]?.gbpValue ?? String(item.gbpValue),
      },
    ]),
  ) as Record<string, StaffCatalogEdit>;
}

function parseCatalogCsv(text: string): Array<{ name: string; gbpValue: number; qty: number }> {
  const parseCsvRow = (line: string): string[] => {
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === "\"") {
        const next = line[i + 1];
        if (inQuotes && next === "\"") {
          current += "\"";
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (char === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cols.push(current.trim());
    return cols;
  };

  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\uFEFF/, "").trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row.");
  }

  const header = lines[0].toLowerCase();
  const isTwoColHeader = header === "name,gbp_value";
  const isThreeColHeader = header === "name,gbp_value,qty";
  if (!isTwoColHeader && !isThreeColHeader) {
    throw new Error("CSV header must be: name,gbp_value OR name,gbp_value,qty");
  }

  const rows: Array<{ name: string; gbpValue: number; qty: number }> = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length !== 2 && cols.length !== 3) {
      throw new Error(`CSV row ${i + 1} is invalid. Expected: name,gbp_value[,qty]`);
    }

    const name = cols[0];
    const gbpValue = Number(cols[1]);
    const qtyRaw = cols[2] ?? "";
    const qty = qtyRaw === "" ? 0 : Number(qtyRaw);

    if (!name) {
      throw new Error(`CSV row ${i + 1} has empty name.`);
    }
    if (!Number.isFinite(gbpValue) || gbpValue <= 0) {
      throw new Error(`CSV row ${i + 1} has invalid gbp_value.`);
    }
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error(`CSV row ${i + 1} has invalid qty.`);
    }

    rows.push({ name, gbpValue, qty });
  }

  return rows;
}

function escapeCsvValue(value: string): string {
  const needsQuotes = /[",\n]/.test(value);
  const safe = value.replace(/"/g, "\"\"");
  return needsQuotes ? `"${safe}"` : safe;
}

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

export default function AdminRandomiser() {
  const [allItems, setAllItems] = useState<string[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [publicOffline, setPublicOffline] = useState(false);
  const [testingMode, setTestingMode] = useState(false);
  const [spinHistory, setSpinHistory] = useState<SpinRecord[]>([]);
  const [lastSpinRecord, setLastSpinRecord] = useState<SpinRecord | null>(null);
  const [recentBulkResults, setRecentBulkResults] = useState<SpinRecord[]>([]);
  const [buyersGiveaway, setBuyersGiveaway] = useState<BuyersGiveawayState | null>(null);
  const [currentBuyersGiveawayItem, setCurrentBuyersGiveawayItem] = useState<string | null>(null);
  const [showObsBuyersGiveaway, setShowObsBuyersGiveaway] = useState(true);
  const [lastAuditNote, setLastAuditNote] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isGiveawayRolling, setIsGiveawayRolling] = useState(false);
  const [giveawayDisplayUser, setGiveawayDisplayUser] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<StaffCatalogItem[]>([]);
  const [catalogEdits, setCatalogEdits] = useState<Record<string, StaffCatalogEdit>>({});
  const [configText, setConfigText] = useState("");
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [remainingOpen, setRemainingOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [spinPromptOpen, setSpinPromptOpen] = useState(false);
  const [spinPromptError, setSpinPromptError] = useState<string | null>(null);
  const [bulkPromptOpen, setBulkPromptOpen] = useState(false);
  const [bulkPromptError, setBulkPromptError] = useState<string | null>(null);
  const [bulkCountInput, setBulkCountInput] = useState("10");
  const [giveawayPromptOpen, setGiveawayPromptOpen] = useState(false);
  const [giveawayPromptError, setGiveawayPromptError] = useState<string | null>(null);
  const [buyersGiveawayItemName, setBuyersGiveawayItemName] = useState("");
  const [auctionInput, setAuctionInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");

  const [newItemName, setNewItemName] = useState("");
  const [newItemValue, setNewItemValue] = useState("");
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const giveawayVersionRef = useRef<number | null>(null);
  const auctionSeededRef = useRef(false);

  const getNextAuctionNumber = useCallback((lastSpin: SpinRecord | null) => {
    const raw = lastSpin?.auctionNumber?.trim() ?? "";
    if (!/^\d+$/.test(raw)) return "1";
    const numeric = Number(raw);
    if (!Number.isInteger(numeric) || numeric < 1) return "1";
    return String(numeric + 1);
  }, []);

  const applySpinState = useCallback((state: SpinActionResponse) => {
    setAllItems(state.items);
    setPool(state.pool);
    setSelectedItem(state.selectedItem);
    setPublicOffline(state.isOffline);
    setTestingMode(state.isTestingMode);
    setSpinHistory(state.history ?? []);
    setLastSpinRecord(state.lastSpin ?? null);
    setRecentBulkResults(state.recentBulkResults ?? []);
    setBuyersGiveaway(state.buyersGiveaway ?? null);
    setCurrentBuyersGiveawayItem(state.currentBuyersGiveawayItem ?? null);
    setShowObsBuyersGiveaway((current) => state.showObsBuyersGiveaway ?? current);
    setLastAuditNote(state.lastAuditNote ?? null);
    if (!auctionSeededRef.current) {
      setAuctionInput(getNextAuctionNumber(state.lastSpin ?? null));
      auctionSeededRef.current = true;
    }
  }, [getNextAuctionNumber]);

  const applyAdminState = useCallback(
    (state: SpinStatePayload) => {
      setIsOwner(state.isOwner ?? false);
      applySpinState(state);
    },
    [applySpinState],
  );

  const loadAdminState = useCallback(async () => {
    const response = await fetch("/api/spin-state/admin", { cache: "no-store" });

    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }

    const payload = (await response.json()) as SpinStatePayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load spin state.");
    }

    applyAdminState(payload);
  }, [applyAdminState]);

  useEffect(() => {
    const load = async () => {
      try {
        await loadAdminState();

        const [configResponse, catalogResponse] = await Promise.all([
          fetch("/api/items-config", { cache: "no-store" }),
          fetch("/api/staff-catalog", { cache: "no-store" }),
        ]);

        if (configResponse.status === 401 || catalogResponse.status === 401) {
          window.location.assign("/admin/login");
          return;
        }

        const configPayload = (await configResponse.json()) as ItemsConfigResponse;
        const catalogPayload = (await catalogResponse.json()) as StaffCatalogResponse;

        if (!configResponse.ok) {
          throw new Error(configPayload.error ?? "Failed to load item config.");
        }
        if (!catalogResponse.ok) {
          throw new Error(catalogPayload.error ?? "Failed to load staff catalog.");
        }

        const items = catalogPayload.items ?? [];
        setCatalog(items);
        setCatalogEdits(reconcileCatalogEdits(items, {}));
        setConfigText(configPayload.configText);
        setQtyDraft(parseQtyMap(configPayload.configText, items));
        setHasLoaded(true);
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : "Unable to load admin state.");
        setHasLoaded(true);
      }
    };

    load();
  }, [loadAdminState]);

  useEffect(() => {
    if (!buyersGiveaway) {
      setIsGiveawayRolling(false);
      setGiveawayDisplayUser(null);
      giveawayVersionRef.current = null;
      return;
    }

    const previousVersion = giveawayVersionRef.current;
    giveawayVersionRef.current = buyersGiveaway.version;

    if (previousVersion === null || buyersGiveaway.version <= previousVersion) {
      setGiveawayDisplayUser(buyersGiveaway.winnerUsername);
      return;
    }

    const names = spinHistory.map((entry) => entry.username).filter(Boolean);
    if (names.length === 0) {
      setGiveawayDisplayUser(buyersGiveaway.winnerUsername);
      return;
    }

    setIsGiveawayRolling(true);
    const interval = window.setInterval(() => {
      const randomName = names[Math.floor(Math.random() * names.length)];
      setGiveawayDisplayUser(randomName);
    }, GIVEAWAY_TICK_MS);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setGiveawayDisplayUser(buyersGiveaway.winnerUsername);
      setIsGiveawayRolling(false);
    }, GIVEAWAY_ROLL_MS);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [buyersGiveaway, spinHistory]);

  const removedCount = allItems.length - pool.length;
  const progressPercent = useMemo(() => {
    if (allItems.length === 0) return 0;
    return (removedCount / allItems.length) * 100;
  }, [allItems.length, removedCount]);
  const shuffledRemaining = useMemo(() => shuffleItems(pool), [pool]);

  const generatedConfigText = useMemo(() => buildConfigTextFromQtys(catalog, qtyDraft), [catalog, qtyDraft]);
  const normalizedSaved = configText.replace(/\r\n/g, "\n").trim();
  const normalizedDraft = generatedConfigText.trim();
  const hasUnsavedChanges = normalizedSaved !== normalizedDraft;

  const poolTotals = useMemo(() => {
    let totalQty = 0;
    let totalValue = 0;
    let adjustedValue = 0;

    for (const item of catalog) {
      const qty = Number(qtyDraft[item.name] ?? "0");
      if (!Number.isInteger(qty) || qty < 1) continue;
      totalQty += qty;
      totalValue += qty * item.gbpValue;
      const multiplier = item.name.toUpperCase().includes("PSA") ? 1.4 : 2;
      adjustedValue += qty * item.gbpValue * multiplier;
    }

    const startPrice = totalQty > 0 ? Math.ceil(adjustedValue / totalQty) : 0;
    return { totalQty, totalValue, adjustedValue, startPrice };
  }, [catalog, qtyDraft]);
  const exceedsPoolLimit = poolTotals.totalQty > 500;
  const filteredCatalog = useMemo(() => {
    if (catalogTab === "all") return catalog;
    if (catalogTab === "boxes") return catalog.filter((item) => /booster\s+box/i.test(item.name));
    if (catalogTab === "slabs") return catalog.filter((item) => /slab|psa/i.test(item.name));
    if (catalogTab === "cases") return catalog.filter((item) => /case/i.test(item.name));
    if (catalogTab === "packs") return catalog.filter((item) => /pack/i.test(item.name));
    return catalog.filter(
      (item) => !/booster\s+box|slab|psa|case|pack/i.test(item.name),
    );
  }, [catalog, catalogTab]);

  const setAllQtyToOne = () => {
    const next = Object.fromEntries(catalog.map((item) => [item.name, "1"])) as Record<string, string>;
    setQtyDraft(next);
    setEditorMessage("All item quantities set to 1 (not saved yet).");
    setEditorError(null);
  };

  const spin = async () => {
    if (isSpinning || pool.length === 0 || isSaving) return;

    const auctionNumber = auctionInput.trim();
    const username = usernameInput.trim();

    if (!auctionNumber || !username) {
      setSpinPromptError("Auction number and username are required before spinning.");
      return;
    }

    setSpinPromptError(null);
    setIsSpinning(true);
    setSelectedItem(null);

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "spin", auctionNumber, username }),
      });

      const payload = (await response.json()) as SpinActionResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Spin failed.");
      }

      setSpinPromptOpen(false);
      setAuctionInput(getNextAuctionNumber(payload.lastSpin ?? null));
      applySpinState(payload);
      setIsSpinning(false);
    } catch (error) {
      setSpinPromptError(error instanceof Error ? error.message : "Spin failed.");
      setSpinPromptOpen(true);
      setIsSpinning(false);
    }
  };

  const bulkSpin = async () => {
    if (isSpinning || pool.length === 0 || isSaving) return;

    const auctionNumber = auctionInput.trim();
    const username = usernameInput.trim();
    const count = Number(bulkCountInput.trim());

    if (!auctionNumber || !username) {
      setBulkPromptError("Auction number and username are required before bulk spin.");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      setBulkPromptError("Bulk spin count must be a whole number between 1 and 10.");
      return;
    }

    setBulkPromptError(null);
    setIsSpinning(true);
    setSelectedItem(null);
    setBulkPromptOpen(false);

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkSpin",
          auctionNumber,
          username,
          bulkCount: count,
        }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Bulk spin failed.");
      }

      const results = payload.bulkResults ?? [];
      setRecentBulkResults(results);
      if (results.length === 0) {
        setIsSpinning(false);
        return;
      }

      applySpinState(payload);
      setAuctionInput(getNextAuctionNumber(payload.lastSpin ?? null));
      setIsSpinning(false);
    } catch (error) {
      setBulkPromptError(error instanceof Error ? error.message : "Bulk spin failed.");
      setBulkPromptOpen(true);
      setIsSpinning(false);
    }
  };

  const resetPool = async () => {
    if (allItems.length === 0 || isSpinning || isSaving) return;
    const confirmed = window.confirm(
      "Are you sure you want to reset the pool and clear all spin history? This cannot be undone.",
    );
    if (!confirmed) return;

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetPoolAndHistory" }),
      });

      const payload = (await response.json()) as SpinActionResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Reset failed.");
      }

      applySpinState(payload);
      setRecentBulkResults([]);
      auctionSeededRef.current = true;
      setAuctionInput("1");
      setEditorMessage("Pool reset and winner history cleared.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to reset pool and clear history.");
    }
  };

  const togglePublicOffline = async () => {
    if (isSpinning || isSaving) return;

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setOffline", isOffline: !publicOffline }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update public status.");
      }

      applySpinState(payload);
      setEditorMessage(payload.isOffline ? "Public page is now offline." : "Public page is now live.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to change public status.");
    }
  };

  const toggleObsBuyersGiveawayVisibility = async () => {
    if (isSpinning || isSaving) return;
    const nextVisibility = !showObsBuyersGiveaway;

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setObsBuyersGiveawayVisibility",
          showObsBuyersGiveaway: nextVisibility,
        }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update OBS buyer giveaway visibility.");
      }

      applySpinState(payload);
      const resolvedVisibility = payload.showObsBuyersGiveaway ?? nextVisibility;
      setShowObsBuyersGiveaway(resolvedVisibility);
      setEditorMessage(resolvedVisibility ? "OBS buyer giveaway section is now visible." : "OBS buyer giveaway section is now hidden.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to update OBS buyer giveaway visibility.");
    }
  };

  const saveConfig = async () => {
    if (isSaving || isSpinning) return;

    if (!generatedConfigText.trim()) {
      setEditorError("Set at least one quantity above 0 before saving.");
      return;
    }

    if (exceedsPoolLimit) {
      setEditorError("Pool size cannot exceed 500 items.");
      return;
    }

    setEditorError(null);
    setEditorMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/items-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configText: generatedConfigText }),
      });

      const payload = (await response.json()) as ItemsConfigResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !payload.expandedItems) {
        throw new Error(payload.error ?? "Failed to save config.");
      }

      setConfigText(payload.configText);

      if (payload.state) {
        applyAdminState(payload.state);
      } else {
        await loadAdminState();
      }

      setEditorMessage(payload.message ?? `Saved. Total items: ${payload.totalItems}`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to save config.");
    } finally {
      setIsSaving(false);
    }
  };

  const addCatalogItem = async () => {
    if (!isOwner) {
      setEditorError("Only owner account can add catalog items.");
      return;
    }
    const name = newItemName.trim();
    const gbpValue = Number(newItemValue);

    if (!name) {
      setEditorError("New item name is required.");
      return;
    }

    if (!Number.isFinite(gbpValue) || gbpValue <= 0) {
      setEditorError("Enter a valid GBP value for the new item.");
      return;
    }

    try {
      const response = await fetch("/api/staff-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name, gbpValue }),
      });

      const payload = (await response.json()) as StaffCatalogResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to add item.");
      }

      const items = payload.items ?? [];
      setCatalog(items);
      setQtyDraft((current) => reconcileQtyMap(items, current));
      setCatalogEdits((current) => reconcileCatalogEdits(items, current));
      setNewItemName("");
      setNewItemValue("");
      setEditorMessage(`Added catalog item: ${name}`);
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to add item.");
    }
  };

  const downloadCatalogCsv = () => {
    const lines = [
      "name,gbp_value,qty",
      ...catalog.map((item) => {
        const qty = Number(qtyDraft[item.name] ?? "0");
        const normalizedQty = Number.isInteger(qty) && qty > 0 ? qty : 0;
        return `${escapeCsvValue(item.name)},${item.gbpValue},${normalizedQty}`;
      }),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "staff-catalog.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadSpinLogCsv = () => {
    const lines = [
      "auction_number,username,item,spun_at,version",
      ...spinHistory.map((record) =>
        [
          escapeCsvValue(record.auctionNumber),
          escapeCsvValue(record.username),
          escapeCsvValue(record.item),
          escapeCsvValue(record.spunAt),
          String(record.version),
        ].join(","),
      ),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "spin-log.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCatalogCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!isOwner) {
      setEditorError("Owner access is required for CSV import.");
      return;
    }

    setIsImportingCsv(true);
    setEditorError(null);
    setEditorMessage(null);

    try {
      const text = await file.text();
      const rows = parseCatalogCsv(text);
      const seen = new Set<string>();

      for (const row of rows) {
        const lowerName = row.name.toLowerCase();
        if (seen.has(lowerName)) {
          throw new Error(`Duplicate CSV name detected: ${row.name}`);
        }
        seen.add(lowerName);
      }
      const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
      if (totalQty > 500) {
        throw new Error("CSV qty total exceeds 500.");
      }

      // Safety-first import: clear all existing items, then add only CSV rows.
      const currentCatalogResponse = await fetch("/api/staff-catalog", { cache: "no-store" });
      const currentCatalogPayload = (await currentCatalogResponse.json()) as StaffCatalogResponse;
      if (!currentCatalogResponse.ok) {
        throw new Error(currentCatalogPayload.error ?? "Failed to load current catalog before import.");
      }

      for (const item of currentCatalogPayload.items ?? []) {
        const response = await fetch("/api/staff-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "remove",
            id: item.id,
          }),
        });
        const payload = (await response.json()) as StaffCatalogResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? `Failed to remove ${item.name}`);
        }
      }

      for (const row of rows) {
        const response = await fetch("/api/staff-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            name: row.name,
            gbpValue: row.gbpValue,
          }),
        });

        const payload = (await response.json()) as StaffCatalogResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? `Failed to add ${row.name}`);
        }
      }

      const finalCatalogResponse = await fetch("/api/staff-catalog", { cache: "no-store" });
      const finalPayload = (await finalCatalogResponse.json()) as StaffCatalogResponse;
      if (!finalCatalogResponse.ok) {
        throw new Error(finalPayload.error ?? "Failed to finalize catalog import.");
      }

      const finalItems = finalPayload.items ?? [];
      setCatalog(finalItems);
      setCatalogEdits((current) => reconcileCatalogEdits(finalItems, current));
      setQtyDraft(() => {
        const byName = new Map(rows.map((row) => [row.name.toLowerCase(), row.qty]));
        return Object.fromEntries(
          finalItems.map((item) => {
            const qty = byName.get(item.name.toLowerCase()) ?? 0;
            return [item.name, qty > 0 ? String(qty) : ""];
          }),
        ) as Record<string, string>;
      });
      setEditorMessage(`CSV imported successfully (${finalItems.length} catalog items).`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "CSV import failed.");
    } finally {
      setIsImportingCsv(false);
    }
  };

  const setCurrentBuyersGiveaway = async () => {
    const itemName = buyersGiveawayItemName.trim();
    if (!itemName) {
      setGiveawayPromptError("Buyer's giveaway item name is required.");
      return;
    }

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setCurrentBuyersGiveawayItem", giveawayItemName: itemName }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to set buyer's giveaway item.");
      }

      applySpinState(payload);
      setGiveawayPromptError(null);
      setGiveawayPromptOpen(false);
      setEditorMessage("Current buyer's giveaway item updated.");
      setEditorError(null);
    } catch (error) {
      setGiveawayPromptError(error instanceof Error ? error.message : "Unable to set buyer's giveaway item.");
    }
  };

  const runBuyersGiveawayNow = async () => {
    if (!currentBuyersGiveawayItem) {
      setBuyersGiveawayItemName("");
      setGiveawayPromptError("Set a buyer's giveaway item before running the draw.");
      setGiveawayPromptOpen(true);
      return;
    }

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runBuyersGiveaway" }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to run buyer's giveaway.");
      }

      applySpinState(payload);
      setGiveawayPromptError(null);
      setEditorMessage("Buyer's giveaway winner selected. Set a new giveaway item for the next draw.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to run buyer's giveaway.");
    }
  };

  const toggleTestingMode = async () => {
    if (!isOwner) {
      setEditorError("Only owner account can change testing mode.");
      return;
    }
    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setTestingMode",
          isTestingMode: !testingMode,
        }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update testing mode.");
      }

      applySpinState(payload);
      setEditorMessage(payload.isTestingMode ? "Testing mode enabled." : "Testing mode disabled.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to change testing mode.");
    }
  };

  const removeCatalogItem = async (id: string) => {
    if (!isOwner) {
      setEditorError("Only owner account can remove catalog items.");
      return;
    }
    try {
      const response = await fetch("/api/staff-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });

      const payload = (await response.json()) as StaffCatalogResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to remove item.");
      }

      const items = payload.items ?? [];
      setCatalog(items);
      setQtyDraft((current) => reconcileQtyMap(items, current));
      setCatalogEdits((current) => reconcileCatalogEdits(items, current));
      setEditorMessage("Catalog item removed.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to remove item.");
    }
  };

  const updateCatalogItem = async (id: string) => {
    if (!isOwner) {
      setEditorError("Only owner account can update catalog items.");
      return;
    }
    const draft = catalogEdits[id];
    if (!draft) return;

    const name = draft.name.trim();
    const gbpValue = Number(draft.gbpValue);

    if (!name) {
      setEditorError("Catalog item name cannot be empty.");
      return;
    }
    if (!Number.isFinite(gbpValue) || gbpValue <= 0) {
      setEditorError("Catalog GBP value must be greater than 0.");
      return;
    }

    const previousName = catalog.find((item) => item.id === id)?.name ?? "";

    try {
      const response = await fetch("/api/staff-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, name, gbpValue }),
      });

      const payload = (await response.json()) as StaffCatalogResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update item.");
      }

      const items = payload.items ?? [];
      setCatalog(items);
      setCatalogEdits((current) => reconcileCatalogEdits(items, current));
      setQtyDraft((current) => {
        const next = reconcileQtyMap(items, current);
        if (previousName && previousName !== name) {
          const previousQty = current[previousName];
          if (previousQty && !next[name]) {
            next[name] = previousQty;
          }
        }
        return next;
      });
      setEditorMessage("Catalog item updated.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to update item.");
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#ffd9b8,transparent_45%),radial-gradient(circle_at_80%_0%,#c7ffd9,transparent_40%),linear-gradient(180deg,#fef6ea_0%,#ecf8ff_100%)] p-3 text-slate-900 lg:p-6">
      <main
        className="mx-auto flex min-h-[95dvh] w-full max-w-[1240px] flex-col overflow-hidden rounded-[28px] border border-white/70 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur lg:px-8 lg:py-8"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.78)), ${MAIN_CARD_BG_IMAGE}`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <header>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ebay Randomiser Admin</p>
            <button
              onClick={logout}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
          <h1 className="mt-2 text-2xl font-black leading-tight text-slate-900">Spin The Pool</h1>
          <p className="mt-2 text-sm text-slate-600">Protected controls for staff only.</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Public Status: {publicOffline ? "Offline" : "Live"}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Mode: {testingMode ? "Testing (Duplicate Auctions Allowed)" : "Staff (Unique Auctions Required)"}
          </p>
          {lastAuditNote && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Audit: {lastAuditNote}
            </p>
          )}
          {lastSpinRecord && (
            <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Last: Auction {lastSpinRecord.auctionNumber} | @{lastSpinRecord.username} | {lastSpinRecord.item}
            </p>
          )}
          {recentBulkResults.length > 0 && (
            <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
              <p className="font-semibold uppercase tracking-[0.1em]">Last Bulk Spin Results</p>
              <ul className="mt-1 space-y-1">
                {recentBulkResults.map((record) => (
                  <li key={`${record.version}-${record.spunAt}`}>
                    Auction {record.auctionNumber} | @{record.username} | {record.item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </header>

        <section className="my-6 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.35fr,1fr] lg:items-start">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Latest Result</p>
              <p className="mt-2 text-xl font-black text-white">{selectedItem ?? "Waiting for first spin..."}</p>
              {lastSpinRecord && (
                <p className="mt-2 text-xs text-slate-300">
                  Auction {lastSpinRecord.auctionNumber} | @{lastSpinRecord.username}
                </p>
              )}
            </div>

            <div className="w-full">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                <span>Pool Progress</span>
                <span>
                  {removedCount}/{allItems.length}
                </span>
              </div>

              <div className="h-6 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-100">
                <div
                  className="progress-fill h-full rounded-full bg-[linear-gradient(90deg,#ef4444_0%,#dc2626_50%,#991b1b_100%)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {selectedItem && (
              <p className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                Selected: {selectedItem}
              </p>
            )}
          </div>

          <aside className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              <button
                onClick={() => {
                  setSpinPromptError(null);
                  setSpinPromptOpen(true);
                }}
                disabled={isSpinning || pool.length === 0 || !hasLoaded || isSaving}
                className="rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#0369a1_100%)] px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pool.length === 0 ? "Pool Empty" : isSpinning ? "Spinning..." : "Spin"}
              </button>

              <button
                onClick={() => {
                  setBulkPromptError(null);
                  setBulkPromptOpen(true);
                }}
                disabled={isSpinning || pool.length === 0 || !hasLoaded || isSaving}
                className="rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bulk Spin
              </button>

              <button
                onClick={() => {
                  setBuyersGiveawayItemName(currentBuyersGiveawayItem ?? "");
                  setGiveawayPromptError(null);
                  setGiveawayPromptOpen(true);
                }}
                disabled={isSpinning || isSaving}
                className="rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Set Buyer&apos;s Giveaway
              </button>

              <button
                onClick={runBuyersGiveawayNow}
                disabled={isSpinning || isSaving}
                className="rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run Buyer&apos;s Giveaway
              </button>

              <button
                onClick={togglePublicOffline}
                disabled={isSpinning || isSaving}
                className={`rounded-2xl px-4 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  publicOffline ? "bg-emerald-700 hover:bg-emerald-600" : "bg-rose-700 hover:bg-rose-600"
                }`}
              >
                {publicOffline ? "Go Live (Public)" : "Set Public Offline"}
              </button>

              <button
                onClick={toggleObsBuyersGiveawayVisibility}
                disabled={isSpinning || isSaving}
                className={`rounded-2xl px-4 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  showObsBuyersGiveaway ? "bg-amber-700 hover:bg-amber-600" : "bg-emerald-700 hover:bg-emerald-600"
                }`}
              >
                {showObsBuyersGiveaway ? "Hide OBS Giveaway Section" : "Show OBS Giveaway Section"}
              </button>

              <button
                onClick={resetPool}
                disabled={isSpinning || allItems.length === 0 || isSaving}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Pool + Clear History
              </button>

              <button
                onClick={() => setEditorOpen((value) => !value)}
                className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {editorOpen ? "Hide Staff Editor" : "Open Staff Editor"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setRemainingOpen((value) => !value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {remainingOpen ? "Hide Remaining Items" : "View Remaining Items"}
              </button>

              <button
                onClick={() => setHistoryOpen((value) => !value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {historyOpen ? "Hide Spin Log" : "View Spin Log"}
              </button>

              <button
                onClick={downloadSpinLogCsv}
                disabled={spinHistory.length === 0}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download Spin CSV
              </button>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Buyer&apos;s Giveaway (Staff View)</p>
              <p className="mt-1 text-xs text-indigo-800">
                Current Item: {currentBuyersGiveawayItem ? currentBuyersGiveawayItem : "Not set"}
              </p>
              {buyersGiveaway ? (
                <>
                  <p className={`mt-1 text-sm font-semibold text-indigo-900 ${isGiveawayRolling ? "animate-pulse" : ""}`}>
                    @{giveawayDisplayUser ?? buyersGiveaway.winnerUsername}
                  </p>
                  <p className="text-xs text-indigo-800">{buyersGiveaway.itemName}</p>
                  {isGiveawayRolling && (
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-indigo-600">Drawing...</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-indigo-700">No buyer&apos;s giveaway run yet.</p>
              )}
            </div>

            {historyOpen && (
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-300 bg-slate-50 p-3 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recent Spins</p>
                <ul className="space-y-2 text-sm text-slate-700">
                  {spinHistory.length === 0 && <li>No spins yet.</li>}
                  {spinHistory.map((record) => (
                    <li key={`${record.version}-${record.spunAt}`}>
                      Auction {record.auctionNumber} | @{record.username} | {record.item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {remainingOpen && (
              <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-300 bg-slate-50 p-3 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Remaining Pool</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {shuffledRemaining.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {editorOpen && (
              <div className="space-y-3 rounded-2xl border border-slate-300 bg-white p-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pool Maths (Staff Only)</p>
                  <p className="mt-1 text-sm text-slate-700">Total Pool Qty: {poolTotals.totalQty}</p>
                  <p className="mt-1 text-sm text-slate-700">Total Pool GBP: {gbp.format(poolTotals.totalValue)}</p>
                  <p className="mt-1 text-sm text-slate-700">Weighted Pool GBP: {gbp.format(poolTotals.adjustedValue)}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    Auction Start Price: {gbp.format(poolTotals.startPrice)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Formula: Sum(item GBP x qty x multiplier) / total qty, where multiplier is 1.4 for names containing PSA, otherwise 2.
                  </p>
                  {exceedsPoolLimit && (
                    <p className="mt-2 text-xs font-semibold text-rose-700">Pool limit exceeded. Max 500 items allowed.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Staff Item List (Catalog Only)</p>
                  <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                    {[
                      { id: "all", label: "All" },
                      { id: "boxes", label: "Boxes" },
                      { id: "slabs", label: "Slabs" },
                      { id: "cases", label: "Cases" },
                      { id: "packs", label: "Packs" },
                      { id: "other", label: "Other" },
                    ].map((tab) => {
                      const active = catalogTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setCatalogTab(tab.id as CatalogTab)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${
                            active
                              ? "bg-slate-900 text-white"
                              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="max-h-[520px] overflow-y-auto pr-1">
                    {filteredCatalog.length === 0 && (
                      <p className="text-xs text-slate-500">No items in this category.</p>
                    )}
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
                      {filteredCatalog.map((item) => (
                        <div key={item.id} className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-2">
                          {isOwner ? (
                            <div className="space-y-1">
                              <input
                                value={catalogEdits[item.id]?.name ?? item.name}
                                onChange={(event) =>
                                  setCatalogEdits((current) => ({
                                    ...current,
                                    [item.id]: {
                                      name: event.target.value,
                                      gbpValue: current[item.id]?.gbpValue ?? String(item.gbpValue),
                                    },
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                              />
                              <input
                                type="number"
                                min={0.01}
                                step={0.01}
                                value={catalogEdits[item.id]?.gbpValue ?? String(item.gbpValue)}
                                onChange={(event) =>
                                  setCatalogEdits((current) => ({
                                    ...current,
                                    [item.id]: {
                                      name: current[item.id]?.name ?? item.name,
                                      gbpValue: event.target.value,
                                    },
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                              />
                            </div>
                          ) : (
                            <div>
                              <p className="truncate text-xs font-semibold text-slate-700">{item.name}</p>
                              <p className="text-[11px] text-slate-500">{gbp.format(item.gbpValue)}</p>
                            </div>
                          )}
                          <input
                            type="number"
                            min={0}
                            value={qtyDraft[item.name] ?? ""}
                            onChange={(event) =>
                              setQtyDraft((current) => ({
                                ...current,
                                [item.name]: event.target.value,
                              }))
                            }
                            placeholder="Qty"
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                          />
                          {isOwner ? (
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                type="button"
                                onClick={() => updateCatalogItem(item.id)}
                                className="w-full rounded-lg border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => removeCatalogItem(item.id)}
                                className="w-full rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div className="text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Locked</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveConfig}
                  disabled={isSaving || isSpinning || !hasUnsavedChanges || exceedsPoolLimit}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Pool Config" : "No Changes"}
                </button>

                <button
                  type="button"
                  onClick={setAllQtyToOne}
                  disabled={isSaving || isSpinning || catalog.length === 0}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Set All Quantities To 1
                </button>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Owner Controls (List Edit)</p>
                  {!isOwner ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Owner-only controls are locked for this account. Sign in with zian@pokebabsi.com to edit catalog and testing mode.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-emerald-700">Unlocked. You can add/remove catalog items.</p>
                      <button
                        type="button"
                        onClick={toggleTestingMode}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-white ${
                          testingMode ? "bg-emerald-700 hover:bg-emerald-600" : "bg-slate-900 hover:bg-slate-800"
                        }`}
                      >
                        {testingMode ? "Disable Testing Mode" : "Enable Testing Mode"}
                      </button>
                      <button
                        type="button"
                        onClick={downloadCatalogCsv}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Download Catalog CSV
                      </button>
                      <label className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100">
                        {isImportingCsv ? "Importing CSV..." : "Import Catalog CSV"}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={importCatalogCsv}
                          disabled={isImportingCsv}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[11px] text-slate-500">CSV format: name,gbp_value,qty (qty optional)</p>
                      <input
                        value={newItemName}
                        onChange={(event) => setNewItemName(event.target.value)}
                        placeholder="New item name"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={newItemValue}
                          onChange={(event) => setNewItemValue(event.target.value)}
                          placeholder="GBP value"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                        />
                        <button
                          onClick={addCatalogItem}
                          type="button"
                          className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white"
                        >
                          Add Item
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {editorMessage && <p className="text-xs font-semibold text-emerald-700">{editorMessage}</p>}
                {editorError && <p className="text-xs font-semibold text-rose-700">{editorError}</p>}
              </div>
            )}

            <p className="text-center text-xs text-slate-500">Remaining items: {pool.length}</p>
          </aside>
        </section>
      </main>

      {giveawayPromptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Set Buyer&apos;s Giveaway</h2>
            <p className="text-xs text-slate-600">Set the current buyer&apos;s giveaway item shown to staff and buyers.</p>

            <input
              value={buyersGiveawayItemName}
              onChange={(event) => setBuyersGiveawayItemName(event.target.value)}
              placeholder="Buyer&apos;s giveaway item name"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setGiveawayPromptOpen(false);
                  setGiveawayPromptError(null);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={setCurrentBuyersGiveaway}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
              >
                Save Giveaway Item
              </button>
            </div>

            {giveawayPromptError && <p className="text-xs font-semibold text-rose-700">{giveawayPromptError}</p>}
          </div>
        </div>
      )}

      {spinPromptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Spin Details</h2>
            <p className="text-xs text-slate-600">Enter auction number and username before spinning.</p>

            <input
              value={auctionInput}
              onChange={(event) => setAuctionInput(event.target.value)}
              placeholder="Auction number"
              inputMode="numeric"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
            />

            <input
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="Username"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSpinPromptOpen(false);
                  setSpinPromptError(null);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={spin}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
              >
                Start Spin
              </button>
            </div>

            {spinPromptError && <p className="text-xs font-semibold text-rose-700">{spinPromptError}</p>}
          </div>
        </div>
      )}

      {bulkPromptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Bulk Spin</h2>
            <p className="text-xs text-slate-600">Spin up to 10 times consecutively using one starting auction number.</p>

            <input
              value={auctionInput}
              onChange={(event) => setAuctionInput(event.target.value)}
              placeholder="Starting auction number"
              inputMode="numeric"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
            />

            <input
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="Username"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
            />

            <input
              value={bulkCountInput}
              onChange={(event) => setBulkCountInput(event.target.value)}
              placeholder="Spin count (1-10)"
              inputMode="numeric"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBulkPromptOpen(false);
                  setBulkPromptError(null);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={bulkSpin}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
              >
                Start Bulk Spin
              </button>
            </div>

            {bulkPromptError && <p className="text-xs font-semibold text-rose-700">{bulkPromptError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
