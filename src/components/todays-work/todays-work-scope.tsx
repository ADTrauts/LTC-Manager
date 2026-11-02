import {
  formatViewerTeamScopeLabel,
  type ViewerTeamScope,
} from "@/lib/todays-work/viewer-team-scope";

export function TodaysWorkScopeLabel({
  scope,
  locationCount,
}: {
  scope: ViewerTeamScope | null;
  locationCount: number;
}) {
  if (!scope) return null;
  return (
    <p className="text-sm text-zinc-600" data-testid="todays-work-scope">
      <span className="text-zinc-500">Scope: </span>
      <span className="font-medium text-zinc-800">{formatViewerTeamScopeLabel(scope)}</span>
      {scope.mode !== "ASSIGNMENT_WITHOUT_PLACEMENT" ? (
        <span>
          {" "}
          · {locationCount} operating location{locationCount === 1 ? "" : "s"}
        </span>
      ) : null}
    </p>
  );
}

export function TodaysWorkTeamUnconfigured({ scope }: { scope: ViewerTeamScope }) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 sm:px-4"
      data-testid="todays-work-team-unconfigured"
    >
      <p className="text-sm font-medium text-zinc-900">No assignment places you in a room today.</p>
      <p className="mt-1 text-sm text-zinc-600">
        Today’s locations come from your Operational Assignment.
      </p>
      <p className="mt-2 text-xs text-zinc-500">Scope: {formatViewerTeamScopeLabel(scope)}</p>
    </div>
  );
}
