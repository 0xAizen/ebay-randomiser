import { Suspense } from "react";
import PublicChannelView from "@/components/public-channel-view";

export default function ObsPage() {
  return (
    <Suspense fallback={null}>
      <PublicChannelView backgroundMode="chroma" mode="obs" />
    </Suspense>
  );
}
