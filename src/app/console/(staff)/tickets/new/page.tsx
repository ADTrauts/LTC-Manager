import { openConsoleTicketAction } from "@/app/console/(staff)/tickets/actions";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

export default async function NewConsoleTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string }>;
}) {
  await requireHarborStaff();
  const { facilityId } = await searchParams;
  const facilities = await prisma.facility.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, billingEmail: true },
    take: 200,
  });
  const selected = facilities.find((row) => row.id === facilityId) ?? facilities[0];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New ticket</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Record the request. The first note stays in Console; use Reply to email the customer.
        </p>
      </header>
      <form action={openConsoleTicketAction} className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium">Facility</span>
          <select
            name="facilityId"
            defaultValue={selected?.id}
            required
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          >
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Subject</span>
          <input
            name="subject"
            required
            minLength={3}
            maxLength={160}
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Requester name</span>
          <input
            name="requesterName"
            maxLength={120}
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Requester email</span>
          <input
            name="requesterEmail"
            type="email"
            required
            defaultValue={selected?.billingEmail ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Note</span>
          <textarea
            name="body"
            required
            rows={5}
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
        >
          Open ticket
        </button>
      </form>
    </div>
  );
}
