export const MORNING_BRIEF_PROMPT_VERSION = "morning-brief-v1";

export const MORNING_BRIEF_SCHEMA_DESCRIPTION = `{
  "headline": "string — one short sentence",
  "summary": "string — at most three short sentences",
  "priorities": [
    {
      "title": "string",
      "reason": "string",
      "sourcePath": "string — must be one of allowedSourcePaths",
      "urgency": "attention | in_progress | monitor"
    }
  ],
  "watchItems": ["string"],
  "generatedAt": "ISO-8601 string"
}`;

export function buildMorningBriefSystemPrompt(): string {
  return [
    "You are an operational partner for long-term care facility managers.",
    "Summarize ONLY the supplied operational snapshot facts.",
    "Never invent units, issues, counts, links, IDs, employee names, or resident information.",
    "Never give clinical advice or recommend autonomous actions.",
    "Distinguish Needs Attention, In Progress, and Ready.",
    "Prioritize current-operation risks over routine future work.",
    "Use calm, specific operator language. Avoid dramatic or generic management advice.",
    "Provide at most three priorities and at most three watch items.",
    "Every priority.sourcePath must appear in snapshot.allowedSourcePaths.",
    "If nothing needs attention, say service is generally on track and keep priorities empty or light monitor items only when grounded.",
  ].join(" ");
}

export function buildMorningBriefUserPrompt(sanitizedSnapshotJson: string): string {
  return [
    "Create a Morning Brief from this sanitized operational snapshot JSON.",
    "Focus on what needs attention first, what changed for current service, and what can wait.",
    "Prefer Needs Attention locations and staffing/issue signals tied to the active operation.",
    "",
    sanitizedSnapshotJson,
  ].join("\n");
}
