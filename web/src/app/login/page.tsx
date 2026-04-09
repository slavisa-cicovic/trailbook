import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthCard subtitle="Use local credentials or continue with a supported social account." title="Login">
        <LoginForm />
      </AuthCard>
    </AuthShell>
  );
}
