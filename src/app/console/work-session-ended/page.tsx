import { HarborAuthFrame } from "@/components/harbor-auth-frame";

export default function RetiredHarborWorkSessionPage() {
  return (
    <HarborAuthFrame
      title="Facility work session ended"
      description="Staff Facility workspace access is paused. Clear the old work session to continue."
    >
      <form action="/api/console/work-session/end" method="post">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
        >
          Clear old work session
        </button>
      </form>
    </HarborAuthFrame>
  );
}
