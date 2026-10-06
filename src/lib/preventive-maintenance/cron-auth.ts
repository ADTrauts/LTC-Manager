/**
 * Plant Preventive Maintenance cron authentication.
 * Timing-safe Bearer CRON_SECRET compare. Independent of support automation.
 */

export function isPlantPmCronAuthorized(
  request: Request,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
