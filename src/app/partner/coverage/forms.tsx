"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addPartnerShiftAction,
  callOffPartnerShiftAction,
  createPartnerTeamAction,
  movePartnerAssignmentAction,
  type PartnerCoverageResult,
} from "@/app/partner/coverage/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function Result({ state }: { state: PartnerCoverageResult }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-emerald-800" : "text-amber-800"}`}>
      {state.message}
    </p>
  );
}

export function PartnerCoverageForms({
  people,
  places,
}: {
  people: Array<{ id: string; name: string }>;
  places: Array<{ id: string; name: string }>;
}) {
  const [shift, shiftAction] = useActionState(addPartnerShiftAction, null);
  const [callOff, callOffAction] = useActionState(callOffPartnerShiftAction, null);
  const [move, moveAction] = useActionState(movePartnerAssignmentAction, null);
  const [team, teamAction] = useActionState(createPartnerTeamAction, null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={shiftAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a shift</h2>
        <select name="employeeId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Person</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <input name="serviceDate" type="date" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input name="plannedStart" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input name="plannedEnd" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <Submit label="Save shift" />
        <Result state={shift} />
      </form>
      <form action={callOffAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Call off</h2>
        <select name="employeeId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Person</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <input name="serviceDate" type="date" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="reason" placeholder="Reason" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <Submit label="Mark call-off" />
        <Result state={callOff} />
      </form>
      <form action={moveAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Move the day's assignment</h2>
        <select name="employeeId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Person</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <select name="unitId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Room</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
        <input name="serviceDate" type="date" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="reason" placeholder="Reason" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <Submit label="Move assignment" />
        <Result state={move} />
      </form>
      <form action={teamAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a team</h2>
        <input name="displayName" required maxLength={80} placeholder="Team name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <Submit label="Add team" />
        <Result state={team} />
      </form>
    </div>
  );
}
