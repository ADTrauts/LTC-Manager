import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  return (
    <HarborAuthFrame
      title="Set a new password"
      description="Choose a new password, then sign in to continue running your facility."
    >
      <ResetPasswordForm token={token} />
    </HarborAuthFrame>
  );
}
