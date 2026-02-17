import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "ebay_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function asBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = asBuffer(a);
  const bBuffer = asBuffer(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function getAdminSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

export function hasAdminAuthConfig(): boolean {
  return getAdminPassword().length > 0 && getAdminSecret().length > 0;
}

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

export function createSessionToken(): string {
  const password = getAdminPassword();
  const secret = getAdminSecret();

  if (!password || !secret) {
    return "";
  }

  return createHmac("sha256", secret).update(password).digest("hex");
}

export function verifyAdminPassword(candidate: string): boolean {
  const password = getAdminPassword();

  if (!password || !candidate) {
    return false;
  }

  return safeEqual(candidate, password);
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = createSessionToken();
  if (!expected) return false;

  return safeEqual(token, expected);
}
