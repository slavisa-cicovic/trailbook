"use client";

import { Alert, Button, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { resetPassword } from "../../lib/auth-api";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await resetPassword({ token, password });
      setSubmitted(true);
      router.push("/login?reset=1");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Reset failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        <TextField fullWidth label="Reset token" value={token} onChange={(event) => setToken(event.target.value)} />
        <TextField
          fullWidth
          label="New password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          fullWidth
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        {submitted ? <Alert severity="success">Password updated. Redirecting to login.</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Button disabled={submitting} size="large" type="submit" variant="contained">
          {submitting ? "Updating..." : "Update password"}
        </Button>
      </Stack>
      <MuiLink component={Link} href="/login" underline="hover">
        Back to login
      </MuiLink>
    </>
  );
}
