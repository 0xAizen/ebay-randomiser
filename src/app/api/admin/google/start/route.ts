import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_OAUTH_STATE_COOKIE,
  createOAuthStateToken,
  getAllowedGoogleDomain,
  getGoogleClientId,
  getStateTtlSeconds,
  hasAdminAuthConfig,
} from "@/lib/admin-auth";

function getRedirectUri(request: NextRequest): string {
  const configured = process.env.ADMIN_GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${request.nextUrl.origin}/api/admin/google/callback`;
}

export async function GET(request: NextRequest) {
  if (!hasAdminAuthConfig()) {
    return NextResponse.redirect(new URL("/admin/login?error=config", request.url));
  }

  const state = createOAuthStateToken();
  if (!state) {
    return NextResponse.redirect(new URL("/admin/login?error=config", request.url));
  }

  const redirectUri = getRedirectUri(request);
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: getAllowedGoogleDomain(),
    prompt: "select_account",
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set({
    name: ADMIN_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getStateTtlSeconds(),
  });

  return response;
}
