import {
  AiInvalidResponseError,
  AiProviderFailureError,
  AiTimeoutError,
} from "./errors";
import type { AiConfiguration } from "./configuration";
import type {
  AiGenerateStructuredRequest,
  AiGenerateStructuredResult,
  AiProvider,
} from "./types";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AiTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Deterministic provider for local/dev/tests — no network. */
export function createMockAiProvider(model: string): AiProvider {
  return {
    name: "mock",
    model,
    async generateStructured(request: AiGenerateStructuredRequest): Promise<AiGenerateStructuredResult> {
      const started = Date.now();
      await new Promise((r) => setTimeout(r, 0));
      // Echo a minimal structured payload; callers validate and may fall back.
      const payload = {
        headline: "Operational conditions reviewed from the current snapshot.",
        summary:
          "Priorities below reflect Needs Attention and In Progress signals only. Confirm details on the linked operational surfaces.",
        priorities: [] as unknown[],
        watchItems: [] as string[],
        generatedAt: new Date().toISOString(),
      };
      void request;
      return {
        rawText: JSON.stringify(payload),
        provider: "mock",
        model,
        latencyMs: Date.now() - started,
      };
    },
  };
}

export function createOpenAiCompatibleProvider(config: AiConfiguration): AiProvider {
  if (!config.apiKey) {
    throw new AiProviderFailureError("AI_API_KEY is required for the openai provider.");
  }
  const apiKey = config.apiKey;
  const model = config.model;
  const baseUrl = config.apiBaseUrl;

  return {
    name: "openai",
    model,
    async generateStructured(request: AiGenerateStructuredRequest): Promise<AiGenerateStructuredResult> {
      const started = Date.now();
      const body = {
        model,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          {
            role: "user",
            content: `${request.user}\n\nRespond with JSON only matching:\n${request.schemaDescription}`,
          },
        ],
      };

      const run = async () => {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (response.status === 429) {
          throw new AiProviderFailureError("Provider rate limited the request.");
        }
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new AiProviderFailureError(
            `Provider HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          );
        }
        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const rawText = json.choices?.[0]?.message?.content?.trim();
        if (!rawText) {
          throw new AiInvalidResponseError("Provider returned empty content.");
        }
        return rawText;
      };

      try {
        const rawText = await withTimeout(run(), request.timeoutMs);
        return {
          rawText,
          provider: "openai",
          model,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (error instanceof AiTimeoutError || error instanceof AiInvalidResponseError) {
          throw error;
        }
        if (error instanceof AiProviderFailureError) {
          throw error;
        }
        throw new AiProviderFailureError("Provider request failed.", error);
      }
    },
  };
}

export function createAiProvider(config: AiConfiguration): AiProvider {
  if (config.provider === "openai") {
    return createOpenAiCompatibleProvider(config);
  }
  return createMockAiProvider(config.model);
}

let injectedProvider: AiProvider | null = null;

/** Test helper — inject a provider without touching env. */
export function setAiProviderForTests(provider: AiProvider | null): void {
  injectedProvider = provider;
}

export function resolveAiProvider(config: AiConfiguration): AiProvider {
  return injectedProvider ?? createAiProvider(config);
}
