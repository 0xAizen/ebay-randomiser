import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import {
  clearEnergyBreakState,
  runEnergyBreakBuyersGiveaway,
  saveEnergyBreakState,
  setEnergyBreakBuyersGiveawayItem,
} from "@/lib/energy-break-state";
import type { EnergyBreakSpot } from "@/lib/energy-break-shared";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      spots?: EnergyBreakSpot[];
      breakNumber?: string;
      setName?: string;
      itemName?: string;
    };

    if (body.action === "save") {
      if (!Array.isArray(body.spots)) {
        return NextResponse.json({ error: "spots must be an array." }, { status: 400 });
      }
      if (typeof body.breakNumber !== "string" || typeof body.setName !== "string") {
        return NextResponse.json({ error: "breakNumber and setName must be strings." }, { status: 400 });
      }

      const state = await saveEnergyBreakState(body.spots, body.breakNumber, body.setName);
      return NextResponse.json(state);
    }

    if (body.action === "clear") {
      const state = await clearEnergyBreakState();
      return NextResponse.json(state);
    }

    if (body.action === "setBuyersGiveawayItem") {
      if (typeof body.itemName !== "string") {
        return NextResponse.json({ error: "itemName must be a string." }, { status: 400 });
      }

      const state = await setEnergyBreakBuyersGiveawayItem(body.itemName);
      return NextResponse.json(state);
    }

    if (body.action === "runBuyersGiveaway") {
      const state = await runEnergyBreakBuyersGiveaway();
      return NextResponse.json(state);
    }

    return NextResponse.json(
      { error: "Invalid action. Use save, clear, setBuyersGiveawayItem, or runBuyersGiveaway." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update energy break state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
