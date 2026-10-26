"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createOverrideAction } from "@/app/(protected)/staffing/actions";
import { Drawer } from "@/components/drawer";
import { CALL_DOWN_REASON_TEMPLATES } from "@/lib/scheduling/call-down";

type Person = { id: string; firstName: string; lastName: string };
type Place = { id: string; name: string };

export function LogCallOff({
  people,
  places,
  date,
}: {
  people: readonly Person[];
  places: readonly Place[];
  date: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("call-off");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        data-testid="log-call-off"
        className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        Log call-off
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Log call-off"
      >
        <form
          action={async (formData) => {
            const result = await createOverrideAction(formData);
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            setMessage(null);
            setOpen(false);
            router.refresh();
          }}
          className="grid gap-3"
        >
          {message ? (
            <p role="status" className="text-sm text-amber-800">
              {message}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm text-zinc-800">
            Who is out
            <select name="employeeId" required className="rounded-md border border-zinc-300 px-3 py-2">
              <option value="">Select a person</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-800">
            Move to
            <select name="newUnitId" className="rounded-md border border-zinc-300 px-3 py-2">
              <option value="">Not a move</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-800">
            Date
            <input type="date" name="date" required defaultValue={date} className="rounded-md border border-zinc-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm text-zinc-800">
            Reason
            <select
              name="reasonTemplate"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2"
            >
              <option value="">Free-text reason</option>
              {CALL_DOWN_REASON_TEMPLATES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-800">
            Details
            <input
              name="reasonDetails"
              placeholder={template ? "Optional details" : "Reason"}
              required={!template}
              className="rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Save call-off
          </button>
        </form>
      </Drawer>
    </div>
  );
}
