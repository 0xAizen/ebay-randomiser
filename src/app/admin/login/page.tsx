type LoginPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

function mapError(errorCode: string | undefined): string | null {
  if (!errorCode) return null;
  if (errorCode === "domain") return "Only @pokebabsi.com Google accounts are allowed.";
  if (errorCode === "config") return "Google admin auth is not configured on the server.";
  if (errorCode === "oauth_state") return "Google login session expired. Please try again.";
  if (errorCode === "oauth_token") return "Could not complete Google token exchange.";
  if (errorCode === "oauth_verify") return "Could not verify Google ID token.";
  return "Login failed. Please try again.";
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const errorMessage = mapError(params.error);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#ffd9b8,transparent_45%),radial-gradient(circle_at_80%_0%,#c7ffd9,transparent_40%),linear-gradient(180deg,#fef6ea_0%,#ecf8ff_100%)] p-3 text-slate-900">
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[430px] items-center justify-center rounded-[28px] border border-white/70 bg-white/80 px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin Access</p>
          <h1 className="text-2xl font-black text-slate-900">/admin Login</h1>
          <p className="text-sm text-slate-600">Sign in with your Google account.</p>

          <a
            href="/api/admin/google/start"
            className="block w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Continue With Google
          </a>

          <p className="text-xs text-slate-500">Allowed domain: @pokebabsi.com</p>
          {errorMessage && <p className="text-xs font-semibold text-rose-700">{errorMessage}</p>}
        </div>
      </main>
    </div>
  );
}
