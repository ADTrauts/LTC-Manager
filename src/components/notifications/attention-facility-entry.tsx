"use client";

import { useEffect, useRef } from "react";

/** Continue into the Facility that owns this attention. Access is checked by the existing enter route. */
export function AttentionFacilityEntry({ contextKey, next }: { contextKey: string; next: string }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.requestSubmit();
  }, []);
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Attention</h1>
      <p className="mt-2 text-sm text-zinc-600">Opening this item in its facility.</p>
      <form ref={form} method="post" action="/access/enter" className="mt-4">
        <input type="hidden" name="contextKey" value={contextKey} />
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="inline-flex min-h-10 items-center rounded-md border border-zinc-900 px-3 text-sm font-medium text-zinc-900"
        >
          Continue
        </button>
      </form>
    </section>
  );
}
