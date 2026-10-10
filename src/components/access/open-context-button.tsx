"use client";

import { useFormStatus } from "react-dom";

import { enterContextAction } from "@/app/access/actions";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

function OpenSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-70 ${FOCUS_RING_CLASS}`}
    >
      {pending ? "Opening…" : "Open"}
    </button>
  );
}

export function OpenContextButton({ contextKey }: { contextKey: string }) {
  return (
    <form action={enterContextAction}>
      <input type="hidden" name="contextKey" value={contextKey} />
      <OpenSubmit />
    </form>
  );
}
