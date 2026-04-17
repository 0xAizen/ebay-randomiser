"use client";

import { useSearchParams } from "next/navigation";
import AdminEnergyBreaks from "@/components/admin-energy-breaks";
import AdminRandomiser from "@/components/admin-randomiser";
import { resolveRandomiserChannel } from "@/lib/client-channels";

export default function AdminChannelView() {
  const searchParams = useSearchParams();
  const channel = resolveRandomiserChannel(searchParams.get("channel"));

  if (channel === "energy") {
    return <AdminEnergyBreaks />;
  }

  return <AdminRandomiser />;
}
