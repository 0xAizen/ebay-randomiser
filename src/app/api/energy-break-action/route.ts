import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { clearEnergyBreakState, saveEnergyBreakState } from "@/lib/energy-break-state";
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
    };

    if (body.action === "save") {
      if (!Array.isArray(body.spots)) {
        return NextResponse.json({ error: "spots must be an array." }, { status: 400 });
      }

      const state = await saveEnergyBreakState(body.spots);
      return NextResponse.json(state);
    }

    if (body.action === "clear") {
      const state = await clearEnergyBreakState();
      return NextResponse.json(state);
    }

    return NextResponse.json({ error: "Invalid action. Use save or clear." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update energy break state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
