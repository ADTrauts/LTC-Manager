/**
 * Compact count phrases for Build Context Bar facts.
 */
export function formatBuildCountFact(
  count: number,
  singular: string,
  plural: string,
): { value: string; suffix: string } {
  return {
    value: String(count),
    suffix: count === 1 ? singular : plural,
  };
}
