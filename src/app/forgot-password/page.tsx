import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <HarborAuthFrame
      title="Forgot your password?"
      description="We’ll email a one-time link so you can choose a new password for your Vssyl account."
    >
      <ForgotPasswordForm />
    </HarborAuthFrame>
  );
}
