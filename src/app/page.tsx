import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_20%,#ffd9b8,transparent_45%),radial-gradient(circle_at_80%_0%,#c7ffd9,transparent_40%),linear-gradient(180deg,#fef6ea_0%,#ecf8ff_100%)] p-3 text-slate-900">
      <main className="mx-auto flex min-h-[95dvh] w-full max-w-[430px] flex-col items-center justify-center rounded-[28px] border border-white/70 bg-white/80 px-5 py-6 text-center shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ebay Randomiser</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">Staff Controls Moved</h1>
        <p className="mt-3 text-sm text-slate-600">Spin, reset, and item editor are protected and available only in the admin panel.</p>
        <Link
          href="/admin"
          className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          Open /admin
        </Link>
      </main>
    </div>
  );
}
