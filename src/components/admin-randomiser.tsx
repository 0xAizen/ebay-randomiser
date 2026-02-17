"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CelebrationMode = "none" | "small" | "big";
type CSSVars = React.CSSProperties & { [key: `--${string}`]: string | number };

type SpinRecord = {
  auctionNumber: string;
  username: string;
  item: string;
  spunAt: string;
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

const CELEBRATION_TIMEOUT_MS = 2200;
const SPIN_DURATION_MS = 2000;
const REEL_TICK_MS = 70;

const confettiPieces = Array.from({ length: 44 }, (_, i) => ({
  id: i,
  left: (i * 17) % 100,
  delay: (i % 9) * 0.03,
  duration: 1.6 + (i % 5) * 0.15,
  drift: -160 + (i % 11) * 32,
  hue: (i * 33) % 360,
  rotation: (i % 2 === 0 ? 1 : -1) * (20 + (i % 6) * 13),
}));

function shuffleItems(items: string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isBigCelebrationItem(value: string): boolean {
  return /box|psa/i.test(value);
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

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

export default function AdminRandomiser() {
  const [allItems, setAllItems] = useState<string[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [currentDisplay, setCurrentDisplay] = useState<string>("Loading items...");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationMode>("none");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [publicOffline, setPublicOffline] = useState(false);
  const [testingMode, setTestingMode] = useState(false);
  const [spinHistory, setSpinHistory] = useState<SpinRecord[]>([]);
  const [lastSpinRecord, setLastSpinRecord] = useState<SpinRecord | null>(null);

  const [catalog, setCatalog] = useState<StaffCatalogItem[]>([]);
  const [catalogEdits, setCatalogEdits] = useState<Record<string, StaffCatalogEdit>>({});
  const [configText, setConfigText] = useState("");
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const [editorOpen, setEditorOpen] = useState(false);
  const [remainingOpen, setRemainingOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [spinPromptOpen, setSpinPromptOpen] = useState(false);
  const [spinPromptError, setSpinPromptError] = useState<string | null>(null);
  const [auctionInput, setAuctionInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");

  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemValue, setNewItemValue] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const applySpinState = useCallback((state: SpinActionResponse) => {
    setAllItems(state.items);
    setPool(state.pool);
    setSelectedItem(state.selectedItem);
    setCurrentDisplay(state.selectedItem ?? state.pool[0] ?? "Pool Empty");
    setPublicOffline(state.isOffline);
    setTestingMode(state.isTestingMode);
    setSpinHistory(state.history ?? []);
    setLastSpinRecord(state.lastSpin ?? null);
  }, []);

  const applyAdminState = useCallback(
    (state: SpinStatePayload) => {
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
        setCurrentDisplay("Failed to load data");
        setEditorError(error instanceof Error ? error.message : "Unable to load admin state.");
        setHasLoaded(true);
      }
    };

    load();
  }, [loadAdminState]);

  useEffect(() => {
    if (celebration === "none") return;
    const timeout = window.setTimeout(() => {
      setCelebration("none");
    }, CELEBRATION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [celebration]);

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
    setCelebration("none");
    setSelectedItem(null);

    const reelPool = pool.length > 0 ? pool : allItems;
    const interval = window.setInterval(() => {
      const rollingItem = reelPool[Math.floor(Math.random() * reelPool.length)];
      setCurrentDisplay(rollingItem);
    }, REEL_TICK_MS);

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

      const finishSpin = () => {
        window.clearInterval(interval);
        applySpinState(payload);
        const picked = payload.selectedItem;
        setCurrentDisplay(picked ?? payload.pool[0] ?? "Pool Empty");
        if (picked) {
          setCelebration(isBigCelebrationItem(picked) ? "big" : "small");
        }
        setIsSpinning(false);
      };

      window.setTimeout(finishSpin, SPIN_DURATION_MS);
    } catch (error) {
      window.clearInterval(interval);
      setSpinPromptError(error instanceof Error ? error.message : "Spin failed.");
      setSpinPromptOpen(true);
      setIsSpinning(false);
    }
  };

  const resetPool = async () => {
    if (allItems.length === 0 || isSpinning || isSaving) return;

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
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
      setCelebration("none");
      setEditorMessage("Pool reset on server.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to reset pool.");
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

      setEditorMessage(`Saved. Total items: ${payload.totalItems}`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to save config.");
    } finally {
      setIsSaving(false);
    }
  };

  const unlockOwnerControls = async () => {
    try {
      const response = await fetch("/api/staff-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verifyOwner", ownerPassword }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Owner unlock failed.");
      }

      setOwnerUnlocked(true);
      setEditorError(null);
      setEditorMessage("Owner controls unlocked.");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to unlock owner controls.");
    }
  };

  const addCatalogItem = async () => {
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
        body: JSON.stringify({ action: "add", ownerPassword, name, gbpValue }),
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

  const clearHistoryForUsers = async () => {
    if (isSpinning || isSaving) return;

    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearHistory" }),
      });

      const payload = (await response.json()) as SpinActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to clear history.");
      }

      applySpinState(payload);
      setEditorMessage("Public winner history cleared.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to clear history.");
    }
  };

  const toggleTestingMode = async () => {
    try {
      const response = await fetch("/api/spin-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setTestingMode",
          isTestingMode: !testingMode,
          ownerPassword,
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
    try {
      const response = await fetch("/api/staff-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", ownerPassword, id }),
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
        body: JSON.stringify({ action: "update", ownerPassword, id, name, gbpValue }),
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
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[1240px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/80 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur lg:px-8 lg:py-8">
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
          {lastSpinRecord && (
            <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Last: Auction {lastSpinRecord.auctionNumber} | @{lastSpinRecord.username} | {lastSpinRecord.item}
            </p>
          )}
        </header>

        <section className="my-6 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.35fr,1fr] lg:items-start">
          <div className="space-y-5">
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-4 py-8 text-center text-white shadow-inner">
              <div className={`slot-reel ${isSpinning ? "slot-reel-spinning" : ""}`}>{currentDisplay}</div>
              <div className="slot-gloss" />

              {celebration === "small" && <div className="small-burst" />}

              {celebration === "big" && (
                <div className="big-confetti" aria-hidden>
                  {confettiPieces.map((piece) => {
                    const style = {
                      left: `${piece.left}%`,
                      "--delay": `${piece.delay}s`,
                      "--duration": `${piece.duration}s`,
                      "--drift": `${piece.drift}px`,
                      "--hue": `${piece.hue}`,
                      "--rotation": `${piece.rotation}deg`,
                    } as CSSVars;

                    return <span key={piece.id} className="confetti-piece" style={style} />;
                  })}
                </div>
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
                  className="progress-fill h-full rounded-full bg-[linear-gradient(90deg,#14b8a6_0%,#0ea5e9_45%,#f59e0b_100%)]"
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
            <button
              onClick={() => {
                setSpinPromptError(null);
                setSpinPromptOpen(true);
              }}
              disabled={isSpinning || pool.length === 0 || !hasLoaded || isSaving}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#0369a1_100%)] px-4 py-4 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pool.length === 0 ? "Pool Empty" : isSpinning ? "Spinning..." : "Spin"}
            </button>

            <button
              onClick={togglePublicOffline}
              disabled={isSpinning || isSaving}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                publicOffline ? "bg-emerald-700 hover:bg-emerald-600" : "bg-rose-700 hover:bg-rose-600"
              }`}
            >
              {publicOffline ? "Go Live (Public)" : "Set Public Offline"}
            </button>

            <button
              onClick={resetPool}
              disabled={isSpinning || allItems.length === 0 || isSaving}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset Pool
            </button>

            <button
              onClick={clearHistoryForUsers}
              disabled={isSpinning || isSaving}
              className="w-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear Winner History
            </button>

            <button
              onClick={() => setEditorOpen((value) => !value)}
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {editorOpen ? "Hide Staff Editor" : "Open Staff Editor"}
            </button>

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
                  <div className="space-y-2">
                    {catalog.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr,92px,78px] items-center gap-2">
                        {ownerUnlocked ? (
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
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                        />
                        {ownerUnlocked ? (
                          <div className="space-y-1">
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

                <button
                  onClick={saveConfig}
                  disabled={isSaving || isSpinning || !hasUnsavedChanges || exceedsPoolLimit}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Pool Config" : "No Changes"}
                </button>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Owner Controls (List Edit)</p>
                  {!ownerUnlocked ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="password"
                        value={ownerPassword}
                        onChange={(event) => setOwnerPassword(event.target.value)}
                        placeholder="Owner password"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-sky-200 focus:ring"
                      />
                      <button
                        onClick={unlockOwnerControls}
                        type="button"
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white"
                      >
                        Unlock
                      </button>
                    </div>
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

      {spinPromptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Spin Details</h2>
            <p className="text-xs text-slate-600">Enter auction number and username before spinning.</p>

            <input
              value={auctionInput}
              onChange={(event) => setAuctionInput(event.target.value)}
              placeholder="Auction number"
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
    </div>
  );
}
