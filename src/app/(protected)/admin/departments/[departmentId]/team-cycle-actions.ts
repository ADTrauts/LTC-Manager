"use server";

export type TeamCycleActionResult =
  | { ok: true; message?: string; teamId?: string; cycleId?: string }
  | { ok: false; message: string; errors?: string[] };

const retired = "A Team does not run a cycle. Author the cycle in Operating Rhythm. Coverage states the staffing need.";

export async function createTeamCycleAction(_formData: FormData): Promise<TeamCycleActionResult> {
  return { ok: false, message: retired };
}

export async function linkTeamCycleAction(_formData: FormData): Promise<TeamCycleActionResult> {
  return { ok: false, message: retired };
}

export async function unlinkTeamCycleAction(_formData: FormData): Promise<TeamCycleActionResult> {
  return { ok: false, message: retired };
}

export async function updateTeamCycleNeedAction(_formData: FormData): Promise<TeamCycleActionResult> {
  return { ok: false, message: retired };
}
