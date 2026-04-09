import { Button, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";

import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthCard
        subtitle="Request a password reset link for your Trailbook account."
        title="Forgot password"
        footer={
          <MuiLink component={Link} href="/login" underline="hover">
            Back to login
          </MuiLink>
        }
      >
        <Stack spacing={2}>
          <TextField fullWidth label="Email" type="email" />
          <Button size="large" variant="contained">
            Send reset link
          </Button>
        </Stack>
      </AuthCard>
    </AuthShell>
  );
}
