import { dietaryReadinessProfile } from "./dietary-readiness-profile";
import { evsReadinessProfile } from "./evs-readiness-profile";
import { neutralReadinessProfile } from "./neutral-readiness-profile";
import { plantReadinessProfile } from "./plant-readiness-profile";
import type { ReadinessProfile, ReadinessProfileKey } from "./types";

export type {
  ReadinessContributingSignal,
  ReadinessProfile,
  ReadinessProfileInput,
  ReadinessProfileKey,
  ReadinessProfileResult,
} from "./types";
export {
  mealLabelForType,
  resolveProfileKeyFromUnitType,
  resolveUnitProfileKey,
} from "./resolve-readiness-profile";
export { dietaryReadinessProfile, evaluateDietaryReadiness } from "./dietary-readiness-profile";
export { evsReadinessProfile, evaluateEvsReadiness } from "./evs-readiness-profile";
export { plantReadinessProfile, evaluatePlantReadiness } from "./plant-readiness-profile";
export { neutralReadinessProfile, evaluateNeutralReadiness } from "./neutral-readiness-profile";

const PROFILES: Record<ReadinessProfileKey, ReadinessProfile> = {
  DIETARY: dietaryReadinessProfile,
  EVS: evsReadinessProfile,
  PLANT: plantReadinessProfile,
  NEUTRAL: neutralReadinessProfile,
};

export function resolveReadinessProfile(key: ReadinessProfileKey | null | undefined): ReadinessProfile {
  if (!key) return neutralReadinessProfile;
  return PROFILES[key] ?? neutralReadinessProfile;
}
