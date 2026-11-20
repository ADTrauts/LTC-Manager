import Link from "next/link";
import { notFound } from "next/navigation";

import { OwnerPasskeyEnrollment, StaffInvitationForm, StaffRecoveryApproval } from "@/components/harbor-console/staff-administration-forms";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { productionStaffLifecycleConfig } from "@/lib/harbor-console/lifecycle/gate";
import { loadStaffAccess } from "@/lib/harbor-console/lifecycle/presentation";

export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireHarborStaff();
  const config = productionStaffLifecycleConfig();
  if (!config) notFound();
  const query = await searchParams;
  const access = await loadStaffAccess(config, session, Number(query.page ?? 1));
  return <div className="space-y-8">
    <header><h1 className="text-2xl font-semibold">Vssyl staff access</h1><p>Internal staff accounts. Customer Facility accounts are managed separately.</p></header>
    {access.canEnrollOwner ? <OwnerPasskeyEnrollment /> : <p>Your staff login has {access.passkeyCount > 0 ? "a passkey enrolled" : "no enrolled passkey"}.</p>}
    {access.passkeyCount > 0 && (access.canInvite || access.canApproveRoster) && <StaffInvitationForm canApproveRoster={access.canApproveRoster} canInvite={access.canInvite} />}
    {!config.invitationsEnabled && session.staffRole === "OWNER" && <p>Staff invitations are not enabled.</p>}
    {!config.recoveryEnabled && session.staffRole === "OWNER" && <p>Independent recovery is not enabled. An independent approver and recovery procedure must be designated first.</p>}
    {access.staffCount > 0 && <section className="space-y-3"><h2 className="font-semibold">Staff · {access.staffCount}</h2>
      <ul className="space-y-3">{access.staff.map((staff) => <li key={staff.id} className="rounded-md border border-[var(--border)] p-3">
        <p className="font-medium">{staff.displayName}</p><p>{staff.email}</p>
        <p>{staff.role === "OWNER" ? "Owner" : "Member"} · {staff.isActive ? "Active" : "Inactive"} · {staff._count.lifecyclePasskeys > 0 ? "Passkey enrolled" : "Passkey not enrolled"}</p>
      </li>)}</ul></section>}
    {access.canReviewRecovery && <section className="space-y-3"><h2 className="font-semibold">Pending independent recovery · {access.recoveryCount}</h2>
      {access.recoveries.length === 0 && <p>No recovery requests await your approval.</p>}
      {access.recoveries.map((intent) => <article key={intent.id} className="rounded-md border border-[var(--border)] p-4">
        <h3 className="font-medium">{intent.email}</h3><p>Expires {intent.expiresAt.toISOString()} (UTC)</p>
        <StaffRecoveryApproval intentId={intent.id} />
      </article>)}
    </section>}
    {access.invitationCount > 0 && <section className="space-y-3"><h2 className="font-semibold">Pending invitations · {access.invitationCount}</h2>
      <ul>{access.invitations.map((invite) => <li key={invite.id}>{invite.email} · Expires {invite.expiresAt.toISOString()} (UTC)</li>)}</ul>
    </section>}
    {access.pageCount > 1 && <nav aria-label="Staff pages" className="flex gap-4">
      {access.page > 1 && <Link prefetch={false} href={`/console/staff?page=${access.page - 1}`}>Previous</Link>}
      <span>Page {access.page} of {access.pageCount}</span>
      {access.page < access.pageCount && <Link prefetch={false} href={`/console/staff?page=${access.page + 1}`}>Next</Link>}
    </nav>}
  </div>;
}
