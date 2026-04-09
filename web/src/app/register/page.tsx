import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { RegisterForm } from "../../components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell>
      <AuthCard subtitle="Create a local account or start with a supported social identity." title="Register">
        <RegisterForm />
      </AuthCard>
    </AuthShell>
  );
}
