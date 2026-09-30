import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { CheckEmailForm } from "@/components/check-email-form";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const initialEmail = typeof params.email === "string" ? params.email : undefined;

  return (
    <HarborAuthFrame
      title="Check your email"
      description="Confirm your address to finish creating your Vssyl facility account."
    >
      <CheckEmailForm initialEmail={initialEmail} />
    </HarborAuthFrame>
  );
}
