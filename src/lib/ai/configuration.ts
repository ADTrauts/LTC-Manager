import type { AiProviderName } from "./types";

export type AiConfiguration = {
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  apiKey: string | null;
  apiBaseUrl: string;
  requestTimeoutMs: number;
  dailyRequestLimit: number;
  minRefreshIntervalMs: number;
  maxSnapshotChars: number;
  maxOutputTokens: number;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_DAILY_LIMIT = 24;
const DEFAULT_MIN_REFRESH_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SNAPSHOT_CHARS = 12_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 700;

function parseEnvFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return defaultValue;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadAiConfiguration(env: NodeJS.ProcessEnv = process.env): AiConfiguration {
  const providerRaw = (env.AI_PROVIDER ?? "mock").trim().toLowerCase();
  const provider: AiProviderName = providerRaw === "openai" ? "openai" : "mock";
  const model =
    env.AI_MODEL?.trim() ||
    (provider === "openai" ? "gpt-4o-mini" : "mock-morning-brief-v1");

  return {
    enabled: parseEnvFlag(env.AI_BRIEF_ENABLED, false),
    provider,
    model,
    apiKey: env.AI_API_KEY?.trim() || null,
    apiBaseUrl: (env.AI_API_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    requestTimeoutMs: parsePositiveInt(env.AI_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    dailyRequestLimit: parsePositiveInt(env.AI_DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT),
    minRefreshIntervalMs: parsePositiveInt(env.AI_MIN_REFRESH_INTERVAL_MS, DEFAULT_MIN_REFRESH_MS),
    maxSnapshotChars: parsePositiveInt(env.AI_MAX_SNAPSHOT_CHARS, DEFAULT_MAX_SNAPSHOT_CHARS),
    maxOutputTokens: parsePositiveInt(env.AI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
  };
}
