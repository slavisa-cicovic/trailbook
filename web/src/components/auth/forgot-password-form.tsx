"use client";

import { Alert, Button, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";
import { useState } from "react";

import { forgotPassword } from "../../lib/auth-api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await forgotPassword({ email });
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        <TextField fullWidth label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        {submitted ? (
          <Alert severity="success">
            If that email exists, Trailbook has sent a reset link.
          </Alert>
        ) : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Button disabled={submitting} size="large" type="submit" variant="contained">
          {submitting ? "Sending..." : "Send reset link"}
        </Button>
      </Stack>
      <MuiLink component={Link} href="/login" underline="hover">
        Back to login
      </MuiLink>
    </>
  );
}
