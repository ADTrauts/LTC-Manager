import { ChangePasswordForm } from "@/app/(protected)/account/change-password-form";
import { requireFacilitySession } from "@/lib/facility-context";

export default async function AccountPage() {
  const session = await requireFacilitySession();

  if (session.authKind !== "user") {
    return (
      <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-zinc-900">Account</h1>
        <p className="text-sm text-zinc-600">
          This session uses PIN sign-in. Password changes are only available for email/password accounts.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
      <h1 className="text-lg font-semibold text-zinc-900">Account</h1>
      <p className="text-sm text-zinc-600">Signed in as {session.email || session.name}.</p>
      <ChangePasswordForm />
    </section>
  );
}
