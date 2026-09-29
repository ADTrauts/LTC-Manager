const DEFAULT_FROM_EMAIL = "noreply@vssyl.com";
const DEFAULT_MESSAGE_STREAM = "outbound";

type EnvLike = Record<string, string | undefined>;

export function isEmailConfigured(env: EnvLike = process.env): boolean {
  return Boolean(env.POSTMARK_SERVER_TOKEN?.trim());
}

export function getPostmarkServerToken(env: EnvLike = process.env): string | null {
  const token = env.POSTMARK_SERVER_TOKEN?.trim();
  return token ? token : null;
}

export function getEmailFromAddress(env: EnvLike = process.env): string {
  return env.POSTMARK_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
}

export function getEmailMessageStream(env: EnvLike = process.env): string {
  return env.POSTMARK_MESSAGE_STREAM?.trim() || DEFAULT_MESSAGE_STREAM;
}
