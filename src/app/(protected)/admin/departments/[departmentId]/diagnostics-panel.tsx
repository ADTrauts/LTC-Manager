import { AppCard, SectionHeader, StatusBadge } from "@/components/design-system";
import type { DepartmentAdminView } from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

export function DiagnosticsPanel({ view }: Props) {
  const certification = view.certification;

  if (!view.workingProfile) {
    return (
      <AppCard title="Diagnostics" subtitle="Create a draft profile first." />
    );
  }

  if (!certification) {
    return <AppCard title="Diagnostics" subtitle="No certification result available." />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Diagnostics"
        description="Uses Wave 14B certification validation. Blockers prevent certify; warnings do not."
      />

      <AppCard
        title="Certification readiness"
        actions={
          <StatusBadge
            variant={certification.certifiable ? "success" : "blocked"}
          >
            {certification.certifiable ? "Ready" : "Blocked"}
          </StatusBadge>
        }
      >
        <p className="text-sm text-zinc-600">
          {certification.certifiable
            ? "This draft can be certified. Review warnings before activating."
            : "Fix blockers before certification. Activation requires a CERTIFIED profile."}
        </p>
      </AppCard>

      <AppCard title="Blockers" subtitle={`${certification.errors.length} error(s)`}>
        {certification.errors.length === 0 ? (
          <p className="text-sm text-emerald-700">No certification blockers.</p>
        ) : (
          <ul className="space-y-2">
            {certification.errors.map((error, index) => (
              <li
                key={`${error.code}-${index}`}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
              >
                <span className="font-mono text-xs">{error.code}</span>
                <p className="mt-0.5">{error.message}</p>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <AppCard title="Warnings" subtitle={`${certification.diagnostics.length} warning(s)`}>
        {certification.diagnostics.length === 0 ? (
          <p className="text-sm text-zinc-600">No warnings.</p>
        ) : (
          <ul className="space-y-2">
            {certification.diagnostics.map((diagnostic, index) => (
              <li
                key={`${diagnostic.code}-${index}`}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <span className="font-mono text-xs">{diagnostic.code}</span>
                <p className="mt-0.5">{diagnostic.message}</p>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <AppCard title="Coverage summary">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>Assigned rooms: {view.coverage.assignedRooms}</li>
          <li>Mapped rooms: {view.coverage.mappedRooms}</li>
          <li>Unmapped rooms: {view.coverage.unmappedRooms}</li>
          <li>Active Experiences: {view.coverage.activeExperiences}</li>
          <li>Active Areas: {view.coverage.activeAreas}</li>
          <li>Active Archetypes: {view.coverage.activeArchetypes}</li>
        </ul>
      </AppCard>
    </div>
  );
}
