export function normalizeLogTab(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
