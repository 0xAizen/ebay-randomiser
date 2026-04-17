import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveRandomiserChannel } from "@/lib/server-channels";
import { expandItemEntries, getTotalQty, parseItemConfig } from "@/lib/item-config";
import { readItemConfigText, writeItemConfigText } from "@/lib/item-config-store";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { resetSpinStateFromItems } from "@/lib/spin-state";
import { readStaffCatalog } from "@/lib/staff-catalog";

async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

async function readConfigText(channel: string | null | undefined): Promise<string> {
  return readItemConfigText(resolveRandomiserChannel(channel));
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const channel = resolveRandomiserChannel(new URL(request.url).searchParams.get("channel"));
    const configText = await readConfigText(channel);
    const entries = parseItemConfig(configText);
    const expandedItems = expandItemEntries(entries);

    return NextResponse.json({
      configText,
      totalItems: getTotalQty(entries),
      expandedItems,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load item configuration. Check data/items-config.txt" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const channel = resolveRandomiserChannel(new URL(request.url).searchParams.get("channel"));
    const body = (await request.json()) as { configText?: string };

    if (typeof body.configText !== "string") {
      return NextResponse.json({ error: "configText must be a string." }, { status: 400 });
    }

    const normalized = `${body.configText.replace(/\r\n/g, "\n").trim()}\n`;
    const entries = parseItemConfig(normalized);
    const catalog = await readStaffCatalog();
    const allowedNames = new Set(catalog.map((item) => item.name));

    for (const entry of entries) {
      if (!allowedNames.has(entry.name)) {
        return NextResponse.json(
          { error: `Invalid item \"${entry.name}\". Only predefined catalog items are allowed.` },
          { status: 400 },
        );
      }
    }

    const totalItems = getTotalQty(entries);

    if (totalItems > 500) {
      return NextResponse.json(
        { error: "Total quantity is too large. Keep total at 500 items or fewer." },
        { status: 400 },
      );
    }

    await writeItemConfigText(normalized, channel);
    const expandedItems = expandItemEntries(entries);
    const state = await resetSpinStateFromItems(
      expandedItems,
      `Pool config updated on ${new Date().toISOString()}. Run reset and history cleared.`,
      channel,
    );

    return NextResponse.json({
      configText: normalized,
      totalItems,
      expandedItems,
      state,
      message: "Item configuration saved. Run was reset and history cleared for audit integrity.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save item configuration.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
