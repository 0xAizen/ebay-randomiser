"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type SpinStateResponse = {
  isOffline: boolean;
  buyersGiveaway: BuyersGiveawayState | null;
  currentBuyersGiveawayItem: string | null;
  selectedItem: string | null;
  lastSpin: SpinRecord | null;
  history: SpinRecord[];
  recentBulkResults: SpinRecord[];
  totalCount: number;
  remainingCount: number;
  removedCount: number;
  progressPercent: number;
  version: number;
  updatedAt: string;
  reelItems: string[];
  remainingItems: string[];
  error?: string;
};

type ReelTrack = {
  rows: string[];
  finalOffset: number;
};

type SettledRows = {
  top: string;
  center: string;
  bottom: string;
};

type CelebrationMode = "none" | "small" | "big";
type CSSVars = React.CSSProperties & { [key: `--${string}`]: string | number };
type RemainingTab = "all" | "packs" | "boxes" | "slabs";

const SPIN_DURATION_MS = 2000;
const HIT_BOUNCE_MS = 520;
const POLL_INTERVAL_MS = 2000;
const CELEBRATION_TIMEOUT_MS = 2200;
const OFFLINE_MESSAGE = "Pokebabsi is currently offline";
const GIVEAWAY_ROLL_MS = 2000;
const GIVEAWAY_TICK_MS = 90;
const MAIN_CARD_BG_IMAGE = "url('/main-card-bg.png')";
const REEL_ROW_HEIGHT_PX = 56;
const REEL_SPIN_STEPS = 42;

function isBigCelebrationItem(value: string): boolean {
  return /box|psa/i.test(value);
}

