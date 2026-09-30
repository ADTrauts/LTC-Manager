import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { VerifyEmailClient } from "@/components/verify-email-client";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  return (
    <HarborAuthFrame
      title="Verify your email"
      description="Confirming your address so you can start setting up your facility."
    >
      <VerifyEmailClient token={token} />
    </HarborAuthFrame>
  );
}
