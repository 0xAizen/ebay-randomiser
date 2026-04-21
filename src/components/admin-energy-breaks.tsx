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

type PrintEnergyLabelInput = {
  energy: string;
  username: string;
  breakNumber: string;
  setName: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const labelDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: "Europe/London",
});

export default function AdminEnergyBreaks() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentChannel = resolveRandomiserChannel(searchParams.get("channel"));
  const currentChannelLabel = getRandomiserChannelLabel(currentChannel);
  const [breakNumber, setBreakNumber] = useState("");
  const [setName, setSetName] = useState("");
  const [savedSetName, setSavedSetName] = useState("");
  const [savedSetNames, setSavedSetNames] = useState<string[]>([]);
  const [currentBuyersGiveawayItem, setCurrentBuyersGiveawayItem] = useState("");
  const [buyersGiveawayItemInput, setBuyersGiveawayItemInput] = useState("");
  const [spots, setSpots] = useState<EnergyBreakSpot[]>(ENERGY_BREAK_SPOTS.map((energy) => ({ energy, username: "" })));
  const [savedSpots, setSavedSpots] = useState<EnergyBreakSpot[]>(ENERGY_BREAK_SPOTS.map((energy) => ({ energy, username: "" })));
  const [buyersGiveaway, setBuyersGiveaway] = useState<EnergyBreakState["buyersGiveaway"]>(null);
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

        setBreakNumber(payload.breakNumber ?? "");
        setSetName(payload.setName ?? "");
        setSavedSetName(payload.setName ?? "");
        setSavedSetNames(payload.savedSetNames ?? []);
        setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? "");
        setBuyersGiveawayItemInput(payload.currentBuyersGiveawayItem ?? "");
        setSpots(payload.spots);
        setSavedSpots(payload.spots);
        setBuyersGiveaway(payload.buyersGiveaway ?? null);
        setMessage(null);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load energy break state.");
      }
    };

    load();
  }, []);

  const hasChanges = useMemo(
    () =>
      JSON.stringify(spots) !== JSON.stringify(savedSpots) ||
      setName !== savedSetName,
    [savedSetName, savedSpots, setName, spots],
  );

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/energy-break-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", spots, setName }),
      });
      const payload = (await response.json()) as EnergyBreakState & { error?: string };

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save energy break state.");
      }

      setBreakNumber(payload.breakNumber ?? "");
      setSetName(payload.setName ?? "");
      setSavedSetName(payload.setName ?? "");
      setSavedSetNames(payload.savedSetNames ?? []);
      setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveawayItemInput(payload.currentBuyersGiveawayItem ?? "");
      setSpots(payload.spots);
      setSavedSpots(payload.spots);
      setBuyersGiveaway(payload.buyersGiveaway ?? null);
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

      setBreakNumber(payload.breakNumber ?? "");
      setSetName(payload.setName ?? "");
      setSavedSetName(payload.setName ?? "");
      setSavedSetNames(payload.savedSetNames ?? []);
      setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveawayItemInput(payload.currentBuyersGiveawayItem ?? "");
      setSpots(payload.spots);
      setSavedSpots(payload.spots);
      setBuyersGiveaway(payload.buyersGiveaway ?? null);
      setMessage("Energy break spots cleared.");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear energy break state.");
    } finally {
      setIsSaving(false);
    }
  };

  const openPrintLabel = ({ energy, username, breakNumber, setName }: PrintEnergyLabelInput) => {
    const cleanUsername = username.trim();
    const cleanBreakNumber = breakNumber.trim();
    const cleanSetName = setName.trim();
    if (!cleanUsername) {
      setError(`Assign a username to ${energy} before printing.`);
      return;
    }
    if (!cleanBreakNumber || !cleanSetName) {
      setError("Set both Break Number and Set Name before printing spot labels.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=320,height=320");
    if (!printWindow) {
      setError("Printer popup was blocked. Allow popups and try again.");
      return;
    }

    const dateText = labelDate.format(new Date());
    const breakText = `Break ${cleanBreakNumber}`;
    const energyText = `${energy} Spot`;
    const setText = cleanSetName;
    const usernameText = `@${cleanUsername}`;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Print ${energy} Spot Label`)}</title>
    <style>
      @page {
        size: 23mm 23mm;
        margin: 0;
      }

      html, body {
        width: 23mm;
        height: 23mm;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: Arial, Helvetica, sans-serif;
        background: #ffffff;
        color: #0f172a;
      }

      .label {
        box-sizing: border-box;
        width: 23mm;
        height: 23mm;
        padding: 1.4mm 1.2mm;
        display: grid;
        grid-template-rows: auto auto auto minmax(0, 1fr) auto;
        row-gap: 0.45mm;
        align-items: center;
        text-align: center;
        border: 0.2mm solid #cbd5e1;
        overflow: hidden;
      }

      .set {
        width: 100%;
        font-size: 2mm;
        line-height: 1.05;
        font-weight: 700;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .break {
        font-size: 2.1mm;
        line-height: 1;
        font-weight: 700;
      }

      .title {
        font-size: 2.8mm;
        line-height: 1.05;
        font-weight: 800;
      }

      .username {
        width: 100%;
        font-size: 2.35mm;
        line-height: 1.05;
        font-weight: 700;
        overflow: hidden;
        word-break: break-word;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        align-self: center;
      }

      .date {
        font-size: 2.15mm;
        line-height: 1;
        font-weight: 600;
        align-self: end;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <div class="label">
      <div class="set">${escapeHtml(setText)}</div>
      <div class="break">${escapeHtml(breakText)}</div>
      <div class="title">${escapeHtml(energyText)}</div>
      <div class="username">${escapeHtml(usernameText)}</div>
      <div class="date">${escapeHtml(dateText)}</div>
    </div>
    <script>
      window.addEventListener("load", () => {
        window.focus();
        window.print();
      });
      window.addEventListener("afterprint", () => {
        window.close();
      });
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setError(null);
  };

  const setBuyersGiveawayItem = async () => {
    const itemName = buyersGiveawayItemInput.trim();
    if (!itemName) {
      setError("Buyer's giveaway item name is required.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/energy-break-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setBuyersGiveawayItem", itemName }),
      });
      const payload = (await response.json()) as EnergyBreakState & { error?: string };

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to set buyer's giveaway item.");
      }

      setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveawayItemInput(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveaway(payload.buyersGiveaway ?? null);
      setMessage("Buyer's giveaway item updated.");
    } catch (setErrorState) {
      setError(setErrorState instanceof Error ? setErrorState.message : "Failed to set buyer's giveaway item.");
    } finally {
      setIsSaving(false);
    }
  };

  const runBuyersGiveaway = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/energy-break-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runBuyersGiveaway" }),
      });
      const payload = (await response.json()) as EnergyBreakState & { error?: string };

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to run buyer's giveaway.");
      }

      setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveawayItemInput(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveaway(payload.buyersGiveaway ?? null);
      setMessage("Buyer's giveaway winner selected.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to run buyer's giveaway.");
    } finally {
      setIsSaving(false);
    }
  };

  const nextBreak = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/energy-break-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nextBreak" }),
      });
      const payload = (await response.json()) as EnergyBreakState & { error?: string };

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to move to next break.");
      }

      setBreakNumber(payload.breakNumber ?? "");
      setSetName(payload.setName ?? "");
      setSavedSetName(payload.setName ?? "");
      setSavedSetNames(payload.savedSetNames ?? []);
      setCurrentBuyersGiveawayItem(payload.currentBuyersGiveawayItem ?? "");
      setBuyersGiveawayItemInput(payload.currentBuyersGiveawayItem ?? "");
      setSpots(payload.spots);
      setSavedSpots(payload.spots);
      setBuyersGiveaway(payload.buyersGiveaway ?? null);
      setMessage(`Moved to Break ${payload.breakNumber}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to move to next break.");
    } finally {
      setIsSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.14),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(251,191,36,0.14),transparent_34%),linear-gradient(180deg,#020617_0%,#0f172a_55%,#111827_100%)] p-3 text-slate-100 lg:p-6">
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[1240px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur lg:px-8 lg:py-8">
        <header>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Energy Breaks Admin</p>
            <button
              onClick={logout}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
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
                      ? "bg-white text-slate-950"
                      : "border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10"
                  }`}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>
          <h1 className="mt-2 text-2xl font-black leading-tight text-white">Assign Energy Spots</h1>
          <p className="mt-2 text-sm text-slate-300">Eight fixed spots for Energy Breaks. Set one username per energy.</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Active Channel: {currentChannelLabel}
          </p>
        </header>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Break Details</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[200px,1fr,220px]">
            <div className="rounded-xl border border-white/15 bg-slate-900 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Break Number</p>
              <p className="mt-1 text-lg font-black text-white">{breakNumber || "1"}</p>
            </div>
            <input
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              list="energy-break-set-names"
              placeholder="Set Name"
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 text-sm font-semibold text-white outline-none ring-sky-300 focus:ring"
            />
            <button
              type="button"
              onClick={nextBreak}
              disabled={isSaving}
              className="rounded-2xl border border-amber-300/40 bg-amber-500/12 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next Break
            </button>
          </div>
          <datalist id="energy-break-set-names">
            {savedSetNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Buyer&apos;s Giveaway</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr,220px,220px]">
            <input
              value={buyersGiveawayItemInput}
              onChange={(event) => setBuyersGiveawayItemInput(event.target.value)}
              placeholder="Buyer&apos;s giveaway item"
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 text-sm font-semibold text-white outline-none ring-sky-300 focus:ring"
            />
            <button
              type="button"
              onClick={setBuyersGiveawayItem}
              disabled={isSaving}
              className="rounded-2xl border border-indigo-300/40 bg-indigo-500/12 px-4 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Set Giveaway Item
            </button>
            <button
              type="button"
              onClick={runBuyersGiveaway}
              disabled={isSaving}
              className="rounded-2xl border border-cyan-300/40 bg-cyan-500/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run Buyer&apos;s Giveaway
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            Current Item: {currentBuyersGiveawayItem || "Not set"}
          </p>
          {buyersGiveaway && (
            <div className="mt-3 rounded-2xl border border-indigo-300/25 bg-indigo-500/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200">Last Buyer&apos;s Giveaway Winner</p>
              <p className="mt-1 text-lg font-black text-white">@{buyersGiveaway.winnerUsername}</p>
              <p className="mt-1 text-sm font-semibold text-indigo-100">
                {buyersGiveaway.itemName} | {buyersGiveaway.winnerEnergy} Spot
              </p>
            </div>
          )}
        </section>

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
              <button
                type="button"
                onClick={() =>
                  openPrintLabel({
                    energy: spot.energy,
                    username: spot.username,
                    breakNumber,
                    setName,
                  })
                }
                className="mt-3 w-full rounded-xl border border-white/50 bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
              >
                Print Spot Label
              </button>
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
          <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
