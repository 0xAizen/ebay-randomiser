import { NextResponse } from "next/server";
import { getSpinState } from "@/lib/spin-state";

export async function GET() {
  try {
    const state = await getSpinState();
    const totalCount = state.items.length;
    const remainingCount = state.pool.length;
    const removedCount = totalCount - remainingCount;

    return NextResponse.json({
      selectedItem: state.selectedItem,
      totalCount,
      remainingCount,
      removedCount,
      progressPercent: totalCount === 0 ? 0 : (removedCount / totalCount) * 100,
      version: state.version,
      updatedAt: state.updatedAt,
      reelItems: state.items.slice(0, 80),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load spin state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
