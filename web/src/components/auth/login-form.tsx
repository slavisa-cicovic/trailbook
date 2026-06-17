"use client";

import { Alert, Button, Divider, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { isTripUserRole, login } from "../../lib/auth-api";
import { SocialSigninButtons } from "./social-signin-buttons";

export function LoginForm({ verificationStatus }: { verificationStatus?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await login({ email, password });
      router.push(isTripUserRole(result.user.role) ? "/trips" : "/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        {verificationStatus === "verified" ? (
          <Alert severity="success">Email verified. You can log in now.</Alert>
        ) : null}
        {verificationStatus === "check-email" ? (
          <Alert severity="info">Check your email and verify your address before logging in.</Alert>
        ) : null}
        {verificationStatus && verificationStatus !== "verified" && verificationStatus !== "check-email" ? (
          <Alert severity="error">Email verification failed. Request a new link or try again.</Alert>
        ) : null}
        <TextField fullWidth label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <TextField
          fullWidth
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Button disabled={submitting} size="large" type="submit" variant="contained">
          {submitting ? "Logging in..." : "Login"}
        </Button>
      </Stack>
      <Divider>or</Divider>
      <SocialSigninButtons />
      <Stack direction="row" justifyContent="space-between">
        <MuiLink component={Link} href="/forgot-password" underline="hover">
          Forgot password?
        </MuiLink>
        <MuiLink component={Link} href="/register" underline="hover">
          Create account
        </MuiLink>
      </Stack>
    </>
  );
}
