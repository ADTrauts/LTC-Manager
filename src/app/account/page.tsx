import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/app/account/profile-form";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { typeClasses } from "@/lib/design-system";
import { listFacilityAdministratorInvitationsForInvitee } from "@/lib/facility-administrator";
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
  const administratorInvitations = await listFacilityAdministratorInvitationsForInvitee(prisma, {
    userId: session.uid,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className={typeClasses.pageTitle}>My Account</h1>
      <p className="mt-2 text-sm text-zinc-600">Who you are and how you sign in.</p>

      {administratorInvitations.length > 0 ? (
        <section
          className="mt-8 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4"
          data-testid="account-facility-administrator-invitations"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Facility Administrator invitation</h2>
          <p className="text-sm text-zinc-700">
            You have been invited to become Facility Administrator of{" "}
            {administratorInvitations.map((invitation) => invitation.facilityName).join(", ")}.
          </p>
          <Link
            href="/account/facility-administrator"
            className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
          >
            Review invitation
          </Link>
        </section>
      ) : null}

      <section className="mt-8 space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Profile</h2>
        <ProfileForm displayName={user.displayName} email={user.email} />
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Security</h2>
        <p className="text-sm text-zinc-600">Password and sessions</p>
        <Link
          href="/account/security"
          className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
          data-testid="account-security-link"
        >
          Manage security
        </Link>
      </section>
    </main>
  );
}
