import { Suspense } from "react";

import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { ResetPasswordForm } from "../../components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <AuthCard subtitle="Set a new password after validating a reset token." title="Reset password">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </AuthCard>
    </AuthShell>
  );
}
