export const ACCOUNT_INVITE_STATUS_LABEL = {
  missing: "No unused account invite",
  expired: "Account invite expired",
  valid: "Account invite valid",
} as const;

export function accountInviteStatus(latestUnusedExpiry: Date | null, now: Date) {
  if (!latestUnusedExpiry) return "missing";
  return latestUnusedExpiry > now ? "valid" : "expired";
}
