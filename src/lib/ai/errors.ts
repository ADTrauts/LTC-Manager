export type AiErrorCode =
  | "DISABLED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "PROVIDER_FAILURE"
  | "RATE_LIMITED"
  | "SNAPSHOT_TOO_LARGE"
  | "UNAUTHORIZED";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly cause?: unknown;

  constructor(code: AiErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.cause = cause;
  }
}

export class AiDisabledError extends AiError {
  constructor(message = "AI Morning Brief is disabled.") {
    super("DISABLED", message);
    this.name = "AiDisabledError";
  }
}

export class AiTimeoutError extends AiError {
  constructor(message = "AI provider request timed out.") {
    super("TIMEOUT", message);
    this.name = "AiTimeoutError";
  }
}

export class AiInvalidResponseError extends AiError {
  constructor(message = "AI provider returned an invalid response.", cause?: unknown) {
    super("INVALID_RESPONSE", message, cause);
    this.name = "AiInvalidResponseError";
  }
}

export class AiProviderFailureError extends AiError {
  constructor(message = "AI provider request failed.", cause?: unknown) {
    super("PROVIDER_FAILURE", message, cause);
    this.name = "AiProviderFailureError";
  }
}

export class AiRateLimitedError extends AiError {
  constructor(message = "AI request rate limit reached.") {
    super("RATE_LIMITED", message);
    this.name = "AiRateLimitedError";
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}
