import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isOwnerSession, verifySessionToken } from "@/lib/admin-auth";
import { makeCatalogId, readStaffCatalog, writeStaffCatalog } from "@/lib/staff-catalog";

async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await readStaffCatalog();
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load staff catalog.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: "verifyOwner" | "add" | "remove" | "update";
      name?: string;
      gbpValue?: number;
      id?: string;
    };
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    const isOwner = isOwnerSession(token);

    if (body.action === "verifyOwner") {
      return NextResponse.json({ ok: isOwner });
    }

    if (!isOwner) {
      return NextResponse.json({ error: "Only owner account can edit catalog." }, { status: 403 });
    }

    const items = await readStaffCatalog();

    if (body.action === "add") {
      const name = body.name?.trim() ?? "";
      const gbpValue = Number(body.gbpValue);

      if (!name) {
        return NextResponse.json({ error: "Item name is required." }, { status: 400 });
      }

      if (!Number.isFinite(gbpValue) || gbpValue <= 0) {
        return NextResponse.json({ error: "GBP value must be greater than 0." }, { status: 400 });
      }

      const exists = items.some((item) => item.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        return NextResponse.json({ error: "Item already exists." }, { status: 400 });
      }

      items.push({ id: makeCatalogId(name), name, gbpValue });
      await writeStaffCatalog(items);
      return NextResponse.json({ items });
    }

    if (body.action === "remove") {
      const id = body.id?.trim() ?? "";
      if (!id) {
        return NextResponse.json({ error: "Item id is required." }, { status: 400 });
      }

      const nextItems = items.filter((item) => item.id !== id);
      if (nextItems.length === items.length) {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }

      await writeStaffCatalog(nextItems);
      return NextResponse.json({ items: nextItems });
    }

    if (body.action === "update") {
      const id = body.id?.trim() ?? "";
      const name = body.name?.trim() ?? "";
      const gbpValue = Number(body.gbpValue);

      if (!id) {
        return NextResponse.json({ error: "Item id is required." }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json({ error: "Item name is required." }, { status: 400 });
      }
      if (!Number.isFinite(gbpValue) || gbpValue <= 0) {
        return NextResponse.json({ error: "GBP value must be greater than 0." }, { status: 400 });
      }

      const existsWithDifferentId = items.some(
        (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
      );
      if (existsWithDifferentId) {
        return NextResponse.json({ error: "Another catalog item already uses that name." }, { status: 400 });
      }

      let found = false;
      const nextItems = items.map((item) => {
        if (item.id !== id) return item;
        found = true;
        return {
          ...item,
          name,
          gbpValue,
        };
      });

      if (!found) {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }

      await writeStaffCatalog(nextItems);
      return NextResponse.json({ items: nextItems });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update staff catalog.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
