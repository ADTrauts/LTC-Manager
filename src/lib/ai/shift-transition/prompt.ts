export const SHIFT_TRANSITION_PROMPT_VERSION = "shift-transition-v1";

export const SHIFT_TRANSITION_SCHEMA_DESCRIPTION = `{
  "title": "string — short handoff title",
  "summary": "string — at most three short sentences",
  "resolved": [{ "text": "string", "sourcePath": "string | null" }],
  "carryForward": [{
    "title": "string",
    "reason": "string",
    "sourcePath": "string — must be allowlisted",
    "urgency": "attention | in_progress | monitor"
  }],
  "changed": [{
    "text": "string",
    "direction": "new | improved | worsened | unchanged",
    "sourcePath": "string | null"
  }],
  "generatedAt": "ISO-8601 string",
  "baselineAvailable": "boolean"
}`;

export function buildShiftTransitionSystemPrompt(): string {
  return [
    "You write a Shift Transition Summary for long-term care supervisors.",
    "Report ONLY facts from the supplied current snapshot and deterministic diff.",
    "Never invent units, issues, counts, links, IDs, employee names, or resident information.",
    "Never blame staff, evaluate performance, give clinical advice, or recommend autonomous actions.",
    "Distinguish resolved work from unresolved carry-forward work.",
    "Prioritize carry-forward items that still need attention.",
    "Use Ready, In Progress, and Needs Attention terminology.",
    "Do not label routine open work as urgent unless the snapshot marks Needs Attention or urgent issues.",
    "Do not infer causes. Use calm operational language.",
    "At most three resolved items, five carry-forward items, and five changed items.",
    "Every sourcePath must appear in allowedSourcePaths (or be null where allowed).",
    "If baselineAvailable is false, do not invent changes — summarize current unresolved handoffs only.",
  ].join(" ");
}

export function buildShiftTransitionUserPrompt(payloadJson: string): string {
  return [
    "Create a Shift Transition Summary from this JSON payload.",
    "Focus on what changed, what was recovered, and what the next team must carry forward.",
    "",
    payloadJson,
  ].join("\n");
}
