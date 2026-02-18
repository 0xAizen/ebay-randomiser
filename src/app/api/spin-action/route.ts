import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import {
  clearSpinHistory,
  resetPoolAndClearHistory,
  resetSpinState,
  runBuyersGiveaway,
  setCurrentBuyersGiveawayItem,
  setPublicOffline,
  setTestingMode,
  spinOnce,
} from "@/lib/spin-state";
import { verifyOwnerEditorPassword } from "@/lib/owner-auth";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      auctionNumber?: string;
      username?: string;
      isOffline?: boolean;
      isTestingMode?: boolean;
      ownerPassword?: string;
      giveawayItemName?: string;
    };

    if (body.action === "spin") {
      const state = await spinOnce({
        auctionNumber: body.auctionNumber ?? "",
        username: body.username ?? "",
      });
      return NextResponse.json(state);
    }

    if (body.action === "reset") {
      const state = await resetSpinState();
      return NextResponse.json(state);
    }

    if (body.action === "setOffline") {
      if (typeof body.isOffline !== "boolean") {
        return NextResponse.json({ error: "isOffline must be a boolean." }, { status: 400 });
      }

      const state = await setPublicOffline(body.isOffline);
      return NextResponse.json(state);
    }

    if (body.action === "clearHistory") {
      const state = await clearSpinHistory();
      return NextResponse.json(state);
    }

    if (body.action === "resetPoolAndHistory") {
      const state = await resetPoolAndClearHistory();
      return NextResponse.json(state);
    }

    if (body.action === "setTestingMode") {
      if (!verifyOwnerEditorPassword(body.ownerPassword ?? "")) {
        return NextResponse.json({ error: "Owner password is invalid." }, { status: 403 });
      }
      if (typeof body.isTestingMode !== "boolean") {
        return NextResponse.json({ error: "isTestingMode must be a boolean." }, { status: 400 });
      }
      const state = await setTestingMode(body.isTestingMode);
      return NextResponse.json(state);
    }

    if (body.action === "runBuyersGiveaway") {
      const state = await runBuyersGiveaway(body.giveawayItemName);
      return NextResponse.json(state);
    }

    if (body.action === "setCurrentBuyersGiveawayItem") {
      const state = await setCurrentBuyersGiveawayItem(body.giveawayItemName ?? "");
      return NextResponse.json(state);
    }

    return NextResponse.json(
      {
        error:
          "Invalid action. Use spin, reset, setOffline, clearHistory, resetPoolAndHistory, setTestingMode, runBuyersGiveaway, or setCurrentBuyersGiveawayItem.",
      },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update spin state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
