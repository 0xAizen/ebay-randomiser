"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_RANDOMISER_CHANNEL,
  getRandomiserChannelLabel,
  RANDOMISER_CHANNELS,
  resolveRandomiserChannel,
  type RandomiserChannel,
} from "@/lib/client-channels";
import { ENERGY_BREAK_SPOTS, type EnergyBreakState } from "@/lib/energy-break-shared";

type EnergyBreakViewProps = {
  backgroundMode?: "default" | "chroma";
  mode?: "full" | "obs";
};

const ENERGY_STYLES: Record<string, string> = {
  Water: "from-sky-400 via-blue-500 to-cyan-600",
  Fire: "from-orange-400 via-red-500 to-rose-600",
  Leaf: "from-amber-300 via-orange-400 to-rose-500",
  Electric: "from-yellow-300 via-amber-400 to-orange-500",
  Psychic: "from-fuchsia-400 via-pink-500 to-purple-600",
  Fighting: "from-orange-500 via-amber-600 to-yellow-700",
  Dark: "from-slate-600 via-slate-800 to-black",
  Steel: "from-slate-300 via-zinc-400 to-slate-600",
};

export default function EnergyBreakView({ mode = "full" }: EnergyBreakViewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentChannel = resolveRandomiserChannel(searchParams.get("channel"));
  const currentChannelLabel = getRandomiserChannelLabel(currentChannel);
  const [state, setState] = useState<EnergyBreakState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rootBackgroundClass =
    mode === "obs"
      ? "bg-[#00FF00]"
      : "bg-[radial-gradient(circle_at_20%_20%,#dbeafe,transparent_45%),radial-gradient(circle_at_80%_0%,#fde68a,transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]";

  const switchChannel = (channel: RandomiserChannel) => {
    const params = new URLSearchParams(searchParams.toString());
    if (channel === DEFAULT_RANDOMISER_CHANNEL) {
      params.delete("channel");
    } else {
      params.set("channel", channel);
    }
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/energy-break-state", { cache: "no-store" });
        const payload = (await response.json()) as EnergyBreakState & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load energy break state.");
        }
        if (cancelled) return;
        setState(payload);
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load energy break state.");
        }
      }
    };

    load();
    const interval = window.setInterval(load, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const spots = useMemo(
    () => state?.spots ?? ENERGY_BREAK_SPOTS.map((energy) => ({ energy, username: "" })),
    [state],
  );

  if (mode === "obs") {
    return (
      <div className={`min-h-dvh ${rootBackgroundClass} p-3 text-white`}>
        <section className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col justify-center gap-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/92 px-4 py-3 text-center shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Energy Breaks</p>
            {state?.breakNumber && <p className="mt-1 text-sm font-bold text-white">Break {state.breakNumber}</p>}
            {state?.setName && <p className="mt-1 text-xs font-semibold text-white/80">{state.setName}</p>}
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/92 px-4 py-3 text-center shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Buyer&apos;s Giveaway</p>
            <p className="mt-1 text-sm font-semibold text-white">{state?.currentBuyersGiveawayItem || "Not set"}</p>
            {state?.buyersGiveaway && (
              <p className="mt-2 text-xs font-semibold text-white/80">
                Last: @{state.buyersGiveaway.winnerUsername} | {state.buyersGiveaway.winnerEnergy}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {spots.map((spot) => (
              <div
                key={spot.energy}
                className="rounded-2xl border border-slate-700 bg-slate-950 p-3 text-white shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
              >
                <div className={`mb-3 h-1.5 w-full rounded-full bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${ENERGY_STYLES[spot.energy]}`} />
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/75">{spot.energy}</p>
                <p className="mt-2 text-sm font-black leading-tight text-white">{spot.username || "Open Spot"}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh ${rootBackgroundClass} p-3 text-slate-900`}>
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-[28px] border border-white/70 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur lg:px-8 lg:py-8">
        <header>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {RANDOMISER_CHANNELS.map((channel) => {
              const isActive = currentChannel === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => switchChannel(channel.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Live Energy Board</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-slate-900">Energy Breaks</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Channel: {currentChannelLabel}</p>
          {state?.breakNumber && (
            <p className="mt-2 text-sm font-semibold text-slate-800">Break Number: {state.breakNumber}</p>
          )}
          {state?.setName && (
            <p className="mt-1 text-sm font-semibold text-slate-700">Set Name: {state.setName}</p>
          )}
          <p className="mt-2 text-sm font-semibold text-slate-800">
            Buyer&apos;s Giveaway: {state?.currentBuyersGiveawayItem || "Not set"}
          </p>
          {state?.buyersGiveaway && (
            <p className="mt-1 text-sm font-semibold text-slate-700">
              Last Winner: @{state.buyersGiveaway.winnerUsername} | {state.buyersGiveaway.itemName} | {state.buyersGiveaway.winnerEnergy} Spot
            </p>
          )}
          <p className="mt-2 text-sm text-slate-600">Eight fixed spots. Each buyer is assigned one energy.</p>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {spots.map((spot) => (
            <div
              key={spot.energy}
              className={`rounded-3xl border border-white/70 bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${ENERGY_STYLES[spot.energy]} p-4 text-white shadow-lg`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">{spot.energy}</p>
              <p className="mt-3 min-h-[3.5rem] text-lg font-black leading-tight">{spot.username || "Open Spot"}</p>
            </div>
          ))}
        </section>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
