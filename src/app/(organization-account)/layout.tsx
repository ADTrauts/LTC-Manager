import { redirect } from "next/navigation";

import { getAppSession, isOrganizationScopedSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
};

/**
 * Minimal chrome for organization-scoped account sessions.
 * Not the Facility AppShell and not a corporate portfolio.
 */
export default async function OrganizationAccountLayout({ children }: Props) {
  const session = await getAppSession();
  if (!session) {
    redirect("/login");
  }
  if (!isOrganizationScopedSession(session)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Organization account
            </p>
            <p className="text-sm font-semibold text-zinc-900">{session.name}</p>
          </div>
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
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
