import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/auth/login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: {
    verification?: string;
  };
}) {
  return (
    <AuthShell>
      <AuthCard subtitle="Use local credentials or continue with a supported social account." title="Login">
        <LoginForm verificationStatus={searchParams?.verification} />
      </AuthCard>
    </AuthShell>
  );
}
