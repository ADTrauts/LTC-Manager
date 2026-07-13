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
  enforceSnapshotSize,
  hashOperationalSnapshot,
  sanitizeOperationalSnapshot,
  type BuildOperationalSnapshotInput,
  type OperationalSnapshot,
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
