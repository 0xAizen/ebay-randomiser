"use client";

import { useSearchParams } from "next/navigation";
import EnergyBreakView from "@/components/energy-break-view";
import PublicSpinView from "@/components/public-spin-view";
import { resolveRandomiserChannel } from "@/lib/client-channels";

type PublicChannelViewProps = {
  backgroundMode?: "default" | "chroma";
  mode?: "full" | "obs";
};

export default function PublicChannelView(props: PublicChannelViewProps) {
  const searchParams = useSearchParams();
  const channel = resolveRandomiserChannel(searchParams.get("channel"));

  if (channel === "energy") {
    return <EnergyBreakView {...props} />;
  }

  return <PublicSpinView {...props} />;
}
