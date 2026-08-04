import Link from "next/link";
import {
  KnowledgeArticleCategory,
  KnowledgeArticleStatus,
} from "@prisma/client";

import {
  KnowledgeArticleEditor,
} from "@/components/knowledge/knowledge-article-editor";
import { KnowledgeArticleLifecycleActions } from "@/components/knowledge/knowledge-article-lifecycle-actions";
import { KnowledgeArticlePreview } from "@/components/knowledge/knowledge-article-preview";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import {
  AppCard,
  EmptyState,
  OperationalListRow,
  StatusBadge,
  operationalListShellClass,
} from "@/components/design-system";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import {
  knowledgeCategoryLabel,
  knowledgeStatusBadgeVariant,
  knowledgeStatusLabel,
} from "@/lib/knowledge/labels";
import { buildKnowledgeAdminListWhere } from "@/lib/knowledge/search";
import { prisma } from "@/lib/prisma";

type AdminKnowledgePageProps = {
  searchParams?: Promise<{
    saved?: string;
    edit?: string;
    preview?: string;
    status?: string;
    department?: string;
    category?: string;
    q?: string;
    includeArchived?: string;
  }>;
};

function parseStatusFilter(raw: string | undefined): KnowledgeArticleStatus | "ALL" {
  if (!raw || raw === "ALL") return "ALL";
  if (Object.values(KnowledgeArticleStatus).includes(raw as KnowledgeArticleStatus)) {
    return raw as KnowledgeArticleStatus;
  }
  return "ALL";
}

function parseCategoryFilter(raw: string | undefined): KnowledgeArticleCategory | "ALL" {
  if (!raw || raw === "ALL") return "ALL";
  if (Object.values(KnowledgeArticleCategory).includes(raw as KnowledgeArticleCategory)) {
    return raw as KnowledgeArticleCategory;
  }
  return "ALL";
}

