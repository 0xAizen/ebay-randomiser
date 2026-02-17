import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { resetSpinState, spinOnce } from "@/lib/spin-state";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { action?: string };

    if (body.action === "spin") {
      const state = await spinOnce();
      return NextResponse.json(state);
    }

    if (body.action === "reset") {
      const state = await resetSpinState();
      return NextResponse.json(state);
    }

    return NextResponse.json({ error: "Invalid action. Use spin or reset." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update spin state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
