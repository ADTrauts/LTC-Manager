import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  return (
    <HarborAuthFrame
      title="Accept your invite"
      description="Set a password to start using Vssyl for your facility."
    >
      <AcceptInviteForm token={token} />
    </HarborAuthFrame>
  );
}
