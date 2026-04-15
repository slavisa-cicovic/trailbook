"use client";

import { Alert, Button, Divider, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { register } from "../../lib/auth-api";
import { SocialSigninButtons } from "./social-signin-buttons";

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const result = await register({ displayName, email, password });
      setInfo(`Verification email sent to ${result.email}. Verify it before logging in.`);
      router.push("/login?verification=check-email");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <TextField fullWidth label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <TextField
          fullWidth
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        {info ? <Alert severity="success">{info}</Alert> : null}
        <Button disabled={submitting} size="large" type="submit" variant="contained">
          {submitting ? "Creating..." : "Create account"}
        </Button>
      </Stack>
      <Divider>or</Divider>
      <SocialSigninButtons />
      <MuiLink component={Link} href="/login" underline="hover">
        Already have an account?
      </MuiLink>
    </>
  );
}
