import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_OAUTH_STATE_COOKIE,
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  getAllowedGoogleDomain,
  getGoogleClientId,
  getGoogleClientSecret,
  getSessionTtlSeconds,
  hasAdminAuthConfig,
  verifyOAuthStateToken,
} from "@/lib/admin-auth";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
};

type TokenInfoResponse = {
  aud?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
};

function getRedirectUri(request: NextRequest): string {
  const configured = process.env.ADMIN_GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${request.nextUrl.origin}/api/admin/google/callback`;
}

function loginErrorRedirect(request: NextRequest, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/login?error=${code}`, request.url));
}

export async function GET(request: NextRequest) {
  if (!hasAdminAuthConfig()) {
    return loginErrorRedirect(request, "config");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(ADMIN_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !stateCookie) {
    return loginErrorRedirect(request, "oauth_state");
  }

  if (state !== stateCookie || !verifyOAuthStateToken(state)) {
    return loginErrorRedirect(request, "oauth_state");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: getRedirectUri(request),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenPayload.id_token) {
    return loginErrorRedirect(request, "oauth_token");
  }

  const tokenInfoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenPayload.id_token)}`,
    { cache: "no-store" },
  );
  const tokenInfo = (await tokenInfoResponse.json()) as TokenInfoResponse;

  if (!tokenInfoResponse.ok) {
    return loginErrorRedirect(request, "oauth_verify");
  }

  const email = tokenInfo.email?.toLowerCase() ?? "";
  const emailVerified = tokenInfo.email_verified === "true";
  const audienceMatches = tokenInfo.aud === getGoogleClientId();
  const allowedDomain = getAllowedGoogleDomain();

  if (!email || !emailVerified || !audienceMatches || !email.endsWith(`@${allowedDomain}`)) {
    return loginErrorRedirect(request, "domain");
  }

  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createSessionToken(email),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionTtlSeconds(),
  });
  response.cookies.set({
    name: ADMIN_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
