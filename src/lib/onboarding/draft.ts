export const SETUP_GUIDE_STEPS = ["site", "products", "building", "equipment", "people", "finish"] as const;

export type SetupGuideStep = (typeof SETUP_GUIDE_STEPS)[number] | `department:${string}`;

export type SetupApproach = "self" | "vssyl";

export type SetupDraft = {
  version: 5;
  facilityId: string;
  step: SetupGuideStep;
  reached: SetupGuideStep;
  selectedKeys: string[];
  /** Null until the facility chooses. An older draft with no field is already in the guide. */
  approach: SetupApproach | null;
};

const DEPARTMENT_STEP = /^department:[A-Za-z0-9_]+$/;

export const setupDraftKey = (userId: string, facilityId: string) => `vssyl.setup/5/${userId}/${facilityId}`;

export function departmentStep(productKey: string): SetupGuideStep {
  return `department:${productKey}`;
}

export function productKeyFromDepartmentStep(step: SetupGuideStep): string | null {
  return step.startsWith("department:") ? step.slice("department:".length) : null;
}

/** Fixed questions, with one page inserted for each chosen or already licensed Product. That page names who runs the Department. */
export function guidePath(selectedKeys: readonly string[], licensedOrInstalled: readonly string[]): SetupGuideStep[] {
  const departmentKeys: string[] = [];
  for (const key of [...selectedKeys, ...licensedOrInstalled]) {
    if (!departmentKeys.includes(key)) departmentKeys.push(key);
  }
  return ["site", "products", "building", "equipment", ...departmentKeys.map(departmentStep), "people", "finish"];
}

export function guideIndex(path: readonly SetupGuideStep[], step: SetupGuideStep): number {
  const index = path.indexOf(step);
  return index < 0 ? 0 : index;
}

export function nextGuideStep(path: readonly SetupGuideStep[], step: SetupGuideStep): SetupGuideStep {
  const index = guideIndex(path, step);
  return path[Math.min(path.length - 1, index + 1)] ?? "site";
}

export function previousGuideStep(path: readonly SetupGuideStep[], step: SetupGuideStep): SetupGuideStep {
  const index = guideIndex(path, step);
  return path[Math.max(0, index - 1)] ?? "site";
}

export function canOpenGuideStep(path: readonly SetupGuideStep[], reached: SetupGuideStep, target: SetupGuideStep): boolean {
  return guideIndex(path, target) <= guideIndex(path, reached) && path.includes(target);
}

function isGuideStep(value: unknown, availableKeys: readonly string[]): value is SetupGuideStep {
  if (typeof value !== "string") return false;
  if ((SETUP_GUIDE_STEPS as readonly string[]).includes(value)) return true;
  if (!DEPARTMENT_STEP.test(value)) return false;
  const key = value.slice("department:".length);
  return availableKeys.includes(key);
}

export function readSetupDraft(
  raw: string | null,
  facilityId: string,
  availableKeys: readonly string[],
  fallback: SetupGuideStep,
): SetupDraft {
  const empty: SetupDraft = { version: 5, facilityId, step: fallback, reached: fallback, selectedKeys: [], approach: null };
  let value: Partial<SetupDraft> = {};
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    return empty;
  }
  if (!value || value.version !== 5 || value.facilityId !== facilityId) return empty;
  const selectedKeys = Array.isArray(value.selectedKeys)
    ? [...new Set(value.selectedKeys.filter((key) => availableKeys.includes(key)))]
    : [];
  const known = new Set([...availableKeys, ...selectedKeys]);
  const step = isGuideStep(value.step, [...known]) ? value.step : fallback;
  const reached = isGuideStep(value.reached, [...known]) ? value.reached : step;
  const approach = value.approach === "self" || value.approach === "vssyl" ? value.approach : null;
  return { version: 5, facilityId, step, reached, selectedKeys, approach };
}

/** Checkout continues in order. Success opens the building when the guide has not passed Products. A later guide stays where it reached. A canceled checkout stays on Products. */
export function guideArrival(
  draft: SetupDraft,
  path: readonly SetupGuideStep[],
  checkout: string | null,
): Pick<SetupDraft, "step" | "reached"> {
  let step = path.includes(draft.step) ? draft.step : path[0] ?? "site";
  let reached = path.includes(draft.reached) ? draft.reached : step;
  if (guideIndex(path, reached) < guideIndex(path, step)) reached = step;

  if (checkout === "canceled") {
    step = "products";
    if (guideIndex(path, reached) < guideIndex(path, step)) reached = step;
  } else if (checkout === "success" || checkout === "updated") {
    if (guideIndex(path, reached) <= guideIndex(path, "products")) {
      step = "building";
      reached = "building";
    } else {
      step = reached;
    }
  }

  if (guideIndex(path, step) > guideIndex(path, reached)) step = reached;
  return { step, reached };
}

/** Coming back from a builder opens the next question once. A return from an earlier builder resumes the furthest question. */
export function applyBuilderReturn(
  position: Pick<SetupDraft, "step" | "reached">,
  path: readonly SetupGuideStep[],
  returned: string | null,
): Pick<SetupDraft, "step" | "reached"> {
  if (!returned || !path.includes(returned as SetupGuideStep)) return position;
  const from = returned as SetupGuideStep;
  if (guideIndex(path, from) > guideIndex(path, position.reached)) return position;
  const next = nextGuideStep(path, from);
  if (guideIndex(path, next) > guideIndex(path, position.reached)) return { step: next, reached: next };
  return { step: position.reached, reached: position.reached };
}
