import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isOwnerSession, verifySessionToken } from "@/lib/admin-auth";
import { getSpinState } from "@/lib/spin-state";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await getSpinState();
    const isOwner = isOwnerSession(token);
    const totalCount = state.items.length;
    const remainingCount = state.pool.length;
    const removedCount = totalCount - remainingCount;

    return NextResponse.json({
      ...state,
      isOwner,
      totalCount,
      remainingCount,
      removedCount,
      progressPercent: totalCount === 0 ? 0 : (removedCount / totalCount) * 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load spin state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
