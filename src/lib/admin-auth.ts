import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "ebay_admin_session";
export const ADMIN_OAUTH_STATE_COOKIE = "ebay_admin_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const STATE_TTL_SECONDS = 60 * 10;

type SignedPayload = {
  exp: number;
  [key: string]: unknown;
};

type SessionPayload = SignedPayload & {
  email: string;
};

function asBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = asBuffer(a);
  const bBuffer = asBuffer(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function createSignedToken(payload: SignedPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifySignedToken<T extends SignedPayload>(token: string, secret: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as T;
    if (!payload?.exp || !Number.isInteger(payload.exp)) return null;
    if (payload.exp < nowEpoch()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAdminSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

export function getGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? "";
}

export function getGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

export function getAllowedGoogleDomain(): string {
  return (process.env.ADMIN_GOOGLE_DOMAIN ?? "pokebabsi.com").trim().toLowerCase();
}

export function getOwnerEmail(): string {
  return (process.env.ADMIN_OWNER_EMAIL ?? "zian@pokebabsi.com").trim().toLowerCase();
}

export function hasAdminAuthConfig(): boolean {
  return getAdminSecret().length > 0 && getGoogleClientId().length > 0 && getGoogleClientSecret().length > 0;
}

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

export function getStateTtlSeconds(): number {
  return STATE_TTL_SECONDS;
}

export function createOAuthStateToken(): string {
  const secret = getAdminSecret();
  if (!secret) return "";

  return createSignedToken(
    {
      nonce: randomBytes(16).toString("hex"),
      exp: nowEpoch() + STATE_TTL_SECONDS,
    },
    secret,
  );
}

export function verifyOAuthStateToken(token: string | undefined): boolean {
  if (!token) return false;
  const secret = getAdminSecret();
  if (!secret) return false;
  return verifySignedToken<SignedPayload>(token, secret) !== null;
}

export function createSessionToken(email: string): string {
  const secret = getAdminSecret();
  if (!secret || !email) return "";

  return createSignedToken(
    {
      email: email.toLowerCase(),
      exp: nowEpoch() + SESSION_TTL_SECONDS,
    },
    secret,
  );
}

export function verifySessionToken(token: string | undefined): boolean {
  const email = getSessionEmail(token);
  return email !== null;
}

export function getSessionEmail(token: string | undefined): string | null {
  if (!token) return null;
  const secret = getAdminSecret();
  if (!secret) return null;

  const payload = verifySignedToken<SessionPayload>(token, secret);
  if (!payload?.email) return null;

  const allowedDomain = getAllowedGoogleDomain();
  const email = payload.email.toLowerCase();
  if (!email.endsWith(`@${allowedDomain}`)) return null;
  return email;
}

export function isOwnerSession(token: string | undefined): boolean {
  const email = getSessionEmail(token);
  if (!email) return false;
  return email === getOwnerEmail();
}
