/**
 * Test-only card failure. Ignored unless the browser check sets
 * `DASHBOARD_FAULT_INJECTION=true`. A `?fault=` query does nothing otherwise.
 */
export function dashboardFaultCardId(requested: string | null | undefined): string | null {
  if (process.env.DASHBOARD_FAULT_INJECTION !== "true") return null;
  const id = requested?.trim();
  if (!id) return null;
  return id;
}
