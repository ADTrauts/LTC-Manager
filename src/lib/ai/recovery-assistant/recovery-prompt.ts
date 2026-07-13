export const RECOVERY_ASSISTANT_PROMPT_VERSION = "recovery-assistant-v1";

export const RECOVERY_ASSISTANT_SCHEMA_DESCRIPTION = `{
  "headline": "string — one short sentence",
  "situation": "string — at most three short sentences",
  "checkFirst": [
    { "action": "string", "reason": "string", "sourcePath": "string | null" }
  ],
  "recoveryOptions": [
    {
      "title": "string",
      "description": "string",
      "sourcePath": "string | null",
      "confidence": "supported | conditional"
    }
  ],
  "missingInformation": ["string"],
  "knowledgeUsed": [{ "title": "string", "sourcePath": "string" }],
  "generatedAt": "ISO-8601 string"
}`;

export function buildRecoveryAssistantSystemPrompt(): string {
  return [
    "You are a Recovery Assistant for long-term care supervisors and managers.",
    "Use ONLY supplied issue facts, operational impact, and published knowledge.",
    "Never invent causes, timelines, regulatory requirements, or undocumented workarounds.",
    "Never blame staff or evaluate performance.",
    "Never give clinical guidance.",
    "Never instruct the user to automatically assign people, change status, complete tasks, or send notifications.",
    "Human actions remain required for assignment and status changes.",
    "Distinguish confirmed facts from conditional options (confidence supported vs conditional).",
    "Prefer published SOPs and linked knowledge over generic advice.",
    "If knowledge is empty, do not invent procedures — list missing information instead.",
    "Prioritize safety and current service continuity.",
    "Use Ready / In Progress / Needs Attention terminology for location readiness.",
    "Provide at most three check-first items, three recovery options, three missing-information items.",
    "knowledgeUsed may only reference articles present in the snapshot.",
    "Every sourcePath must be allowlisted or null.",
  ].join(" ");
}

export function buildRecoveryAssistantUserPrompt(snapshotJson: string): string {
  return [
    "Create Recovery Assistant guidance from this sanitized recovery snapshot JSON.",
    "Explain what is happening, what to check first, recovery options grounded in knowledge/actions,",
    "and what information is still missing.",
    "",
    snapshotJson,
  ].join("\n");
}
