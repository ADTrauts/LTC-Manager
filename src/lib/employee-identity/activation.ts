export const ACCOUNT_ACTIVATION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const ACCOUNT_ACTIVATION_REQUIRED_MESSAGE = "Account activation required";

export type AccountActivationFacts = {
  isActive: boolean;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
};

export function isGlobalAccountActivated(
  user: Pick<AccountActivationFacts, "isActive" | "passwordHash" | "emailVerifiedAt">,
): boolean {
  return Boolean(user.isActive && user.passwordHash && user.emailVerifiedAt);
}

export function getAccountActivationDeadline(user: Pick<AccountActivationFacts, "createdAt">): Date {
  return new Date(user.createdAt.getTime() + ACCOUNT_ACTIVATION_GRACE_MS);
}

export function isWithinPinActivationGrace(
  user: Pick<AccountActivationFacts, "createdAt">,
  now: Date = new Date(),
): boolean {
  return now.getTime() <= getAccountActivationDeadline(user).getTime();
}

export type EmployeeAccountPresentation =
  | { kind: "unlinked"; label: string; daysRemaining: null }
  | { kind: "active"; label: string; daysRemaining: null }
  | { kind: "pending"; label: string; daysRemaining: number }
  | { kind: "overdue"; label: string; daysRemaining: 0 };

export function activationDaysRemaining(
  user: Pick<AccountActivationFacts, "createdAt">,
  now: Date = new Date(),
): number {
  const remainingMs = getAccountActivationDeadline(user).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export function presentEmployeeAccountState(
  user: AccountActivationFacts | null,
  now: Date = new Date(),
): EmployeeAccountPresentation {
  if (!user) {
    return { kind: "unlinked", label: "Account not linked", daysRemaining: null };
  }
  if (isGlobalAccountActivated(user)) {
    return { kind: "active", label: "Account active", daysRemaining: null };
  }
  if (isWithinPinActivationGrace(user, now)) {
    const daysRemaining = activationDaysRemaining(user, now);
    return {
      kind: "pending",
      label: `Activation pending — ${daysRemaining} days remaining`,
      daysRemaining,
    };
  }
  return { kind: "overdue", label: "Activation overdue", daysRemaining: 0 };
}

export function pinActivationDenied(
  employeeUserId: string | null,
  user: AccountActivationFacts | null,
  now: Date = new Date(),
): boolean {
  if (!employeeUserId || !user) return false;
  return !isGlobalAccountActivated(user) && !isWithinPinActivationGrace(user, now);
}
