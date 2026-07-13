export type {
  AiGenerateStructuredRequest,
  AiGenerateStructuredResult,
  AiProvider,
  AiProviderName,
  MorningBriefOrigin,
  MorningBriefPriority,
  MorningBriefResult,
  MorningBriefUrgency,
  MorningBriefView,
} from "./types";

export {
  AiDisabledError,
  AiError,
  AiInvalidResponseError,
  AiProviderFailureError,
  AiRateLimitedError,
  AiTimeoutError,
  isAiError,
} from "./errors";

export { loadAiConfiguration, type AiConfiguration } from "./configuration";
export {
  createAiProvider,
  createMockAiProvider,
  createOpenAiCompatibleProvider,
  resolveAiProvider,
  setAiProviderForTests,
} from "./provider";
export { generateStructuredResponse, parseJsonObject } from "./generate-structured-response";

export {
  buildOperationalSnapshot,
  diffOperationalSnapshots,
  enforceSnapshotSize,
  hashOperationalSnapshot,
  sanitizeOperationalSnapshot,
  type BuildOperationalSnapshotInput,
  type OperationalSnapshot,
  type OperationalSnapshotDiff,
} from "./operational-snapshot";

export {
  getOrGenerateMorningBrief,
  buildFallbackMorningBrief,
  validateMorningBriefResponse,
  buildMorningBriefSystemPrompt,
  buildMorningBriefUserPrompt,
  MORNING_BRIEF_PROMPT_VERSION,
  createMemoryBriefCacheStore,
  evaluateMorningBriefRateLimits,
  type GenerateMorningBriefInput,
} from "./morning-brief";

export {
  getOrGenerateShiftTransition,
  buildFallbackShiftTransition,
  validateShiftTransitionResponse,
  buildShiftTransitionSystemPrompt,
  buildShiftTransitionUserPrompt,
  SHIFT_TRANSITION_PROMPT_VERSION,
  evaluateShiftTransitionRateLimits,
  type GenerateShiftTransitionInput,
  type ShiftTransitionView,
  type ShiftTransitionResult,
} from "./shift-transition";

export {
  getOrGenerateRecoveryAssistant,
  buildFallbackRecoveryGuidance,
  validateRecoveryAssistantResponse,
  buildRecoveryAssistantSystemPrompt,
  RECOVERY_ASSISTANT_PROMPT_VERSION,
  type GenerateRecoveryAssistantInput,
  type RecoveryAssistantView,
  type RecoveryAssistantResult,
  type RecoverySnapshot,
} from "./recovery-assistant";
