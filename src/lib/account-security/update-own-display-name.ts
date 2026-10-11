export type NormalizeDisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function normalizeDisplayName(raw: string): NormalizeDisplayNameResult {
  const value = raw.trim();
  if (value.length < 1) {
    return { ok: false, message: "Enter a display name." };
  }
  if (value.length > 120) {
    return { ok: false, message: "Display name must be 120 characters or fewer." };
  }
  return { ok: true, value };
}

export type UpdateOwnDisplayNameResult =
  | { ok: true; displayName: string; sessionVersion: number }
  | { ok: false; message: string };

type DisplayNameClient = {
  user: {
    findFirst: (args: {
      where: { id: string; isActive: boolean };
      select: { id: true; sessionVersion: true };
    }) => Promise<{ id: string; sessionVersion: number } | null>;
    update: (args: {
      where: { id: string };
      data: { displayName: string };
      select: { displayName: true; sessionVersion: true };
    }) => Promise<{ displayName: string; sessionVersion: number }>;
  };
};

export async function updateOwnDisplayName(
  client: DisplayNameClient,
  input: { userId: string; displayName: string },
): Promise<UpdateOwnDisplayNameResult> {
  const normalized = normalizeDisplayName(input.displayName);
  if (!normalized.ok) {
    return normalized;
  }

  const user = await client.user.findFirst({
    where: { id: input.userId, isActive: true },
    select: { id: true, sessionVersion: true },
  });
  if (!user) {
    return { ok: false, message: "User account not found." };
  }

  const updated = await client.user.update({
    where: { id: user.id },
    data: { displayName: normalized.value },
    select: { displayName: true, sessionVersion: true },
  });
  return { ok: true, displayName: updated.displayName, sessionVersion: updated.sessionVersion };
}
