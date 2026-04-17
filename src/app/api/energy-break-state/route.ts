import { NextResponse } from "next/server";
import { getEnergyBreakState } from "@/lib/energy-break-state";

export async function GET() {
  try {
    const state = await getEnergyBreakState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load energy break state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
