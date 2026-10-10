export const dynamic = "force-dynamic";

export default function AccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <p className="text-sm font-semibold tracking-tight text-zinc-900">Vssyl</p>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">My Access</p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-zinc-700 underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
