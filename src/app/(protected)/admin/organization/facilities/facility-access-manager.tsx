"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  grantFacilityAccessAction,
  revokeFacilityAccessAction,
  setUserActiveFacilityAction,
} from "./actions";

type FacilityOption = { id: string; name: string };
type UserOption = { id: string; displayName: string; email: string; facilityId: string };

type GrantRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  facilityId: string;
  facilityName: string;
  isActive: boolean;
  isCurrentFacility: boolean;
};

export function FacilityAccessManager({
  facilities,
  users,
  grants,
}: {
  facilities: FacilityOption[];
  users: UserOption[];
  grants: GrantRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: (fd: FormData) => Promise<void>, formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await action(formData);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="facility-access-manager">
      <form
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void run(grantFacilityAccessAction, new FormData(e.currentTarget));
        }}
      >
        <h2 className="text-base font-semibold text-zinc-900">Grant facility access</h2>
        <p className="text-sm text-zinc-600">
          Grants are explicit. Shared Organization membership alone does not authorize a facility.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">User</span>
            <select
              name="targetUserId"
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              disabled={pending}
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Facility</span>
            <select
              name="targetFacilityId"
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              disabled={pending}
            >
              <option value="">Select facility…</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="app-accent-button rounded-md px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
        >
          {pending ? "Working…" : "Grant access"}
        </button>
      </form>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Active grants</h2>
        <ul className="mt-3 divide-y divide-zinc-100">
          {grants.length === 0 ? (
            <li className="py-3 text-sm text-zinc-500">No active grants in this organization.</li>
          ) : (
            grants.map((g) => (
              <li key={g.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-zinc-900">
                    {g.userName}{" "}
                    <span className="font-normal text-zinc-500">→ {g.facilityName}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {g.userEmail}
                    {g.isCurrentFacility ? " · current facility" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!g.isCurrentFacility ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(setUserActiveFacilityAction, new FormData(e.currentTarget));
                      }}
                    >
                      <input type="hidden" name="targetUserId" value={g.userId} />
                      <input type="hidden" name="targetFacilityId" value={g.facilityId} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Set active
                      </button>
                    </form>
                  ) : null}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(revokeFacilityAccessAction, new FormData(e.currentTarget));
                    }}
                  >
                    <input type="hidden" name="targetUserId" value={g.userId} />
                    <input type="hidden" name="targetFacilityId" value={g.facilityId} />
                    <button
                      type="submit"
                      disabled={pending || g.isCurrentFacility}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        g.isCurrentFacility
                          ? "Switch the user to another facility before revoking"
                          : "Revoke access"
                      }
                    >
                      Revoke
                    </button>
                  </form>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
