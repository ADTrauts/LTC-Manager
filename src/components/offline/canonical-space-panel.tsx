import type { FacilitySession } from "@/lib/auth";
import type { SpaceScope } from "@/lib/offline/space/contract";
export function SpaceIdentityBoundary({ session }: {
    session: {
        uid: string;
        authKind: string;
        scopeKind?: string;
        facilityId?: string;
        sessionVersion?: number;
    } | null;
}) {
    const identity = session ? `${session.authKind}:${session.uid}:${session.scopeKind}:${session.facilityId || ""}:${session.sessionVersion}` : "signed-out";
    return <><span hidden data-space-identity={identity}/></>;
}
export function CanonicalSpacePanel({ scope, session }: {
    scope: SpaceScope;
    session: FacilitySession;
}) {
    return <div data-testid="canonical-space-offline" data-space-offline={JSON.stringify({ scope, actorRef: `${session.authKind}:${session.uid}`, sessionVersion: session.sessionVersion })}>Preparing offline controls…</div>;
}
