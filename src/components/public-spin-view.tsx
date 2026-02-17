"use client";

import { useEffect, useRef, useState } from "react";

type SpinStateResponse = {
  selectedItem: string | null;
  totalCount: number;
  remainingCount: number;
  removedCount: number;
  progressPercent: number;
  version: number;
  updatedAt: string;
  reelItems: string[];
  error?: string;
};

type CelebrationMode = "none" | "small" | "big";
type CSSVars = React.CSSProperties & { [key: `--${string}`]: string | number };

const SPIN_DURATION_MS = 2000;
const REEL_TICK_MS = 70;
const POLL_INTERVAL_MS = 2000;
const CELEBRATION_TIMEOUT_MS = 2200;

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
  const [display, setDisplay] = useState("Loading...");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [remainingCount, setRemainingCount] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationMode>("none");

  const versionRef = useRef<number | null>(null);

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
        const previousVersion = versionRef.current;
        versionRef.current = payload.version;

        if (previousVersion === null) {
          const firstDisplay = payload.selectedItem ?? payload.reelItems[0] ?? "Waiting for first spin...";
          setSelectedItem(payload.selectedItem);
          setDisplay(firstDisplay);
          return;
        }

        if (payload.version > previousVersion && payload.selectedItem) {
          setCelebration("none");
          setIsSpinning(true);
          const reelPool = payload.reelItems.length > 0 ? payload.reelItems : [payload.selectedItem];

          const interval = window.setInterval(() => {
            const rollingItem = reelPool[Math.floor(Math.random() * reelPool.length)];
            setDisplay(rollingItem);
          }, REEL_TICK_MS);

          window.setTimeout(() => {
            window.clearInterval(interval);
            setDisplay(payload.selectedItem ?? "");
            setSelectedItem(payload.selectedItem);
            setIsSpinning(false);
            setCelebration(payload.selectedItem?.includes("📦") ? "big" : "small");
          }, SPIN_DURATION_MS);

          return;
        }

        setSelectedItem(payload.selectedItem);
        setDisplay(payload.selectedItem ?? payload.reelItems[0] ?? "Waiting for first spin...");
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

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#ffd9b8,transparent_45%),radial-gradient(circle_at_80%_0%,#c7ffd9,transparent_40%),linear-gradient(180deg,#fef6ea_0%,#ecf8ff_100%)] p-3 text-slate-900">
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[430px] flex-col justify-between overflow-hidden rounded-[28px] border border-white/70 bg-white/80 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ebay Randomiser Live</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-slate-900">Current Spin</h1>
          <p className="mt-2 text-sm text-slate-600">Live view updates from server state.</p>
        </header>

        <section className="my-6 flex flex-1 flex-col items-center justify-center gap-5">
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-4 py-8 text-center text-white shadow-inner">
            <div className={`slot-reel ${isSpinning ? "slot-reel-spinning" : ""}`}>{display}</div>
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

          {selectedItem && (
            <p className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
              Latest: {selectedItem}
            </p>
          )}
        </section>

        <footer>
          <p className="text-center text-xs text-slate-500">Remaining items: {remainingCount}</p>
        </footer>
      </main>
    </div>
  );
}
