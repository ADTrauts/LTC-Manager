/**
 * Generic Department Work is retired.
 * Records, Operating Rhythm, Coverage, Assignment, and Plant maintenance own the facts.
 * These exports remain so older call sites compile while they are removed.
 * They do not read or write a Work store.
 */

import type {
  WorkAuthorityDecision,
  WorkItemDraftInput,
  WorkPlanDraftInput,
  WorkPlanListItem,
  WorkRequirement,
} from "./types";

export type {
  AcceptedEvidenceForWorkResolve,
  ConfirmedAssignmentForWorkResolve,
  ExistingWorkOccurrenceForResolve,
  OneOffWorkInput,
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
  WorkItemDraftInput,
  WorkPlanApplicabilityDraftInput,
  WorkPlanDraftInput,
  WorkPlanListItem,
  WorkRequirement,
  WorkRequirementState,
  WorkAuthorityDecision,
  SpaceWorkSummaryState,
} from "./types";

const RETIRED = "Generic Work is retired.";

const DENIED: WorkAuthorityDecision = {
  canViewRuntime: false,
  canComplete: false,
  canViewDepartment: false,
  canCreateOneOff: false,
  canReassign: false,
  canMarkNotRequired: false,
  canReopen: false,
  canManage: false,
  canPublish: false,
  reason: RETIRED,
};

export function decideWorkAuthority(..._args: unknown[]): WorkAuthorityDecision {
  return DENIED;
}

export function resolveWorkAuthority(..._args: unknown[]): WorkAuthorityDecision {
  return DENIED;
}

export function requireWorkComplete(..._args: unknown[]): never {
  throw new Error(RETIRED);
}

export function requireWorkManage(..._args: unknown[]): never {
  throw new Error(RETIRED);
}

export function requireWorkPublish(..._args: unknown[]): never {
  throw new Error(RETIRED);
}

export function requireWorkSupervisorAction(..._args: unknown[]): never {
  throw new Error(RETIRED);
}

export function buildOccurrenceKey(): string {
  return "";
}

export type OccurrenceKeyParts = Record<string, string>;

export const DEPARTMENT_WORK_PRESET_KEYS = [] as const;
export const DIETARY_WORK_PRESET_KEYS = [] as const;
export const EVS_WORK_PRESET_KEYS = [] as const;
export const PLANT_WORK_PRESET_KEYS = [] as const;
export const WORK_PRESET_PRODUCT_KEYS = [] as const;

export type DepartmentWorkPresetKey = never;
export type DietaryWorkPresetKey = never;
export type EvsWorkPresetKey = never;
export type PlantWorkPresetKey = never;

export function isDepartmentWorkPresetKey(_value: string): _value is DepartmentWorkPresetKey {
  return false;
}

export function workPresetOwningProductKey(_key: string): null {
  return null;
}

export function buildWorkPlanPresetDraft(..._args: unknown[]): WorkPlanDraftInput {
  return { name: "Retired", items: [] };
}

export function listWorkPlanPresetSummaries(..._args: unknown[]): [] {
  return [];
}

const RETIRED_ROW = {
  id: "retired",
  name: "Retired",
  occurrenceKey: "retired",
  occurrence: { id: "retired" },
  deduplicated: false,
};

export async function createDraft(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function createDraftFromPreset(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function createSuccessorDraft(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function duplicateWorkPlan(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function loadBuilderWorkPlans(..._args: unknown[]) {
  return { plans: [] as WorkPlanListItem[], canManage: false, canPublish: false };
}

export async function loadWorkPlanDetail(..._args: unknown[]) {
  return { id: "retired", name: "Retired", items: [] as WorkItemDraftInput[], status: "RETIRED" };
}

export async function loadPublishedWorkPlansForDate(..._args: unknown[]): Promise<WorkPlanListItem[]> {
  return [];
}

export async function previewWorkPlanRequirements(..._args: unknown[]): Promise<WorkRequirement[]> {
  return [];
}

export async function publishWorkPlan(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function retireWorkPlan(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function updateDraft(..._args: unknown[]) {
  return RETIRED_ROW;
}

export type WorkActor = { userId: string };

export function isWorkPlanEffectiveOnDate(): boolean {
  return false;
}

export function resolveWorkRequirements(..._args: unknown[]): WorkRequirement[] {
  return [];
}

export type AssetScopeForWorkResolve = { assetId: string };
export type SpaceScopeForWorkResolve = { spaceId: string };
export type ResolveWorkRequirementsInput = Record<string, unknown>;

export function deriveSpaceWorkSummary(): { state: "NONE" } {
  return { state: "NONE" };
}

export async function cancelOneOff(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function completeExplicit(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function createOneOff(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function markNotRequired(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function reassignOccurrence(..._args: unknown[]) {
  return RETIRED_ROW;
}

export async function reopenOccurrence(..._args: unknown[]) {
  return RETIRED_ROW;
}

export type WorkOccurrenceActor = { userId: string | null; employeeId: string | null; label: string };

export async function loadExistingWorkOccurrencesForDate(): Promise<[]> {
  return [];
}

export async function loadPublishedWorkPlansForResolve(): Promise<[]> {
  return [];
}

export async function loadSupervisorWorkExceptions(..._args: unknown[]): Promise<WorkRequirement[]> {
  return [];
}

export async function loadWorkScopeForUnit(): Promise<{ spaces: []; assets: [] }> {
  return { spaces: [], assets: [] };
}

export async function resolveUnitWorkRequirements(..._args: unknown[]): Promise<WorkRequirement[]> {
  return [];
}

export type ResolveUnitWorkRequirementsInput = Record<string, unknown>;
export type SupervisorWorkExceptionItem = { id: string };
