import { isEmailConfigured } from "./email/config";

/** Deployed signup requires both an explicit launch decision and verification email. */
export function isPublicSignupEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  const deployed = environment.NODE_ENV === "production" ||
    environment.VERCEL_ENV === "production" || environment.VERCEL_ENV === "preview";
  const configured = environment.PUBLIC_SIGNUP_ENABLED?.trim().toLowerCase();
  if (deployed && !isEmailConfigured(environment)) return false;
  if (configured) return configured === "true" || configured === "1";
  return !deployed;
}
