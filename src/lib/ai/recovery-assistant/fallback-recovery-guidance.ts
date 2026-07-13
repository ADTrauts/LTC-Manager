import { issueDetailPath } from "@/lib/work/issues/issue-copy";

import type { RecoveryAssistantResult, RecoverySnapshot } from "./types";

/** Deterministic recovery guidance — never labeled AI-generated. */
export function buildFallbackRecoveryGuidance(snapshot: RecoverySnapshot): RecoveryAssistantResult {
  const { issue, operationalImpact, knowledge, availableActions } = snapshot;
  const issuePath = issueDetailPath(issue.id);
  const unitPath =
    availableActions.find((a) => a.key === "unit_workspace")?.sourcePath ??
    `/unit/${issue.location.id}`;

  const checkFirst: RecoveryAssistantResult["checkFirst"] = [];
  const recoveryOptions: RecoveryAssistantResult["recoveryOptions"] = [];
  const missingInformation: string[] = [];

  if (!issue.assigned && issue.recoveryStage !== "RESOLVED") {
    checkFirst.push({
      action: "Assign an owner",
      reason: "This issue is unassigned; recovery ownership is unclear.",
      sourcePath: issuePath,
    });
    missingInformation.push("Assigned owner");
  }

  if (issue.recoveryStage === "IN_PROGRESS" || issue.recoveryStage === "WAITING") {
    checkFirst.push({
      action: "Review the latest recovery update",
      reason: "Work is underway; confirm the current status before taking new steps.",
      sourcePath: issuePath,
    });
  }

  checkFirst.push({
    action: `Confirm impact at ${issue.location.name}`,
    reason: `Location is ${labelState(issue.location.readinessState)}: ${issue.location.readinessReason}`,
    sourcePath: unitPath,
  });

  if (issue.relatedAsset) {
    checkFirst.push({
      action: `Verify asset status (${issue.relatedAsset.name})`,
      reason: `${issue.relatedAsset.criticality} asset is ${issue.relatedAsset.status}.`,
      sourcePath: "/assets",
    });
  }

  switch (issue.issueType) {
    case "EQUIPMENT":
      recoveryOptions.push({
        title: "Follow linked equipment guidance",
        description:
          knowledge.length > 0
            ? "Review published SOP/troubleshooting for this asset or location before changing service."
            : "No published equipment procedure is linked. Confirm safe operating state with facility procedures you already use.",
        sourcePath: knowledge[0]?.sourcePath ?? issuePath,
        confidence: knowledge.length > 0 ? "supported" : "conditional",
      });
      if (!issue.relatedAsset) {
        missingInformation.push("Related asset identification");
      }
      break;
    case "SUPPLY_SHORT":
      recoveryOptions.push({
        title: "Confirm stock and substitute options",
        description:
          "Confirm available stock, expected replenishment, and whether a substitute is approved in published guidance.",
        sourcePath: knowledge[0]?.sourcePath ?? issuePath,
        confidence: knowledge.length > 0 ? "supported" : "conditional",
      });
      missingInformation.push("Expected replenishment timing");
      break;
    case "SAFETY":
      recoveryOptions.push({
        title: "Follow published safety procedure only",
        description:
          knowledge.length > 0
            ? "Use the linked safety/SOP article. Do not improvise safety steps beyond published guidance."
            : "No published safety procedure is linked. Escalate using your facility's established safety channel; do not invent steps.",
        sourcePath: knowledge[0]?.sourcePath ?? issuePath,
        confidence: knowledge.length > 0 ? "supported" : "conditional",
      });
      if (knowledge.length === 0) {
        missingInformation.push("Published safety procedure");
      }
      break;
    case "ENVIRONMENT":
      recoveryOptions.push({
        title: "Contain and restore the affected area",
        description: "Confirm department ownership and apply linked area procedures when available.",
        sourcePath: knowledge[0]?.sourcePath ?? unitPath,
        confidence: knowledge.length > 0 ? "supported" : "conditional",
      });
      break;
    case "SERVICE_DISRUPTION":
      recoveryOptions.push({
        title: "Protect current service continuity",
        description: `Active operation: ${operationalImpact.currentOperationLabel}. Review coverage/handoffs and location readiness before expanding impact.`,
        sourcePath: availableActions.find((a) => a.key === "handoffs")?.sourcePath ?? issuePath,
        confidence: "supported",
      });
      break;
    default:
      recoveryOptions.push({
        title: "Stabilize with known facts",
        description: "Use the issue record and linked guidance only. Avoid undocumented workarounds.",
        sourcePath: issuePath,
        confidence: "conditional",
      });
  }

  if (issue.recoveryStage === "RESOLVED") {
    checkFirst.length = 0;
    checkFirst.push({
      action: "Confirm service restored at the location",
      reason: "Issue is marked resolved; verify operational readiness before closing out attention.",
      sourcePath: unitPath,
    });
    recoveryOptions.length = 0;
    recoveryOptions.push({
      title: "Monitor for recurrence",
      description: "No further recovery actions are required unless readiness regresses.",
      sourcePath: issuePath,
      confidence: "supported",
    });
  }

  const knowledgeUsed = knowledge.slice(0, 3).map((k) => ({
    title: k.title,
    sourcePath: k.sourcePath,
  }));

  const headline =
    issue.recoveryStage === "RESOLVED"
      ? `${issue.title} is resolved — confirm location readiness.`
      : !issue.assigned
        ? `${issue.title} needs an owner before recovery can proceed.`
        : `${issue.title} is ${stagePhrase(issue.recoveryStage)}.`;

  const situationParts = [
    `${issue.issueType.replaceAll("_", " ").toLowerCase()} at ${issue.location.name} · ${issue.priority.toLowerCase()} priority.`,
    operationalImpact.currentServiceAtRisk
      ? `Current operation (${operationalImpact.currentOperationLabel}) may be affected.`
      : `Current operation (${operationalImpact.currentOperationLabel}) is not flagged as at risk from this issue alone.`,
  ];
  if (issue.recentUpdates.length > 0) {
    situationParts.push("Review the latest recovery update before changing course.");
  } else if (knowledge.length === 0) {
    situationParts.push("No published guidance is linked for this context.");
  }

  return {
    headline,
    situation: situationParts.slice(0, 3).join(" "),
    checkFirst: checkFirst.slice(0, 3),
    recoveryOptions: recoveryOptions.slice(0, 3),
    missingInformation: missingInformation.slice(0, 3),
    knowledgeUsed,
    generatedAt: snapshot.generatedAt,
  };
}

function labelState(state: string): string {
  if (state === "needs_attention") return "Needs Attention";
  if (state === "in_progress") return "In Progress";
  return "Ready";
}

function stagePhrase(stage: string): string {
  if (stage === "IN_PROGRESS") return "in progress";
  if (stage === "WAITING") return "waiting";
  if (stage === "ASSIGNED") return "assigned";
  if (stage === "REPORTED") return "reported";
  return "resolved";
}
