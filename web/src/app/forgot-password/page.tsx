import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { ForgotPasswordForm } from "../../components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthCard subtitle="Request a password reset link for your Trailbook account." title="Forgot password">
        <ForgotPasswordForm />
      </AuthCard>
    </AuthShell>
  );
}
