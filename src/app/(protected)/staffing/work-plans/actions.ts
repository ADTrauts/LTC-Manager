"use server";

import { GENERIC_WORK_AUTHORING_RETIRED } from "@/lib/department-work";
import type { WorkPlanDraftInput } from "@/lib/department-work";

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function createWorkPlanDraftAction(_input: {
  facilityId: string;
  departmentId: string;
  draft: WorkPlanDraftInput;
}): Promise<{ id: string }> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function createWorkPlanPresetDraftAction(_input: {
  facilityId: string;
  departmentId: string;
  presetKey: string;
}): Promise<{ id: string }> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function updateWorkPlanDraftAction(_input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
  draft: WorkPlanDraftInput;
}): Promise<{ id: string }> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function publishWorkPlanAction(_input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}): Promise<void> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function retireWorkPlanAction(_input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}): Promise<void> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function duplicateWorkPlanAction(_input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}): Promise<{ id: string }> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function createWorkPlanSuccessorAction(_input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}): Promise<{ id: string }> {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}
