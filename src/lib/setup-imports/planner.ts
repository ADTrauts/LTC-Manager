import { buildFacilityStructurePlanFromCsv } from "@/lib/bulk-import/facility-structure-execute";
import { FACILITY_STRUCTURE_CSV_HEADERS } from "@/lib/bulk-import/facility-structure";
import { rowsToCsv } from "@/lib/bulk-import/csv";
import { RoleKey, EmploymentType } from "@prisma/client";
import { getDepartmentProduct } from "@/lib/department-products/registry";
import { findCurrentInternalRolePeriod } from "@/lib/facility-access/periods";
import { planAssetImport, ASSET_CSV_HEADERS, type ParsedAssetImportRow } from "@/lib/bulk-import/asset-import";
import { hash, type ImportSource, type SourceRow, type PlanRow, type Operation } from "./contract";
import type { Catalog } from "./catalog";

const norm = (s: string) => s.trim().toLowerCase();
function facts(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(facts).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !["updatedAt","createdAt","pinDigest","passwordHash"].includes(k)).map(([k,v]) => [k,facts(v)]));
  return value;
}
export function planImport(source: ImportSource, catalog: Catalog, scopeDepartmentId: string | null, now: Date): PlanRow[] {
  const department = (ref: string) => {
    const product = getDepartmentProduct(ref.toUpperCase());
    const keyed = catalog.departments.filter(d => d.id === ref || d.key === (product?.installationKey ?? ref.toUpperCase()));
    const found = keyed.length ? keyed : catalog.departments.filter(d => norm(d.name) === norm(ref));
    if (!ref || found.length !== 1) throw Error("Department must resolve exactly one active, customer-authorized installation in this Facility. Check licensing and the reference.");
    if (scopeDepartmentId && found[0]!.id !== scopeDepartmentId) throw Error("Department is outside the confirmed import scope.");
    return found[0]!;
  };
  const person = (r: SourceRow) => {
    const v = r.values;
    const users = v.email ? catalog.users.filter(u => norm(u.email) === norm(v.email!)) : [];
    if (users.length > 1) throw Error("Ambiguous account email. Use the existing identity review tools.");
    const u = users[0];
    const matches = catalog.employees.filter(e => v.employeeId ? e.id === v.employeeId : (v.email && norm(e.email ?? "") === norm(v.email)) || (u && e.userId === u.id));
    if (matches.length > 1) throw Error("Ambiguous Employee match. Use a verified Facility Employee ID.");
    const e = matches[0];
    if (v.employeeId && !e) throw Error("Employee ID does not identify an Employee in this Facility.");
    if (e && v.email && norm(e.email ?? "") !== norm(v.email) && e.userId !== u?.id) throw Error("Employee ID and email disagree.");
    if (e) {
      if (!["ACTIVE","OFF"].includes(e.status) || e.terminationDate) throw Error("Employment history requires the canonical lifecycle/rehire review.");
      if (!e.user || !e.userId || !e.user.isActive) throw Error("Employee needs canonical account linking/lifecycle review.");
      const g = e.user.facilityAccesses.find(a => a.facilityId === catalog.facility.id);
      const currentRole = g ? findCurrentInternalRolePeriod(g.rolePeriods,now) : null;
      if (!g?.isActive || g.revokedAt || !currentRole || !catalog.roles.some(r => r.key === currentRole.roleKey)) throw Error("Existing or historical access requires lifecycle review; import cannot restore it.");
    }
    if (u && !u.isActive) throw Error("Existing account is inactive. Use lifecycle review.");
    if (u && !e) {
      if (u.facilityAccesses.some(a => a.facilityId === catalog.facility.id)) throw Error("Existing or historical Facility access must be reviewed in People.");
      if (u.facility?.organizationId !== catalog.facility.organizationId && !u.facilityAccesses.some(a => a.isActive && !a.revokedAt && a.facility.organizationId === catalog.facility.organizationId)) throw Error("Existing account is outside this Organization. Use canonical account-linking review.");
    }
    return { employee: e, user: u, accountId: e?.userId ?? u?.id ?? null };
  };
  const options = (v: Record<string,string>, deptId: string) => {
    if (v.teamId && !catalog.teams.some(t => t.id === v.teamId && t.departmentId === deptId && t.status === "ACTIVE")) throw Error("Team ID must identify an active Team in the selected Department.");
    if (v.jobRoleId && !catalog.jobRoles.some(j => j.id === v.jobRoleId && j.departmentId === deptId && j.status === "ACTIVE")) throw Error("Job Role ID must identify an active Job Role in the selected Department.");
    if (v.jobTitleId && !catalog.jobTitles.some(j => j.id === v.jobTitleId && j.isActive)) throw Error("Job Title ID must identify an active Facility Job Title.");
  };
  const rows = source.rows.map((r): PlanRow => {
    const base = { row: r.row, ref: r.ref, label: r.values.email || r.values.employeeId || r.values.locationId || r.values.name || r.ref, requiresAccountConfirmation: null as string | null };
    const done = (operation: Operation, action: PlanRow["action"], message: string, before: unknown, accountId: string | null = null): PlanRow => ({ ...base, action, operation, message, beforeHash: hash(facts(before)), requiresAccountConfirmation: accountId });
    try {
      if (r.errors.length) throw Error(r.errors.join(" "));
      const v = r.values;
      if (source.dataset === "locations") {
        if (!catalog.structure) throw Error("Facility structure dependencies are unavailable.");
        const built = buildFacilityStructurePlanFromCsv(rowsToCsv([...FACILITY_STRUCTURE_CSV_HEADERS],[FACILITY_STRUCTURE_CSV_HEADERS.map(k => k === "department" && v.department ? department(v.department).key : v[k] || "")]),catalog.structure,source.fileName);
        if (!built.ok) throw Error(built.error);
        const plan = built.plan, item = plan.rows[0];
        if (!plan.canConfirm || !item || plan.counts.invalidRows) throw Error(plan.rows.flatMap(x => x.errors.map(e => `${e.field}: ${e.reason}`)).join(" ") || "Location is invalid or ambiguous.");
        const create = plan.buildingsToCreate + plan.floorsToCreate + plan.neighborhoodsToCreate + plan.spacesToCreate > 0;
        return done({ kind: "locations", targetKey: `place:${item.spaceKey || item.neighborhoodKey || item.floorKey}`, locationPlan: plan },create ? "create" : "reuse","Create/reuse canonical Facility hierarchy; no Department installation or publication.",catalog.structure);
      }
      if (source.dataset === "workforce") {
        const { employee: e, user: u, accountId } = person(r);
        if (e) {
          for (const key of ["firstName","lastName","roleType","employmentType","phone"] as const) if (v[key] && String(e[key] ?? "") !== v[key]) throw Error(`${key} differs. Use ONB-01 Update employees or the dedicated authority/lifecycle action; create/reuse never patches existing people.`);
          if (v.primaryDepartment && department(v.primaryDepartment).id !== e.primaryDepartmentId) throw Error("Primary Department differs. Review membership in People.");
          if ((v.teamId && !e.teamMemberships.some(t => t.teamId === v.teamId)) || (v.jobRoleId && !e.departmentJobRoles.some(j => j.jobRoleId === v.jobRoleId)) || (v.jobTitleId && e.jobTitleId !== v.jobTitleId)) throw Error("Use employee-department CSV or People to add relationships to an existing Employee.");
          return done({ kind: "workforce", targetKey: `employee:${e.id}`, employeeId: e.id, userId: e.userId! },"reuse","Reuse the existing linked Employee. No fields, credentials, roles or relationships will be replaced.",e,accountId);
        }
        if (!v.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || v.email.length > 120) throw Error("A real email is required. No fake emails or PIN-only unlinked people.");
        if (!v.firstName || v.firstName.length < 2 || v.firstName.length > 60 || !v.lastName || v.lastName.length < 2 || v.lastName.length > 60) throw Error("New employees require first and last names (2–60 characters).");
        if (!Object.values(RoleKey).includes(v.roleType as RoleKey) || !catalog.roles.some(x => x.key === v.roleType)) throw Error("Supply an active canonical roleType; no default authority is inferred.");
        if (!Object.values(EmploymentType).includes(v.employmentType as EmploymentType)) throw Error("New employees require an explicit employmentType.");
        if (v.phone && v.phone.length > 30) throw Error("Phone exceeds 30 characters.");
        const d = department(v.primaryDepartment || ""); options(v,d.id);
        return done({ kind: "workforce", targetKey: `email:${norm(v.email)}`, email: norm(v.email), userId: u?.id, firstName: v.firstName, lastName: v.lastName, roleType: v.roleType, employmentType: v.employmentType, phone: v.phone, departmentId: d.id, teamId: v.teamId, jobRoleId: v.jobRoleId, jobTitleId: v.jobTitleId },"create","Create one linked Employee and canonical Facility access. Account activation / eligible PIN enrollment may remain pending; no credential is generated.",{ user: u, department: d, team: catalog.teams.find(t => t.id === v.teamId), jobRole: catalog.jobRoles.find(j => j.id === v.jobRoleId), title: catalog.jobTitles.find(j => j.id === v.jobTitleId), role: v.roleType },accountId);
      }
      if (source.dataset === "employee_departments") {
        const { employee: e } = person(r); if (!e) throw Error("Relationship import requires an existing linked Employee in this Facility. Import workforce first.");
        const d = department(v.department || ""); options(v,d.id);
        if (!["PRIMARY","ADDITIONAL"].includes(v.membership || "")) throw Error("Choose PRIMARY or ADDITIONAL membership explicitly.");
        if (v.membership === "PRIMARY" && e.primaryDepartmentId && e.primaryDepartmentId !== d.id) throw Error("Import cannot replace a primary Department. Review in People.");
        const member = e.primaryDepartmentId === d.id || e.employeeDepartments.some(x => x.departmentId === d.id);
        if (v.teamPrimary && !["true","false"].includes(v.teamPrimary)) throw Error("teamPrimary must be true or false.");
        if (v.teamPrimary === "true" && !v.teamId) throw Error("teamPrimary requires a Team ID.");
        const currentTeam = e.teamMemberships.find(t => t.teamId === v.teamId);
        const primaryTeam = e.teamMemberships.find(t => t.isPrimary && catalog.teams.some(x => x.id === t.teamId && x.departmentId === d.id));
        if (v.teamPrimary === "true" && primaryTeam && primaryTeam.teamId !== v.teamId) throw Error("A different Primary Team exists; review it in People.");
        if (currentTeam && v.teamPrimary && currentTeam.isPrimary !== (v.teamPrimary === "true")) throw Error("Import cannot replace existing Team priority.");
        const currentJob = e.departmentJobRoles.find(j => j.departmentId === d.id);
        if (v.jobRoleId && currentJob && currentJob.jobRoleId !== v.jobRoleId) throw Error("A different Department Job Role exists; review in People.");
        // Validate preserved dependencies too: canonical sync must not silently remove them.
        const preservedDepartments = [e.primaryDepartmentId,...e.employeeDepartments.map(x => x.departmentId)].filter(Boolean);
        if (preservedDepartments.some(id => !catalog.departments.some(x => x.id === id))) throw Error("An existing membership needs licensing/Department review before organizational synchronization.");
        if (e.jobTitleId && !catalog.jobTitles.some(j => j.id === e.jobTitleId && j.isActive)) throw Error("An existing Job Title needs review in People before organizational synchronization.");
        if (e.teamMemberships.some(t => !catalog.teams.some(x => x.id === t.teamId && x.status === "ACTIVE" && preservedDepartments.includes(x.departmentId)))) throw Error("An existing archived/missing Team requires review in People.");
        const unchanged = member && (v.membership !== "PRIMARY" || e.primaryDepartmentId === d.id) && (!v.teamId || Boolean(currentTeam)) && (!v.jobRoleId || Boolean(currentJob));
        return done({ kind: "employee_departments", targetKey: `${e.id}:${d.id}`, employeeId: e.id, departmentId: d.id, membership: v.membership, teamId: v.teamId, teamPrimary: v.teamPrimary === "true", jobRoleId: v.jobRoleId },unchanged ? "reuse" : "add","Add/reuse this relationship only. Other memberships, Teams, Job Roles and HR fields are preserved.",{ employee: { id: e.id, userId: e.userId, status: e.status, terminationDate: e.terminationDate, sessionVersion: e.sessionVersion, user: e.user, ...(v.membership === "PRIMARY" ? { primaryDepartmentId: e.primaryDepartmentId } : {}) }, department: d, member, team: currentTeam, jobRole: currentJob, wantedTeam: catalog.teams.find(t => t.id === v.teamId), wantedJobRole: catalog.jobRoles.find(j => j.id === v.jobRoleId) });
      }
      if (source.dataset === "department_locations") {
        const d = department(v.department || "");
        if (!["UNIT","ROOM"].includes(v.locationType || "")) throw Error("locationType must be UNIT or ROOM; use the exported canonical location ID.");
        const loc = v.locationType === "UNIT" ? catalog.units.find(x => x.id === v.locationId) : catalog.spaces.find(x => x.id === v.locationId);
        if (!loc?.isActive) throw Error("Location ID must identify an active physical place in this Facility.");
        if (v.locationType === "UNIT" && "hierarchyRole" in loc && ["BUILDING","FLOOR"].includes(loc.hierarchyRole ?? "")) throw Error("Assign responsibility to a neighborhood/location or Room, not a building/floor container.");
        if (v.locationType === "UNIT" && !["PRIMARY","BACKUP","SUPPORT"].includes(v.kind || "")) throw Error("UNIT requires PRIMARY, BACKUP or SUPPORT kind.");
        if (v.locationType === "ROOM" && v.kind) throw Error("ROOM responsibility has no kind; leave kind blank.");
        const old = v.locationType === "UNIT" ? catalog.unitResponsibilities.find(x => x.unitId === loc.id && x.departmentId === d.id) : catalog.spaceResponsibilities.find(x => x.spaceId === loc.id && x.departmentId === d.id);
        if (old && "kind" in old && old.kind !== v.kind) throw Error("Existing responsibility kind differs. Review in Facility Builder; import will not replace it.");
        return done({ kind: "department_locations", targetKey: `${v.locationType}:${loc.id}:${d.id}`, locationType: v.locationType, locationId: loc.id, departmentId: d.id, responsibilityKind: v.kind },old ? "reuse" : "add","Use the existing physical location; preserve all other Department responsibilities and settings.",{ location: loc, department: d, responsibility: old });
      }
      if (!catalog.assets) throw Error("Asset dependencies are unavailable.");
      const assetInput = Object.fromEntries(ASSET_CSV_HEADERS.map(k => [k,v[k] || ""])) as Omit<ParsedAssetImportRow,"rowNumber"|"cells">;
      const planned = planAssetImport([{ ...assetInput, rowNumber: r.row, cells: ASSET_CSV_HEADERS.map(k => v[k] || "") }],catalog.assets,source.fileName).rows[0]!;
      if (planned.errors.length || planned.action === "none") throw Error(planned.errors.map(x => x.reason).join(" ") || planned.messages.join(" "));
      if (!planned.assetCode && !planned.serialNumber && !planned.facilityAssetNumber) throw Error("Supply assetCode, serialNumber or facilityAssetNumber as a stable canonical reference.");
      const d = department(planned.departmentId || v.department || "");
      if (!catalog.assetAuthority[d.id]) throw Error("Current Department context/role cannot manage this Asset. Use the canonical Asset Builder context; Facility Administrator or Console status alone is insufficient.");
      return done({ kind: "assets", targetKey: planned.existingAssetId || `asset:${planned.assetCode || planned.serialNumber || planned.facilityAssetNumber}`, departmentId: d.id, unitId: planned.unitId!, spaceId: planned.spaceId ?? undefined, asset: { name: planned.name, equipmentType: planned.equipmentType, assetCode: planned.assetCode, serialNumber: planned.serialNumber, facilityAssetNumber: planned.facilityAssetNumber, manufacturer: planned.manufacturer, model: planned.model, description: planned.description, notes: planned.notes, criticality: planned.criticality, status: planned.statusValue! } },planned.action === "skip" ? "reuse" : "create","Register/reuse Asset identity only; no Issues, Work, evidence or publication.",{ department: d, unit: catalog.assets.units.find(x => x.id === planned.unitId), space: catalog.assets.spaces.find(x => x.id === planned.spaceId), existing: catalog.assets.assets.find(x => x.id === planned.existingAssetId), responsibilities: !v.department ? catalog.assets.responsibilities?.filter(x => x.unitId === planned.unitId) : undefined });
    } catch (e) { return { ...base, action: "blocked", message: (e as Error).message, beforeHash: "", operation: null }; }
  });
  const keys = new Map<string,number>(); rows.forEach(r => { if (r.operation) keys.set(r.operation.targetKey,(keys.get(r.operation.targetKey)||0)+1); });
  return rows.map(r => r.operation && keys.get(r.operation.targetKey)! > 1 ? { ...r, action: "blocked", message: "Duplicate target relationship/person/asset in this file.", operation: null, beforeHash: "" } : r);
}