export default async function AdminKnowledgePage({ searchParams }: AdminKnowledgePageProps) {
  const session = await assertFacilityAdministratorPage();
  const query = searchParams ? await searchParams : undefined;

  const statusFilter = parseStatusFilter(query?.status);
  const categoryFilter = parseCategoryFilter(query?.category);
  const departmentFilter = query?.department ?? "ALL";
  const includeArchived = query?.includeArchived === "1";

  const where = buildKnowledgeAdminListWhere({
    facilityId: session.facilityId,
    status: statusFilter,
    departmentId:
      departmentFilter === "FACILITY_WIDE"
        ? "FACILITY_WIDE"
        : departmentFilter === "ALL"
          ? "ALL"
          : departmentFilter,
    category: categoryFilter,
    query: query?.q,
    includeArchived,
  });

  const [articles, departments, units, assets, logTemplates, inspectionDefinitions] =
    await Promise.all([
      prisma.knowledgeArticle.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        include: {
          department: { select: { name: true } },
          unitLinks: { include: { unit: { select: { name: true } } } },
          assetLinks: { include: { asset: { select: { name: true, assetCode: true } } } },
          logTemplateLinks: { include: { logTemplate: { select: { name: true } } } },
          inspectionDefinitionLinks: {
            include: { inspectionDefinition: { select: { name: true } } },
          },
        },
      }),
      prisma.department.findMany({
        where: { facilityId: session.facilityId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.unit.findMany({
        where: { facilityId: session.facilityId, isActive: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.asset.findMany({
        where: { unit: { facilityId: session.facilityId } },
        orderBy: { assetCode: "asc" },
        select: { id: true, assetCode: true, name: true },
        take: 200,
      }),
      prisma.logTemplate.findMany({
        where: { facilityId: session.facilityId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.inspectionDefinition.findMany({
        where: { facilityId: session.facilityId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  const editing = query?.edit
    ? await prisma.knowledgeArticle.findFirst({
        where: { id: query.edit, facilityId: session.facilityId },
        include: {
          unitLinks: true,
          assetLinks: true,
          logTemplateLinks: true,
          inspectionDefinitionLinks: true,
        },
      })
    : null;

  const previewArticle = query?.preview
    ? await prisma.knowledgeArticle.findFirst({
        where: { id: query.preview, facilityId: session.facilityId },
        include: {
          department: { select: { name: true } },
          unitLinks: { include: { unit: { select: { name: true } } } },
          assetLinks: { include: { asset: { select: { name: true, assetCode: true } } } },
          logTemplateLinks: { include: { logTemplate: { select: { name: true } } } },
          inspectionDefinitionLinks: {
            include: { inspectionDefinition: { select: { name: true } } },
          },
        },
      })
    : null;

  const selectOptions = {
    departments: departments.map((row) => ({ id: row.id, label: row.name })),
    units: units.map((row) => ({ id: row.id, label: row.name })),
    assets: assets.map((row) => ({ id: row.id, label: `${row.assetCode} · ${row.name}` })),
    logTemplates: logTemplates.map((row) => ({ id: row.id, label: row.name })),
    inspectionDefinitions: inspectionDefinitions.map((row) => ({ id: row.id, label: row.name })),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="admin-knowledge">
      <AdminPageHeader
        title="Procedures & Resources"
        trail={[{ label: "Procedures & Resources" }]}
        subtitle="Manage SOPs, policies, instructions, job aids, and reference materials. Link articles to departments, locations, assets, logs, and inspections so they surface at the point of work. These resources do not assign departments to rooms."
      />

      {query?.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Knowledge article saved.
        </p>
      ) : null}

      <AppCard title="Filter articles" subtitle="Basic search — title, summary, and body">
        <form method="get" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm text-zinc-700 md:col-span-2 lg:col-span-3">
            Search
            <input
              name="q"
              defaultValue={query?.q ?? ""}
              placeholder="Search title or body"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm text-zinc-700">
            Status
            <select
              name="status"
              defaultValue={statusFilter}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">All (except archived)</option>
              {Object.values(KnowledgeArticleStatus).map((value) => (
                <option key={value} value={value}>
                  {knowledgeStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            Department
            <select
              name="department"
              defaultValue={departmentFilter}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">All departments</option>
              <option value="FACILITY_WIDE">Facility-wide only</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            Category
            <select
              name="category"
              defaultValue={categoryFilter}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">All categories</option>
              {Object.values(KnowledgeArticleCategory).map((value) => (
                <option key={value} value={value}>
                  {knowledgeCategoryLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
            <input
              type="checkbox"
              name="includeArchived"
              value="1"
              defaultChecked={includeArchived}
            />
            Include archived
          </label>
          <div className="flex items-end md:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Apply filters
            </button>
          </div>
        </form>
      </AppCard>

      <AppCard title="Articles" subtitle={`${articles.length} matching`}>
        {articles.length === 0 ? (
          <EmptyState
            icon="logs"
            title="No knowledge articles yet"
            description="Create a draft SOP or reference article and link it to operational objects."
          />
        ) : (
          <ul className={operationalListShellClass}>
            {articles.map((article) => (
              <OperationalListRow
                key={article.id}
                title={article.title}
                description={article.summary ?? undefined}
                meta={
                  <span className="text-xs text-zinc-500">
                    {knowledgeCategoryLabel(article.category)}
                    {article.department ? ` · ${article.department.name}` : " · Facility-wide"}
                  </span>
                }
                status={
                  <StatusBadge variant={knowledgeStatusBadgeVariant(article.status)}>
                    {knowledgeStatusLabel(article.status)}
                  </StatusBadge>
                }
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/knowledge?preview=${article.id}`}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900"
                    >
                      Preview
                    </Link>
                    <Link
                      href={`/admin/knowledge?edit=${article.id}`}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900"
                    >
                      Edit
                    </Link>
                    <KnowledgeArticleLifecycleActions
                      articleId={article.id}
                      status={article.status}
                    />
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </AppCard>

      {previewArticle ? (
        <KnowledgeArticlePreview
          title={previewArticle.title}
          summary={previewArticle.summary}
          body={previewArticle.body}
          status={previewArticle.status}
          category={previewArticle.category}
          sourceType={previewArticle.sourceType}
          departmentName={previewArticle.department?.name ?? null}
          linkSummary={[
            ...previewArticle.unitLinks.map((link) => `Location · ${link.unit.name}`),
            ...previewArticle.assetLinks.map(
              (link) => `Asset · ${link.asset.assetCode} ${link.asset.name}`,
            ),
            ...previewArticle.logTemplateLinks.map(
              (link) => `Log template · ${link.logTemplate.name}`,
            ),
            ...previewArticle.inspectionDefinitionLinks.map(
              (link) => `Inspection · ${link.inspectionDefinition.name}`,
            ),
          ]}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">
          {editing ? `Edit · ${editing.title}` : "Create article"}
        </h2>
        {editing ? (
          <p className="text-sm text-zinc-600">
            <Link href="/admin/knowledge" className="font-medium text-zinc-800 underline">
              Cancel edit / create new
            </Link>
          </p>
        ) : null}
        <KnowledgeArticleEditor
          key={editing?.id ?? "create"}
          mode={editing ? "edit" : "create"}
          articleId={editing?.id}
          initialTitle={editing?.title}
          initialSummary={editing?.summary ?? ""}
          initialBody={editing?.body}
          initialCategory={editing?.category}
          initialSourceType={editing?.sourceType}
          initialDepartmentId={editing?.departmentId ?? ""}
          initialStatus={editing?.status}
          initialUnitIds={editing?.unitLinks.map((link) => link.unitId)}
          initialAssetIds={editing?.assetLinks.map((link) => link.assetId)}
          initialLogTemplateIds={editing?.logTemplateLinks.map((link) => link.logTemplateId)}
          initialInspectionDefinitionIds={editing?.inspectionDefinitionLinks.map(
            (link) => link.inspectionDefinitionId,
          )}
          departments={selectOptions.departments}
          units={selectOptions.units}
          assets={selectOptions.assets}
          logTemplates={selectOptions.logTemplates}
          inspectionDefinitions={selectOptions.inspectionDefinitions}
        />
      </section>
    </div>
  );
}
