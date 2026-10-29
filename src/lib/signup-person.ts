/**
 * Public signup finds a person by email. The email already belongs to one User.
 * A matching password adds a facility to that User. A new email creates the User.
 * A wrong password is refused without saying whether the email is in use.
 */

export type ExistingSignupPerson = {
  id: string;
  passwordHash: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
};

export type SignupPersonResolution =
  | { outcome: "create"; passwordHash: string; emailVerifiedAt: Date | null }
  | { outcome: "reuse"; userId: string; emailVerifiedAt: Date | null }
  | { outcome: "reject" };

export async function resolveSignupPerson(input: {
  password: string;
  mailConfigured: boolean;
  now: Date;
  existing: ExistingSignupPerson | null;
  absentAccountHash: string;
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
}): Promise<SignupPersonResolution> {
  const existing = input.existing;
  if (existing) {
    const passwordMatches =
      existing.passwordHash != null &&
      (await input.comparePassword(input.password, existing.passwordHash));
    if (!existing.isActive || !passwordMatches) {
      if (existing.passwordHash == null) {
        await input.comparePassword(input.password, input.absentAccountHash);
      }
      return { outcome: "reject" };
    }
    return {
      outcome: "reuse",
      userId: existing.id,
      emailVerifiedAt: existing.emailVerifiedAt,
    };
  }

  await input.comparePassword(input.password, input.absentAccountHash);
  return {
    outcome: "create",
    passwordHash: await input.hashPassword(input.password),
    emailVerifiedAt: input.mailConfigured ? null : input.now,
  };
}
