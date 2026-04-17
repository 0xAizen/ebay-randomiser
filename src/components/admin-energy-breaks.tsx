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
import { ENERGY_BREAK_SPOTS, type EnergyBreakSpot, type EnergyBreakState } from "@/lib/energy-break-shared";

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

export default function AdminEnergyBreaks() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentChannel = resolveRandomiserChannel(searchParams.get("channel"));
  const currentChannelLabel = getRandomiserChannelLabel(currentChannel);
  const [spots, setSpots] = useState<EnergyBreakSpot[]>(ENERGY_BREAK_SPOTS.map((energy) => ({ energy, username: "" })));
  const [savedSpots, setSavedSpots] = useState<EnergyBreakSpot[]>(ENERGY_BREAK_SPOTS.map((energy) => ({ energy, username: "" })));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    const load = async () => {
      try {
        const response = await fetch("/api/energy-break-state/admin", { cache: "no-store" });
        const payload = (await response.json()) as EnergyBreakState & { error?: string };

        if (response.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load energy break state.");
        }

        setSpots(payload.spots);
        setSavedSpots(payload.spots);
        setMessage(null);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load energy break state.");
      }
    };

    load();
  }, []);

  const hasChanges = useMemo(
    () => JSON.stringify(spots) !== JSON.stringify(savedSpots),
    [savedSpots, spots],
  );

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/energy-break-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", spots }),
      });
      const payload = (await response.json()) as EnergyBreakState & { error?: string };

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save energy break state.");
      }

      setSpots(payload.spots);
      setSavedSpots(payload.spots);
      setMessage("Energy break spots saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save energy break state.");
    } finally {
      setIsSaving(false);
    }
  };

  const clear = async () => {
    const confirmed = window.confirm("Clear all assigned energy break spots?");
    if (!confirmed) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/energy-break-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const payload = (await response.json()) as EnergyBreakState & { error?: string };

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to clear energy break state.");
      }

      setSpots(payload.spots);
      setSavedSpots(payload.spots);
      setMessage("Energy break spots cleared.");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear energy break state.");
    } finally {
      setIsSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#dbeafe,transparent_45%),radial-gradient(circle_at_80%_0%,#fde68a,transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-3 text-slate-900 lg:p-6">
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[1240px] flex-col overflow-hidden rounded-[28px] border border-white/70 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur lg:px-8 lg:py-8">
        <header>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Energy Breaks Admin</p>
            <button
              onClick={logout}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
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
                      : "border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                  }`}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>
          <h1 className="mt-2 text-2xl font-black leading-tight text-slate-900">Assign Energy Spots</h1>
          <p className="mt-2 text-sm text-slate-600">Eight fixed spots for Energy Breaks. Set one username per energy.</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Active Channel: {currentChannelLabel}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {spots.map((spot, index) => (
            <div
              key={spot.energy}
              className={`rounded-3xl border border-white/70 bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${ENERGY_STYLES[spot.energy]} p-4 text-white shadow-lg`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">{spot.energy}</p>
              <input
                value={spot.username}
                onChange={(event) =>
                  setSpots((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, username: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="Assign username"
                className="mt-3 w-full rounded-xl border border-white/50 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-sky-200 focus:ring"
              />
            </div>
          ))}
        </section>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={save}
            disabled={isSaving || !hasChanges}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : hasChanges ? "Save Energy Spots" : "No Changes"}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={isSaving}
            className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear All Spots
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
