import { AiDisabledError, AiInvalidResponseError } from "./errors";
import type { AiConfiguration } from "./configuration";
import { resolveAiProvider } from "./provider";
import type { AiGenerateStructuredRequest, AiGenerateStructuredResult } from "./types";

export async function generateStructuredResponse(
  config: AiConfiguration,
  request: Omit<AiGenerateStructuredRequest, "timeoutMs"> & { timeoutMs?: number },
): Promise<AiGenerateStructuredResult> {
  if (!config.enabled) {
    throw new AiDisabledError();
  }

  const provider = resolveAiProvider(config);
  const result = await provider.generateStructured({
    ...request,
    timeoutMs: request.timeoutMs ?? config.requestTimeoutMs,
    maxOutputTokens: request.maxOutputTokens ?? config.maxOutputTokens,
  });

  if (!result.rawText.trim()) {
    throw new AiInvalidResponseError("Empty structured response.");
  }

  return result;
}

export function parseJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const payload = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(payload) as unknown;
  } catch (error) {
    throw new AiInvalidResponseError("Response was not valid JSON.", error);
  }
}
