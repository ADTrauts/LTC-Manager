import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import {
  retireAssetAction,
  updateAssetIdentityAction,
  updateAssetStatusAction,
} from "@/app/(protected)/assets/actions";
import { AssetIssueReportPanel } from "@/components/asset-operations/asset-issue-report-panel";
import { ASSET_CRITICALITY_OPTIONS, assetCriticalityLabel } from "@/lib/asset-criticality";
import {
  assetIssueStatusLabel,
  assetStatusLabel,
  getAssetProfile,
  operationalImpactLabel,
  resolveAssetOperationsAuthority,
  workOrderStatusLabel,
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { cookies } from "next/headers";

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

  const [units, vendors, departments] = await Promise.all([
    prisma.unit.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    authority.canViewVendorDetails
      ? prisma.vendor.findMany({
          where: { facilityId: session.facilityId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    prisma.department.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const cookieStore = await cookies();
  const deviceFacilityId = cookieStore.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null;
  const deviceBoundUnitId = cookieStore.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null;

  const identity = profile.identity;

  return (
    <section className="space-y-6" data-testid="asset-profile-page">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          <Link href="/assets" className="underline underline-offset-2">
            Assets
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {identity.assetCode} · {identity.name}
        </h1>
        <p className="text-sm text-zinc-600">
          {identity.equipmentType} · {identity.unit.name} · {assetStatusLabel(profile.status.raw)}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-identity">
        <h2 className="text-lg font-semibold text-zinc-900">Identity</h2>
        {authority.canManageAssets ? (
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Unit</span>
              <select name="unitId" defaultValue={identity.unit.id} className="rounded-md border border-zinc-300 px-3 py-2">
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Department</span>
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
            </label>
            {authority.canAssignVendor ? (
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium">Preferred vendor</span>
                <select
                  name="vendorId"
                  defaultValue={identity.vendor?.id ?? ""}
                  className="rounded-md border border-zinc-300 px-3 py-2"
                >
                  <option value="">No vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
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
            <div className="md:col-span-2">
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                Save identity
              </button>
            </div>
          </form>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm text-zinc-700 md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-zinc-500">Criticality</dt>
              <dd>{assetCriticalityLabel(identity.criticality)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Department</dt>
              <dd>{identity.department?.name ?? "Unset"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Manufacturer</dt>
              <dd>{identity.manufacturer ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Model / Serial</dt>
              <dd>
                {identity.model ?? "—"} / {identity.serialNumber ?? "—"}
              </dd>
            </div>
            {authority.canViewVendorDetails ? (
              <div className="md:col-span-2">
                <dt className="text-xs uppercase text-zinc-500">Vendor</dt>
                <dd>{identity.vendor?.name ?? "None"}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-condition">
        <h2 className="text-lg font-semibold text-zinc-900">Current condition</h2>
        <p className="mt-1 text-sm text-zinc-700">
          Status: <strong>{assetStatusLabel(profile.status.raw)}</strong>
          {profile.status.retiredAt
            ? ` · Retired ${profile.status.retiredAt.toLocaleDateString()} — ${profile.status.retiredReason ?? ""}`
            : null}
        </p>
        {profile.prospectiveTemplateBindingNote ? (
          <p className="mt-2 text-sm text-amber-800">{profile.prospectiveTemplateBindingNote}</p>
        ) : null}
        {authority.canChangeAssetStatus ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <form action={updateAssetStatusAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="assetId" value={identity.id} />
              <input type="hidden" name="departmentId" value={departmentId} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Change status</span>
                <select
                  name="status"
                  defaultValue={profile.status.operational}
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  data-testid="asset-status-select"
                >
                  <option value="OPERATIONAL">OPERATIONAL</option>
                  <option value="DEGRADED">DEGRADED</option>
                  <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                  <option value="RETIRED">RETIRED</option>
                </select>
              </label>
              <input
                name="note"
                placeholder="Note"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100">
                Update status
              </button>
            </form>
            {profile.status.operational !== "RETIRED" ? (
              <form action={retireAssetAction} className="flex items-end gap-2">
                <input type="hidden" name="assetId" value={identity.id} />
                <input type="hidden" name="departmentId" value={departmentId} />
                <input
                  name="reason"
                  placeholder="Retirement reason"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-800 hover:bg-red-50">
                  Retire
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-evidence">
        <h2 className="text-lg font-semibold text-zinc-900">Evidence</h2>
        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium uppercase text-zinc-500">Related templates</p>
          {profile.templates.length === 0 ? (
            <p className="text-sm text-zinc-500">No linked templates.</p>
          ) : (
            profile.templates.map((t) => (
              <div key={t.id} className="text-sm text-zinc-700">
                {t.name} · v{t.version} · {t.status} · {t.purposeType}
              </div>
            ))
          )}
          <p className="mt-3 text-xs font-medium uppercase text-zinc-500">Recent evidence</p>
          {profile.recentEvidence.length === 0 ? (
            <p className="text-sm text-zinc-500">No recent evidence records.</p>
          ) : (
            profile.recentEvidence.map((e) => (
              <div key={e.id} className="text-sm text-zinc-700">
                {e.templateName} · {e.status}
                {e.outOfStandard ? " · Out of standard" : ""} ·{" "}
                {e.occurredAt.toLocaleString()}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-issues">
        <h2 className="text-lg font-semibold text-zinc-900">Issues</h2>
        <div className="mt-2 space-y-2">
          {profile.openIssues.length === 0 ? (
            <p className="text-sm text-zinc-500">No open Issues.</p>
          ) : (
            profile.openIssues.map((issue) => (
              <Link
                key={issue.id}
                href={`/asset-issues/${issue.id}`}
                className="block rounded border border-zinc-200 p-2 text-sm hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-900">
                  {issue.issueCode} · {issue.summary}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">
                  {assetIssueStatusLabel(issue.status)} · {operationalImpactLabel(issue.operationalImpact)}
                </span>
              </Link>
            ))
          )}
        </div>
        {authority.canReportIssue ? (
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
                  statusLabel: assetStatusLabel(profile.status.raw),
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
        <h2 className="text-lg font-semibold text-zinc-900">Work Orders</h2>
        <div className="mt-2 space-y-2">
          {profile.activeWorkOrders.length === 0 ? (
            <p className="text-sm text-zinc-500">No active Work Orders.</p>
          ) : (
            profile.activeWorkOrders.map((wo) => (
              <Link
                key={wo.id}
                href={`/issues/${wo.id}`}
                className="block rounded border border-zinc-200 p-2 text-sm hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-900">
                  {wo.repairCode} · {wo.title}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">
                  {workOrderStatusLabel(wo.status)}
                  {wo.returnToServiceReady ? " · Return-to-service ready" : ""}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-history">
        <h2 className="text-lg font-semibold text-zinc-900">History</h2>
        <ol className="mt-3 space-y-2">
          {profile.history.length === 0 ? (
            <li className="text-sm text-zinc-500">No history yet.</li>
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
    </section>
  );
}
