import Link from "next/link";
import { redirect } from "next/navigation";

import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { typeClasses } from "@/lib/design-system";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserSession } from "@/lib/user-session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getAuthenticatedUserSession();
  if (!session) {
    redirect("/login");
  }
  const user = await prisma.user.findFirst({
    where: { id: session.uid, isActive: true },
    select: { displayName: true, email: true },
  });
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className={typeClasses.pageTitle}>My Account</h1>
      <p className="mt-2 text-sm text-zinc-600">Who you are and how you sign in.</p>

      <section className="mt-8 space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Profile</h2>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Display name</p>
          <p className="mt-1 text-sm text-zinc-900" data-testid="account-display-name">
            {user.displayName}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Email</p>
          <p className="mt-1 text-sm text-zinc-900" data-testid="account-email">
            {user.email}
          </p>
        </div>
      </section>

      <div className="mt-6">
        <Link
          href="/account/security"
          className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
          data-testid="account-security-link"
        >
          Security
        </Link>
      </div>
    </main>
  );
}
