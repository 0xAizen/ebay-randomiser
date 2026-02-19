import { NextResponse } from "next/server";
import { getSpinState } from "@/lib/spin-state";

export async function GET() {
  try {
    const state = await getSpinState();
    const totalCount = state.items.length;
    const remainingCount = state.pool.length;
    const removedCount = totalCount - remainingCount;

    return NextResponse.json({
      isOffline: state.isOffline,
      buyersGiveaway: state.buyersGiveaway,
      currentBuyersGiveawayItem: state.currentBuyersGiveawayItem,
      selectedItem: state.selectedItem,
      lastSpin: state.lastSpin,
      history: state.history.slice(0, 20),
      recentBulkResults: state.recentBulkResults.slice(0, 20),
      totalCount,
      remainingCount,
      removedCount,
      progressPercent: totalCount === 0 ? 0 : (removedCount / totalCount) * 100,
      version: state.version,
      updatedAt: state.updatedAt,
      reelItems: state.items.slice(0, 80),
      remainingItems: state.pool,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load spin state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
