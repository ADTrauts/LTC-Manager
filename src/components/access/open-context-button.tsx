import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export function OpenContextButton({ contextKey }: { contextKey: string }) {
  return (
    <form action="/access/enter" method="post">
      <input type="hidden" name="contextKey" value={contextKey} />
      <button
        type="submit"
        className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
      >
        Open
      </button>
    </form>
  );
}
