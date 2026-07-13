export type AiProviderName = "mock" | "openai";

export type AiGenerateStructuredRequest = {
  system: string;
  user: string;
  /** JSON Schema-like description for the model (informational). */
  schemaDescription: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs: number;
};

export type AiGenerateStructuredResult = {
  rawText: string;
  provider: AiProviderName;
  model: string;
  latencyMs: number;
};

export type AiProvider = {
  readonly name: AiProviderName;
  readonly model: string;
  generateStructured(request: AiGenerateStructuredRequest): Promise<AiGenerateStructuredResult>;
};

export type MorningBriefUrgency = "attention" | "in_progress" | "monitor";

export type MorningBriefPriority = {
  title: string;
  reason: string;
  sourcePath: string;
  urgency: MorningBriefUrgency;
};

export type MorningBriefResult = {
  headline: string;
  summary: string;
  priorities: MorningBriefPriority[];
  watchItems: string[];
  generatedAt: string;
};

export type MorningBriefOrigin = "ai" | "fallback" | "cached";

export type MorningBriefView = {
  title: "Morning Brief" | "Operational Summary";
  origin: MorningBriefOrigin;
  result: MorningBriefResult;
  provider: string | null;
  model: string | null;
  snapshotHash: string;
  promptVersion: string;
  fallbackReason: string | null;
  canRefresh: boolean;
  refreshBlockedReason: string | null;
  generatedAt: string;
};
