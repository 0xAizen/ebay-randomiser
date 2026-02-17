"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CelebrationMode = "none" | "small" | "big";
type CSSVars = React.CSSProperties & { [key: `--${string}`]: string | number };

type SpinStatePayload = {
  items: string[];
  pool: string[];
  selectedItem: string | null;
  version: number;
  updatedAt: string;
  totalCount: number;
  remainingCount: number;
  removedCount: number;
  progressPercent: number;
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

export default function AdminRandomiser() {
  const [allItems, setAllItems] = useState<string[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [currentDisplay, setCurrentDisplay] = useState<string>("Loading items...");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationMode>("none");
  const [hasLoaded, setHasLoaded] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [configText, setConfigText] = useState("");
  const [draftConfig, setDraftConfig] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const applyState = useCallback((state: SpinStatePayload) => {
    setAllItems(state.items);
    setPool(state.pool);
    setSelectedItem(state.selectedItem);
    setCurrentDisplay(state.selectedItem ?? state.pool[0] ?? "Pool Empty");
  }, []);

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

    applyState(payload);
  }, [applyState]);

  useEffect(() => {
    const load = async () => {
      try {
        await loadAdminState();
        const configResponse = await fetch("/api/items-config", { cache: "no-store" });

        if (configResponse.status === 401) {
          window.location.assign("/admin/login");
          return;
        }

        const payload = (await configResponse.json()) as ItemsConfigResponse;
        if (!configResponse.ok) {
          throw new Error(payload.error ?? "Failed to load item config.");
        }

        setConfigText(payload.configText);
        setDraftConfig(payload.configText);
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

  const spin = async () => {
    if (isSpinning || pool.length === 0 || isSaving) return;

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
        body: JSON.stringify({ action: "spin" }),
      });

      const payload = (await response.json()) as SpinStatePayload;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Spin failed.");
      }

      const finishSpin = () => {
        window.clearInterval(interval);
        applyState(payload);
        const picked = payload.selectedItem;
        setCurrentDisplay(picked ?? payload.pool[0] ?? "Pool Empty");
        if (picked) {
          setCelebration(picked.includes("📦") ? "big" : "small");
        }
        setIsSpinning(false);
      };

      window.setTimeout(finishSpin, SPIN_DURATION_MS);
    } catch (error) {
      window.clearInterval(interval);
      setEditorError(error instanceof Error ? error.message : "Spin failed.");
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

      const payload = (await response.json()) as SpinStatePayload;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Reset failed.");
      }

      applyState(payload);
      setCelebration("none");
      setEditorMessage("Pool reset on server.");
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to reset pool.");
    }
  };

  const saveConfig = async () => {
    if (isSaving || isSpinning) return;

    setEditorError(null);
    setEditorMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/items-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configText: draftConfig }),
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
      setDraftConfig(payload.configText);

      if (payload.state) {
        applyState(payload.state);
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

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  };

  const hasUnsavedChanges = draftConfig !== configText;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#ffd9b8,transparent_45%),radial-gradient(circle_at_80%_0%,#c7ffd9,transparent_40%),linear-gradient(180deg,#fef6ea_0%,#ecf8ff_100%)] p-3 text-slate-900">
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[430px] flex-col justify-between overflow-hidden rounded-[28px] border border-white/70 bg-white/80 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur">
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
        </header>

        <section className="my-6 flex flex-1 flex-col items-center justify-center gap-5">
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
        </section>

        <footer className="space-y-3">
          <button
            onClick={spin}
            disabled={isSpinning || pool.length === 0 || !hasLoaded || isSaving}
            className="w-full rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#0369a1_100%)] px-4 py-4 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pool.length === 0 ? "Pool Empty" : isSpinning ? "Spinning..." : "Spin"}
          </button>

          <button
            onClick={resetPool}
            disabled={isSpinning || allItems.length === 0 || isSaving}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset Pool
          </button>

          <button
            onClick={() => setEditorOpen((value) => !value)}
            className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {editorOpen ? "Hide Staff Editor" : "Open Staff Editor"}
          </button>

          {editorOpen && (
            <div className="space-y-2 rounded-2xl border border-slate-300 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Use one line per item</p>
              <p className="text-xs text-slate-600">Format: 151 Booster Pack - QTY 200</p>

              <textarea
                value={draftConfig}
                onChange={(event) => setDraftConfig(event.target.value)}
                rows={8}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 outline-none ring-sky-200 focus:ring"
              />

              <button
                onClick={saveConfig}
                disabled={isSaving || isSpinning || !hasUnsavedChanges}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Items" : "No Changes"}
              </button>

              {editorMessage && <p className="text-xs font-semibold text-emerald-700">{editorMessage}</p>}
              {editorError && <p className="text-xs font-semibold text-rose-700">{editorError}</p>}
            </div>
          )}

          <p className="text-center text-xs text-slate-500">Remaining items: {pool.length}</p>
        </footer>
      </main>
    </div>
  );
}
