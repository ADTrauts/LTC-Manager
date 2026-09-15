import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";

import {
  retireAssetAction,
  updateAssetIdentityAction,
  updateAssetStatusAction,
} from "@/app/(protected)/assets/actions";
import { createWorkOrderFromAssetIssueAction } from "@/app/(protected)/asset-issues/actions";
import { AssetIssueReportPanel } from "@/components/asset-operations/asset-issue-report-panel";
import { AssetUnitSpaceFields } from "@/components/asset-operations/asset-unit-space-fields";
import { ASSET_CRITICALITY_OPTIONS, assetCriticalityLabel } from "@/lib/asset-criticality";
import {
  assetIssueStatusLabel,
  conditionToneClass,
  formatAssetLocationAriaLabel,
  formatAssetLocationLabel,
  getAssetProfile,
  operationalImpactLabel,
  preferredRepairProviderDisplayLabel,
  presentAssetLifecycleAndCondition,
  projectAssetResponsibility,
  resolveAssetOperationsAuthority,
  responsibleOrganizationDisplayLabel,
  departmentDisplayLabel,
  ensureAndListResponsibleOrganizations,
  runConditionSelectValues,
  workOrderStatusLabel,
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { resolveFacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { isCanonicalLogsEnabled, isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import { prisma } from "@/lib/prisma";
import { TargetLogsSection } from "@/components/canonical-logs/target-logs-section";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import { hasAtLeastRole } from "@/lib/access";

type Props = {
  params: Promise<{ assetId: string }>;
};

export default async function AssetProfilePage({ params }: Props) {
  noStore();
  if (!isDietaryAssetOperationsEnabled()) {
    redirect("/assets");
  }

  const { assetId } = await params;
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const assetRow = await prisma.asset.findFirst({
    where: { id: assetId, unit: { facilityId: session.facilityId } },
    select: {
      id: true,
      departmentId: true,
      unitId: true,
      department: { select: { id: true, key: true } },
    },
  });
  if (!assetRow) notFound();

  const departmentId =
    assetRow.departmentId ??
    (
      await prisma.department.findFirst({
        where: { facilityId: session.facilityId, key: "DIETARY", isActive: true },
        select: { id: true },
      })
    )?.id;
  if (!departmentId) {
    redirect("/assets");
  }

  let profile;
  try {
    profile = await getAssetProfile(session, {
      facilityId: session.facilityId,
      departmentId,
      assetId,
    });
  } catch {
    notFound();
  }

  const authority = await resolveAssetOperationsAuthority(
    session,
    session.facilityId,
    departmentId,
  );

  const [units, spaces, vendors, organizations, departments, facility] = await Promise.all([
    prisma.unit.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, isActive: true, unitId: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, unitId: true },
    }),
    authority.canViewVendorDetails || authority.canManageAssets
      ? prisma.vendor.findMany({
          where: { facilityId: session.facilityId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    ensureAndListResponsibleOrganizations(prisma, session.facilityId),
    prisma.department.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.facility.findFirst({
      where: { id: session.facilityId },
      select: {
        vocabularyProfile: true,
        vocabularyLevel1Label: true,
        vocabularyLevel2Label: true,
        vocabularyLevel3Label: true,
      },
    }),
  ]);

  const cookieStore = await cookies();
  const deviceFacilityId = cookieStore.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null;
  const deviceBoundUnitId = cookieStore.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null;

  const identity = profile.identity;
  const roomTerm = resolveFacilityVocabulary(facility).level3.singular;
  const locationLabel = formatAssetLocationLabel({
    unitName: identity.unit.name,
    spaceName: identity.space?.name,
    roomTerm,
  });
  const locationAria = formatAssetLocationAriaLabel({
    unitName: identity.unit.name,
    spaceName: identity.space?.name,
    roomTerm,
  });
  const presentation = presentAssetLifecycleAndCondition(profile.status.raw);
  const conditionOptions = runConditionSelectValues(profile.status.raw);
  const repairsById = new Map(profile.activeWorkOrders.map((wo) => [wo.id, wo]));
  const responsibility = projectAssetResponsibility({
    department: identity.department,
    responsibleOrganization: identity.responsibleOrganization,
    preferredRepairProvider: identity.vendor,
  });

  const showCanonicalLogs =
    isCanonicalLogsEnabled() && hasAtLeastRole(session.role, "MANAGER");
  const logsCtx = showCanonicalLogs
    ? await loadTargetLogsBuildContext({
        facilityId: session.facilityId,
        targetKind: "ASSET",
        targetId: assetId,
        departmentId,
      })
    : null;

  return (
    <section className="space-y-6" data-testid="asset-profile-page">
      <header className="space-y-2" data-testid="asset-identity-header">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          <Link href="/assets" className="underline underline-offset-2">
            Assets
          </Link>
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {identity.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {identity.assetCode}
              {identity.facilityAssetNumber ? ` · #${identity.facilityAssetNumber}` : ""}
              {" · "}
              {identity.equipmentType}
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              <span aria-label={locationAria}>{locationLabel}</span>
              {" · "}
              {identity.department?.name ?? (
                <span className="text-amber-700">No responsible department</span>
              )}
            </p>
          </div>
          <div className="text-right" data-testid="asset-condition">
            {presentation.lifecycle === "RETIRED" ? (
              <p className={`text-base ${conditionToneClass("retired")}`} aria-label="Lifecycle Retired">
                Retired
              </p>
            ) : (
              <p
                className={`text-base ${conditionToneClass(presentation.conditionTone)}`}
                aria-label={`Condition ${presentation.conditionLabel}`}
              >
                {presentation.conditionLabel}
              </p>
            )}
            <p className="text-xs text-zinc-500">
              {assetCriticalityLabel(identity.criticality)}
              {presentation.lifecycle === "RETIRED" && profile.status.retiredAt
                ? ` · Retired ${profile.status.retiredAt.toLocaleDateString()}`
                : null}
            </p>
          </div>
        </div>
      </header>

      {logsCtx ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <TargetLogsSection
            targetTitle={logsCtx.label.title}
            targetSubtitle={logsCtx.label.subtitle}
            attachments={logsCtx.attachments}
            addHref={logsCtx.addHref}
            departmentName={logsCtx.departmentName}
          />
        </div>
      ) : null}

      {presentation.lifecycle !== "RETIRED" && authority.canChangeAssetStatus ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-condition-controls">
          <h2 className="text-lg font-semibold text-zinc-900">Is it working?</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Current condition:{" "}
            <span className={conditionToneClass(presentation.conditionTone)}>
              {presentation.conditionLabel}
            </span>
            . Completing a repair does not automatically return this asset to Operational.
          </p>
          {profile.prospectiveTemplateBindingNote ? (
            <p className="mt-2 text-sm text-amber-800">{profile.prospectiveTemplateBindingNote}</p>
          ) : null}
          <form action={updateAssetStatusAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="assetId" value={identity.id} />
            <input type="hidden" name="departmentId" value={departmentId} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Condition</span>
              <select
                name="status"
                defaultValue={presentation.condition ?? "OPERATIONAL"}
                className="rounded-md border border-zinc-300 px-3 py-2"
                data-testid="asset-status-select"
              >
                {conditionOptions.map((value) => (
                  <option key={value} value={value}>
                    {value === "OPERATIONAL"
                      ? "Operational"
                      : value === "DEGRADED"
                        ? "Degraded"
                        : "Out of Service"}
                  </option>
                ))}
              </select>
            </label>
            <input
              name="note"
              placeholder="Note (optional)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100">
              Update condition
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-responsibility">
        <h2 className="text-lg font-semibold text-zinc-900">Responsibility</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Department user</dt>
            <dd className="mt-0.5 text-zinc-900">{departmentDisplayLabel(responsibility.department)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Responsible maintainer</dt>
            <dd className="mt-0.5 text-zinc-900">
              {responsibleOrganizationDisplayLabel(responsibility.responsibleOrganization)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Preferred repair vendor</dt>
            <dd className="mt-0.5 text-zinc-900">
              {preferredRepairProviderDisplayLabel(responsibility.preferredRepairProvider)}
              {authority.canViewVendorDetails && responsibility.preferredRepairProvider?.phone ? (
                <span className="mt-0.5 block text-xs text-zinc-600">
                  <a
                    href={`tel:${responsibility.preferredRepairProvider.phone}`}
                    className="underline underline-offset-2"
                  >
                    {responsibility.preferredRepairProvider.phone}
                  </a>
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-issues">
        <h2 className="text-lg font-semibold text-zinc-900">Open Issues</h2>
        <p className="mt-1 text-xs text-zinc-500">Reported problems — separate from repairs.</p>
        <div className="mt-2 space-y-2">
          {profile.openIssues.length === 0 ? (
            <p className="text-sm text-zinc-500">No open issues.</p>
          ) : (
            profile.openIssues.map((issue) => {
              const linked = issue.workOrderId ? repairsById.get(issue.workOrderId) : null;
              return (
                <div key={issue.id} className="rounded border border-zinc-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-900">{issue.summary}</p>
                      <p className="text-xs text-zinc-600">
                        {assetIssueStatusLabel(issue.status)} ·{" "}
                        {operationalImpactLabel(issue.operationalImpact)} · Reported{" "}
                        {issue.reportedAt.toLocaleDateString()}
                      </p>
                      {linked ? (
                        <p className="mt-1 text-xs text-zinc-700">
                          Linked repair: {linked.title} · {workOrderStatusLabel(linked.status)}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">No repair yet.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/asset-issues/${issue.id}`}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                        aria-label={`View issue ${issue.summary}`}
                      >
                        View issue
                      </Link>
                      {!issue.workOrderId && authority.canManageWorkOrders ? (
                        <form action={createWorkOrderFromAssetIssueAction}>
                          <input type="hidden" name="issueId" value={issue.id} />
                          <input type="hidden" name="departmentId" value={departmentId} />
                          <button
                            type="submit"
                            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white"
                            aria-label={`Create repair for ${issue.summary}`}
                          >
                            Create repair
                          </button>
                        </form>
                      ) : linked ? (
                        <Link
                          href={`/repairs/${linked.id}`}
                          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                          aria-label={`View repair ${linked.title}`}
                        >
                          View repair
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {authority.canReportIssue && presentation.lifecycle !== "RETIRED" ? (
          <div className="mt-4">
            <AssetIssueReportPanel
              facilityId={session.facilityId}
              departmentId={departmentId}
              unitId={identity.unit.id}
              defaultAssetId={identity.id}
              assets={[
                {
                  id: identity.id,
                  name: identity.name,
                  assetCode: identity.assetCode,
                  statusLabel: presentation.summaryLabel,
                  openIssueAlreadyReported: profile.openIssues.length > 0,
                },
              ]}
              deviceFacilityId={deviceFacilityId}
              deviceBoundUnitId={deviceBoundUnitId}
              actorRef={actorRefForSession(session)}
              sessionVersion={session.sessionVersion ?? 0}
              compact
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-work-orders">
        <h2 className="text-lg font-semibold text-zinc-900">Repairs</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Work being done to address an issue or maintenance need (work orders).
        </p>
        <div className="mt-2 space-y-2">
          {profile.activeWorkOrders.length === 0 ? (
            <p className="text-sm text-zinc-500">No open repairs.</p>
          ) : (
            profile.activeWorkOrders.map((wo) => (
              <Link
                key={wo.id}
                href={`/repairs/${wo.id}`}
                className="block rounded border border-zinc-200 p-2 text-sm hover:bg-zinc-50"
                aria-label={`View repair ${wo.title}`}
              >
                <span className="font-medium text-zinc-900">
                  {wo.repairCode} · {wo.title}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">
                  {workOrderStatusLabel(wo.status)}
                  {wo.returnToServiceReady ? " · Ready to return to service (confirm on asset)" : ""}
                  {wo.sourceAssetIssue
                    ? ` · For issue: ${wo.sourceAssetIssue.summary}`
                    : " · Direct repair (no linked reported issue)"}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-history">
        <h2 className="text-lg font-semibold text-zinc-900">Recent activity</h2>
        <ol className="mt-3 space-y-2">
          {profile.history.length === 0 ? (
            <li className="text-sm text-zinc-500">No recent activity.</li>
          ) : (
            profile.history.map((event) => (
              <li key={event.id} className="border-l-2 border-zinc-200 pl-3 text-sm text-zinc-700">
                <p className="font-medium text-zinc-900">{event.title}</p>
                <p className="text-xs text-zinc-500">{event.at.toLocaleString()}</p>
                {event.detail ? <p className="text-xs text-zinc-600">{event.detail}</p> : null}
                {event.href ? (
                  <Link href={event.href} className="text-xs underline underline-offset-2">
                    Open
                  </Link>
                ) : null}
              </li>
            ))
          )}
        </ol>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-evidence">
        <h2 className="text-lg font-semibold text-zinc-900">Evidence context</h2>
        <div className="mt-2 space-y-2">
          {profile.recentEvidence.length === 0 ? (
            <p className="text-sm text-zinc-500">No recent evidence records.</p>
          ) : (
            profile.recentEvidence.map((e) => (
              <div key={e.id} className="text-sm text-zinc-700">
                {e.templateName} · {e.status}
                {e.outOfStandard ? " · Out of standard" : ""} · {e.occurredAt.toLocaleString()}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-identity">
        <h2 className="text-lg font-semibold text-zinc-900">Configuration</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Identity and location are BUILD facts. Prefer Asset Builder for routine configuration.
        </p>
        {authority.canManageAssets && presentation.lifecycle !== "RETIRED" ? (
          <form action={updateAssetIdentityAction} className="mt-3 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="assetId" value={identity.id} />
            <input type="hidden" name="departmentId" value={departmentId} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input name="name" defaultValue={identity.name} className="rounded-md border border-zinc-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Equipment type</span>
              <input
                name="equipmentType"
                defaultValue={identity.equipmentType}
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Manufacturer</span>
              <input
                name="manufacturer"
                defaultValue={identity.manufacturer ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Model</span>
              <input name="model" defaultValue={identity.model ?? ""} className="rounded-md border border-zinc-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Serial number</span>
              <input
                name="serialNumber"
                defaultValue={identity.serialNumber ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Facility asset number</span>
              <input
                name="facilityAssetNumber"
                defaultValue={identity.facilityAssetNumber ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
              <AssetUnitSpaceFields
                units={units}
                spaces={spaces.map((s) => ({ id: s.id, name: s.name, unitId: s.unitId }))}
                roomTerm={roomTerm}
                defaultUnitId={identity.unit.id}
                defaultSpaceId={identity.space?.id ?? null}
                unitTestId="edit-asset-unit"
                spaceTestId="edit-asset-space"
                className="contents"
              />
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Department user</span>
              <select
                name="departmentIdNext"
                defaultValue={identity.department?.id ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="">Unset</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">
                Department that uses this equipment day to day.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Responsible maintainer</span>
              <select
                name="responsibleOrganizationId"
                defaultValue={identity.responsibleOrganization?.id ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="">Not assigned</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">
                Facility or operating partner obligated to maintain or repair this asset.
              </span>
            </label>
            {authority.canAssignVendor || authority.canManageAssets ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Preferred repair vendor</span>
                <select
                  name="vendorId"
                  defaultValue={identity.vendor?.id ?? ""}
                  className="rounded-md border border-zinc-300 px-3 py-2"
                >
                  <option value="">No preferred vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-zinc-500">
                  Approved service vendor normally contacted for repair work.
                </span>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium">Criticality</span>
              <select
                name="criticality"
                defaultValue={identity.criticality}
                className="rounded-md border border-zinc-300 px-3 py-2"
              >
                {ASSET_CRITICALITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium">Description</span>
              <textarea
                name="description"
                defaultValue={identity.description ?? ""}
                rows={2}
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            {authority.canViewManagementNotes ? (
              <>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="font-medium">Notes</span>
                  <textarea
                    name="notes"
                    defaultValue={identity.notes ?? ""}
                    rows={2}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="font-medium">Procedure instructions</span>
                  <textarea
                    name="procedureInstructions"
                    defaultValue={identity.procedureInstructions ?? ""}
                    rows={2}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                  />
                </label>
              </>
            ) : null}
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                Save configuration
              </button>
            </div>
          </form>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm text-zinc-700 md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-zinc-500">Location</dt>
              <dd aria-label={locationAria}>{locationLabel}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Department</dt>
              <dd>{identity.department?.name ?? "Unset"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Criticality</dt>
              <dd>{assetCriticalityLabel(identity.criticality)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Manufacturer</dt>
              <dd>{identity.manufacturer ?? "—"}</dd>
            </div>
          </dl>
        )}
        {authority.canManageAssets && presentation.lifecycle !== "RETIRED" ? (
          <form action={retireAssetAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
            <input type="hidden" name="assetId" value={identity.id} />
            <input type="hidden" name="departmentId" value={departmentId} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Retire asset</span>
              <input
                name="reason"
                required
                placeholder="Retirement reason"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <button type="submit" className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-800 hover:bg-red-50">
              Retire
            </button>
          </form>
        ) : null}
      </section>
    </section>
  );
}