function shuffleItems(items: string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomFrom(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  return items[Math.floor(Math.random() * items.length)];
}

function buildSpinTrack(pool: string[], selected: string): ReelTrack {
  const source = pool.length > 0 ? pool : [selected];
  const topSeed = randomFrom(source, selected);
  const rows = [topSeed];

  for (let i = 0; i < REEL_SPIN_STEPS; i += 1) {
    rows.push(randomFrom(source, selected));
  }

  rows.push(selected);
  rows.push(randomFrom(source, selected));

  const selectedIndex = rows.length - 2;
  const finalOffset = (selectedIndex - 1) * REEL_ROW_HEIGHT_PX;
  return { rows, finalOffset };
}

function buildSettledRows(pool: string[], center: string): SettledRows {
  const source = pool.length > 0 ? pool : [center];
  const unique = Array.from(new Set(source));
  const alternates = unique.filter((item) => item !== center);

  if (alternates.length >= 2) {
    const top = alternates[Math.floor(Math.random() * alternates.length)];
    const remaining = alternates.filter((item) => item !== top);
    const bottom = remaining[Math.floor(Math.random() * remaining.length)] ?? top;
    return { top, center, bottom };
  }

  if (alternates.length === 1) {
    return { top: alternates[0], center, bottom: alternates[0] };
  }

  const fallback = randomFrom(source, center);
  return { top: fallback, center, bottom: fallback };
}

const confettiPieces = Array.from({ length: 44 }, (_, i) => ({
  id: i,
  left: (i * 17) % 100,
  delay: (i % 9) * 0.03,
  duration: 1.6 + (i % 5) * 0.15,
  drift: -160 + (i % 11) * 32,
  hue: (i * 33) % 360,
  rotation: (i % 2 === 0 ? 1 : -1) * (20 + (i % 6) * 13),
}));

export default function PublicSpinView() {
  const [isOffline, setIsOffline] = useState(false);
  const [display, setDisplay] = useState("Loading...");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [buyersGiveaway, setBuyersGiveaway] = useState<BuyersGiveawayState | null>(null);
  const [currentBuyersGiveawayItem, setCurrentBuyersGiveawayItem] = useState<string | null>(null);
  const [isGiveawayRolling, setIsGiveawayRolling] = useState(false);
  const [giveawayDisplayUser, setGiveawayDisplayUser] = useState<string | null>(null);
  const [history, setHistory] = useState<SpinRecord[]>([]);
  const [visibleLastSpin, setVisibleLastSpin] = useState<SpinRecord | null>(null);
  const [visibleHistory, setVisibleHistory] = useState<SpinRecord[]>([]);
  const [recentBulkResults, setRecentBulkResults] = useState<SpinRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [remainingCount, setRemainingCount] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isHitBouncing, setIsHitBouncing] = useState(false);
  const [reelRows, setReelRows] = useState<string[]>(["Loading...", "Loading...", "Loading..."]);
  const [reelOffset, setReelOffset] = useState(0);
  const [remainingItems, setRemainingItems] = useState<string[]>([]);
  const [isRemainingModalOpen, setIsRemainingModalOpen] = useState(false);
  const [remainingTab, setRemainingTab] = useState<RemainingTab>("all");
  const [celebration, setCelebration] = useState<CelebrationMode>("none");

  const versionRef = useRef<number | null>(null);
  const lastSpinVersionRef = useRef<number | null>(null);
  const giveawayVersionRef = useRef<number | null>(null);
  const remainingListRef = useRef<HTMLDivElement | null>(null);
  const spinInProgressRef = useRef(false);

  const previousWinners = useMemo(() => {
    if (!visibleLastSpin) return visibleHistory;
    return visibleHistory.filter((record) => record.version !== visibleLastSpin.version).slice(0, 10);
  }, [visibleHistory, visibleLastSpin]);

  const inferredBulkResults = useMemo(() => {
    if (history.length < 2) return [] as SpinRecord[];

    for (let startIndex = 0; startIndex < history.length - 1; startIndex += 1) {
      const start = history[startIndex];
      const startTime = Date.parse(start.spunAt);
      if (Number.isNaN(startTime)) continue;

      const batch: SpinRecord[] = [start];
      let expectedVersion = start.version - 1;
      let previousTime = startTime;

      for (let i = startIndex + 1; i < history.length && batch.length < 10; i += 1) {
        const record = history[i];
        const recordTime = Date.parse(record.spunAt);

        if (record.username !== start.username) break;
        if (record.version !== expectedVersion) break;
        if (Number.isNaN(recordTime)) break;
        if (previousTime - recordTime > 3000) break;

        batch.push(record);
        expectedVersion -= 1;
        previousTime = recordTime;
      }

      if (batch.length >= 2) {
        return [...batch].reverse();
      }
    }

    return [] as SpinRecord[];
  }, [history]);

  const visibleBulkResults = useMemo(() => {
    if (recentBulkResults.length >= inferredBulkResults.length) {
      return recentBulkResults.slice(0, 10);
    }
    return inferredBulkResults.slice(0, 10);
  }, [recentBulkResults, inferredBulkResults]);
  const filteredRemainingItems = useMemo(() => {
    if (remainingTab === "all") return remainingItems;
    if (remainingTab === "packs") return remainingItems.filter((item) => /pack/i.test(item));
    if (remainingTab === "boxes") return remainingItems.filter((item) => /box/i.test(item));
    return remainingItems.filter((item) => /psa|slab/i.test(item));
  }, [remainingItems, remainingTab]);
  const groupedRemainingItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filteredRemainingItems) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([item, qty]) => ({ item, qty }))
      .sort((a, b) => a.item.localeCompare(b.item));
  }, [filteredRemainingItems]);
  const groupedRemainingPreview = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of remainingItems) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([item, qty]) => ({ item, qty }))
      .sort((a, b) => a.item.localeCompare(b.item))
      .slice(0, 5);
  }, [remainingItems]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/spin-state", { cache: "no-store" });
        const payload = (await response.json()) as SpinStateResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load state.");
        }

        if (cancelled) return;

        setTotalCount(payload.totalCount);
        setRemovedCount(payload.removedCount);
        setRemainingCount(payload.remainingCount);
        setProgressPercent(payload.progressPercent);
        setRemainingItems(shuffleItems(payload.remainingItems ?? []));
        setIsOffline(payload.isOffline);
        setBuyersGiveaway(payload.buyersGiveaway ?? null);
        setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? null);
        setHistory(payload.history ?? []);
        setRecentBulkResults(payload.recentBulkResults ?? []);

        if (payload.isOffline) {
          spinInProgressRef.current = false;
          setIsSpinning(false);
          setCelebration("none");
          setSelectedItem(null);
          setDisplay(OFFLINE_MESSAGE);
          versionRef.current = payload.version;
          return;
        }

        const previousVersion = versionRef.current;
        versionRef.current = payload.version;
        const previousLastSpinVersion = lastSpinVersionRef.current;
        const currentLastSpinVersion = payload.lastSpin?.version ?? null;
        lastSpinVersionRef.current = currentLastSpinVersion;

        if (previousVersion === null) {
          const firstDisplay = payload.selectedItem ?? payload.reelItems[0] ?? "Waiting for first spin...";
          setSelectedItem(payload.selectedItem);
          setVisibleLastSpin(payload.lastSpin ?? null);
          setVisibleHistory(payload.history ?? []);
          setDisplay(firstDisplay);
          const settled = buildSettledRows(payload.reelItems ?? [], firstDisplay);
          setReelRows([settled.top, firstDisplay, settled.bottom]);
          setReelOffset(0);
          return;
        }

        const hasNewSpin =
          currentLastSpinVersion !== null &&
          (previousLastSpinVersion === null || currentLastSpinVersion > previousLastSpinVersion);

        if (payload.version > previousVersion && payload.selectedItem && hasNewSpin) {
          setCelebration("none");
          spinInProgressRef.current = true;
          setIsSpinning(true);
          setIsHitBouncing(false);
          const reelPool = payload.reelItems.length > 0 ? payload.reelItems : [payload.selectedItem];
          const picked = payload.selectedItem ?? "";
          const track = buildSpinTrack(reelPool, picked);
          setReelRows(track.rows);
          setReelOffset(0);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              setReelOffset(track.finalOffset);
            });
          });

          window.setTimeout(() => {
            spinInProgressRef.current = false;
            setDisplay(payload.selectedItem ?? "");
            setSelectedItem(payload.selectedItem);
            setVisibleLastSpin(payload.lastSpin ?? null);
            setVisibleHistory(payload.history ?? []);
            setIsSpinning(false);
            setIsHitBouncing(true);
            window.setTimeout(() => setIsHitBouncing(false), HIT_BOUNCE_MS);
            setCelebration(isBigCelebrationItem(payload.selectedItem ?? "") ? "big" : "small");
            const center = payload.selectedItem ?? payload.reelItems[0] ?? "Waiting for first spin...";
            const settled = buildSettledRows(payload.reelItems ?? [], center);
            setReelRows([settled.top, center, settled.bottom]);
            setReelOffset(0);
          }, SPIN_DURATION_MS);

          return;
        }

        setSelectedItem(payload.selectedItem);
        if (!spinInProgressRef.current) {
          setVisibleLastSpin(payload.lastSpin ?? null);
          setVisibleHistory(payload.history ?? []);
        }
        const center = payload.selectedItem ?? payload.reelItems[0] ?? "Waiting for first spin...";
        setDisplay(center);
        const settled = buildSettledRows(payload.reelItems ?? [], center);
        setReelRows([settled.top, center, settled.bottom]);
        setReelOffset(0);
      } catch {
        if (!cancelled) {
          setDisplay("Unable to load live state");
        }
      }
    };

    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (celebration === "none") return;
    const timeout = window.setTimeout(() => setCelebration("none"), CELEBRATION_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

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

    const names = history.map((entry) => entry.username).filter(Boolean);
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
  }, [buyersGiveaway, history]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#ffd9b8,transparent_45%),radial-gradient(circle_at_80%_0%,#c7ffd9,transparent_40%),linear-gradient(180deg,#fef6ea_0%,#ecf8ff_100%)] p-3 text-slate-900">
      <main
        className="mx-auto flex min-h-[95dvh] w-full max-w-[430px] flex-col justify-between overflow-hidden rounded-[28px] border border-white/70 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.78)), ${MAIN_CARD_BG_IMAGE}`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {isOffline ? (
          <section className="flex flex-1 items-center justify-center">
            <div className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
              <h1 className="mt-3 text-3xl font-black leading-tight text-slate-900">{OFFLINE_MESSAGE}</h1>
            </div>
          </section>
        ) : (
          <>
            <header>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ebay Randomiser Live</p>
              <h1 className="mt-2 text-2xl font-black leading-tight text-slate-900">Pokebabsi Surprise Set</h1>
              <p className="mt-2 text-sm text-slate-600">All Bids Are Final - If you don&apos;t respond in chat we will skip and go to the next auction.</p>
            </header>

            <section className="my-4 flex flex-1 flex-col items-center gap-4">
              <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Current Buyer&apos;s Giveaway</p>
                <p className="mt-1 text-sm font-semibold text-indigo-900">
                  {currentBuyersGiveawayItem ? currentBuyersGiveawayItem : "Not set yet"}
                </p>
              </div>

              {buyersGiveaway && (
                <div className="w-full rounded-2xl border border-indigo-300 bg-indigo-50 p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Buyer&apos;s Giveaway Winner</p>
                  <p className={`mt-1 text-base font-black text-indigo-900 ${isGiveawayRolling ? "animate-pulse" : ""}`}>
                    @{giveawayDisplayUser ?? buyersGiveaway.winnerUsername}
                  </p>
                  <p className="text-sm text-indigo-800">{buyersGiveaway.itemName}</p>
                  {isGiveawayRolling && <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-indigo-600">Drawing...</p>}
                </div>
              )}

              <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-4 py-8 text-center text-white shadow-inner">
                <div className={`slot-window ${isSpinning ? "slot-window-spinning" : ""} ${isHitBouncing ? "slot-reel-hit" : ""}`}>
                  <div
                    className="slot-track"
                    style={{
                      transform: `translateY(-${reelOffset}px)`,
                      transition: isSpinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.16, 0.88, 0.22, 1)` : "none",
                    }}
                  >
                    {(reelRows.length > 0 ? reelRows : [display, display, display]).map((row, index) => (
                      <div className="slot-row" key={`${row}-${index}`}>
                        {row}
                      </div>
                    ))}
                  </div>
                  <div className="slot-center-marker" />
                </div>
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

              <div className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last Winner</p>
                {visibleLastSpin ? (
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    Auction {visibleLastSpin.auctionNumber} | @{visibleLastSpin.username} | {visibleLastSpin.item}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">No winner yet.</p>
                )}
              </div>

              {visibleBulkResults.length > 0 && (
                <div className="w-full rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-800">Last Bulk Spin Results</p>
                  <ul className="mt-2 space-y-1 text-sm text-cyan-900">
                    {visibleBulkResults.map((record) => (
                      <li key={`${record.version}-${record.spunAt}`} className="rounded-lg bg-white/80 px-2 py-1">
                        Auction {record.auctionNumber} | @{record.username} | {record.item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="w-full">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                  <span>Pool Progress</span>
                  <span>
                    {removedCount}/{totalCount}
                  </span>
                </div>
                <div className="h-6 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-100">
                  <div
                    className="progress-fill h-full rounded-full bg-[linear-gradient(90deg,#14b8a6_0%,#0ea5e9_45%,#f59e0b_100%)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="w-full rounded-2xl border border-slate-300 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Remaining Items</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRemainingTab("all");
                      setIsRemainingModalOpen(true);
                    }}
                    className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600"
                  >
                    View Full List
                  </button>
                </div>
                <div ref={remainingListRef} className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <ul className="space-y-1 text-sm text-slate-700">
                    {groupedRemainingPreview.map((entry) => (
                      <li key={entry.item} className="rounded-lg bg-white/80 px-2 py-1">
                        {entry.item} <span className="text-xs font-semibold text-slate-500">x{entry.qty}</span>
                      </li>
                    ))}
                    {remainingItems.length > groupedRemainingPreview.reduce((sum, entry) => sum + entry.qty, 0) && (
                      <li className="rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        +{remainingItems.length - groupedRemainingPreview.reduce((sum, entry) => sum + entry.qty, 0)} more
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="w-full rounded-2xl border border-slate-300 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Previous Winners</p>
                <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <ul className="space-y-1 text-sm text-slate-700">
                    {previousWinners.length === 0 && <li>No previous winners yet.</li>}
                    {previousWinners.map((record) => (
                      <li key={`${record.version}-${record.spunAt}`} className="rounded-lg bg-white/80 px-2 py-1">
                        Auction {record.auctionNumber} | @{record.username} | {record.item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <footer>
              {selectedItem && (
                <p className="mb-2 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                  Latest: {selectedItem}
                </p>
              )}
              <p className="text-center text-xs text-slate-500">Remaining items: {remainingCount}</p>
            </footer>
          </>
        )}
      </main>

      {isRemainingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 p-3">
          <div className="mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Remaining Items</p>
                <p className="text-xs text-slate-400">{groupedRemainingItems.length} grouped entries shown</p>
              </div>
              <button
                type="button"
                onClick={() => setIsRemainingModalOpen(false)}
                className="rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-200"
              >
                Close
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-slate-700 px-3 py-2">
              {[
                { id: "all", label: "All Items" },
                { id: "packs", label: "Packs" },
                { id: "boxes", label: "Boxes" },
                { id: "slabs", label: "Slabs" },
              ].map((tab) => {
                const isActive = remainingTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRemainingTab(tab.id as RemainingTab)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${
                      isActive ? "bg-cyan-400 text-slate-900" : "border border-slate-600 text-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <ul className="space-y-1 text-sm text-slate-100">
                {groupedRemainingItems.length === 0 && (
                  <li className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300">No items in this tab.</li>
                )}
                {groupedRemainingItems.map((entry) => (
                  <li key={entry.item} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span>{entry.item}</span>
                      <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-300">x{entry.qty}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
