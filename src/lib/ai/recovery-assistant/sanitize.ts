import { createHash } from "node:crypto";

import type { RecoverySnapshot } from "./types";

const PII_PATTERN =
  /(email|phone|mobile|birthday|ssn|password|firstName|lastName|employeeName|fullName|resident|patient)/i;

const MAX_DESCRIPTION = 400;
const MAX_UPDATE_SUMMARY = 180;
const MAX_UPDATES = 5;
const MAX_KNOWLEDGE = 6;
const MAX_SIGNALS = 6;

export function sanitizePlainText(value: string, maxLen: number): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted]")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeRecoverySnapshot(snapshot: RecoverySnapshot): RecoverySnapshot {
  const knowledge = snapshot.knowledge.slice(0, MAX_KNOWLEDGE).map((k) => ({
    title: sanitizePlainText(k.title, 120),
    summary: sanitizePlainText(k.summary, 220),
    category: k.category,
    sourcePath: k.sourcePath,
  }));

  const recentUpdates = snapshot.issue.recentUpdates.slice(-MAX_UPDATES).map((u) => ({
    timestamp: u.timestamp,
    sanitizedSummary: sanitizePlainText(u.sanitizedSummary, MAX_UPDATE_SUMMARY),
    status: u.status,
  }));

  const cleaned: RecoverySnapshot = {
    ...snapshot,
    issue: {
      ...snapshot.issue,
      title: sanitizePlainText(snapshot.issue.title, 160),
      sanitizedDescription: sanitizePlainText(
        snapshot.issue.sanitizedDescription,
        MAX_DESCRIPTION,
      ),
      recentUpdates,
      relatedAsset: snapshot.issue.relatedAsset
        ? {
            id: snapshot.issue.relatedAsset.id,
            name: sanitizePlainText(snapshot.issue.relatedAsset.name, 120),
            status: snapshot.issue.relatedAsset.status,
            criticality: snapshot.issue.relatedAsset.criticality,
          }
        : null,
    },
    operationalImpact: {
      ...snapshot.operationalImpact,
      affectedSignals: snapshot.operationalImpact.affectedSignals.slice(0, MAX_SIGNALS),
    },
    knowledge,
    availableActions: snapshot.availableActions,
    allowedSourcePaths: Array.from(
      new Set([
        ...snapshot.allowedSourcePaths,
        ...knowledge.map((k) => k.sourcePath),
        ...snapshot.availableActions.map((a) => a.sourcePath),
      ]),
    ),
  };

  // Drop any accidental PII-shaped keys if callers spread extras.
  const json = JSON.parse(JSON.stringify(cleaned)) as Record<string, unknown>;
  stripPiiKeys(json);
  return json as unknown as RecoverySnapshot;
}

function stripPiiKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) stripPiiKeys(item);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (PII_PATTERN.test(key)) {
      delete obj[key];
      continue;
    }
    stripPiiKeys(obj[key]);
  }
}

export function enforceRecoverySnapshotSize(
  snapshot: RecoverySnapshot,
  maxChars: number,
): RecoverySnapshot {
  let json = JSON.stringify(snapshot);
  if (json.length <= maxChars) return snapshot;
  const trimmed: RecoverySnapshot = {
    ...snapshot,
    issue: {
      ...snapshot.issue,
      recentUpdates: snapshot.issue.recentUpdates.slice(-3),
      sanitizedDescription: snapshot.issue.sanitizedDescription.slice(0, 240),
    },
    knowledge: snapshot.knowledge.slice(0, 3),
    operationalImpact: {
      ...snapshot.operationalImpact,
      affectedSignals: snapshot.operationalImpact.affectedSignals.slice(0, 3),
    },
  };
  json = JSON.stringify(trimmed);
  if (json.length <= maxChars) return trimmed;
  return {
    ...trimmed,
    knowledge: [],
    issue: { ...trimmed.issue, recentUpdates: [] },
  };
}

export function hashRecoverySnapshot(snapshot: RecoverySnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 32);
}
