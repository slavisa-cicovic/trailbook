import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    verification?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <AuthShell>
      <AuthCard subtitle="Use local credentials or continue with a supported social account." title="Login">
        <LoginForm verificationStatus={resolvedSearchParams?.verification} />
      </AuthCard>
    </AuthShell>
  );
}
