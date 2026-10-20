import { requireFacilitySession } from "@/lib/facility-context";
import { requireHarborStaff, peekHarborWorkFacilityId } from "@/lib/harbor-console/auth";
import type { Actor } from "./authority";
export async function customerActor(): Promise<Actor> { return { kind: "customer", session: await requireFacilitySession() }; }
export async function consoleActor(): Promise<Actor> { return { kind: "staff", session: await requireHarborStaff(), workFacilityId: await peekHarborWorkFacilityId() }; }
