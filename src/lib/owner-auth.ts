import { timingSafeEqual } from "node:crypto";

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function safeEqual(a: string, b: string): boolean {
  const first = toBuffer(a);
  const second = toBuffer(b);

  if (first.length !== second.length) {
    return false;
  }

  return timingSafeEqual(first, second);
}

export function getOwnerEditorPassword(): string {
  return process.env.OWNER_EDITOR_PASSWORD ?? "";
}

export function verifyOwnerEditorPassword(candidate: string): boolean {
  const expected = getOwnerEditorPassword();

  if (!expected || !candidate) {
    return false;
  }

  return safeEqual(expected, candidate);
}
