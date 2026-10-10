import Link from "next/link";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/app/account/security/change-password-form";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { typeClasses } from "@/lib/design-system";
import { getAuthenticatedUserSession } from "@/lib/user-session";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const session = await getAuthenticatedUserSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link
          href="/account"
          className={`font-medium text-zinc-700 underline underline-offset-2 ${FOCUS_RING_CLASS}`}
        >
          Back to My Account
        </Link>
      </p>
      <h1 className={`${typeClasses.pageTitle} mt-4`}>Security</h1>
      <section className="mt-8 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Password</h2>
        <p className="text-sm text-zinc-600">
          Changing your password signs you out of Vssyl on all devices, including this one.
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
