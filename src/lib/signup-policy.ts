type SignupEnvironment = {
  NODE_ENV?: string;
  PUBLIC_SIGNUP_ENABLED?: string;
};

/**
 * Self-service tenant creation is disabled by default in production.
 * A public launch must opt in explicitly after abuse controls and email verification are present.
 */
export function isPublicSignupEnabled(environment: SignupEnvironment = process.env): boolean {
  const configured = environment.PUBLIC_SIGNUP_ENABLED?.trim().toLowerCase();
  if (configured !== undefined && configured !== "") {
    return configured === "true" || configured === "1";
  }
  return environment.NODE_ENV !== "production";
}
