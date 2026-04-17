import { Suspense } from "react";
import PublicChannelView from "@/components/public-channel-view";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <PublicChannelView backgroundMode="default" />
    </Suspense>
  );
}
