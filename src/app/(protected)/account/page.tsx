import Link from "next/link";

import { ChangePasswordForm } from "@/app/(protected)/account/change-password-form";
import { CUSTOMER_SUPPORT_HREF } from "@/lib/customer-support";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { requireFacilitySession } from "@/lib/facility-context";

function AccountSupportSection() {
  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-4"
      data-testid="account-support-section"
    >
      <h2 className="text-lg font-semibold text-zinc-900">Support</h2>
      <p className="mt-1 text-sm text-zinc-600">Need help with Vssyl?</p>
      <Link
        href={CUSTOMER_SUPPORT_HREF}
        className={`mt-3 inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
        data-testid="account-support-link"
      >
        Help & Support
      </Link>
    </section>
  );
}

export default async function AccountPage() {
  const session = await requireFacilitySession();

  if (session.authKind !== "user") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
          <h1 className="text-lg font-semibold text-zinc-900">Account</h1>
          <p className="text-sm text-zinc-600">
            This session uses PIN sign-in. Password changes are only available for email/password
            accounts.
          </p>
        </section>
        <AccountSupportSection />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-zinc-900">Account</h1>
        <p className="text-sm text-zinc-600">Signed in as {session.email || session.name}.</p>
        <ChangePasswordForm />
      </section>
      <AccountSupportSection />
    </div>
  );
}
