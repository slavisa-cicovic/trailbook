import { Button, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";

import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <AuthCard
        subtitle="Set a new password after validating a reset token."
        title="Reset password"
        footer={
          <MuiLink component={Link} href="/login" underline="hover">
            Back to login
          </MuiLink>
        }
      >
        <Stack spacing={2}>
          <TextField fullWidth label="Reset token" />
          <TextField fullWidth label="New password" type="password" />
          <TextField fullWidth label="Confirm new password" type="password" />
          <Button size="large" variant="contained">
            Update password
          </Button>
        </Stack>
      </AuthCard>
    </AuthShell>
  );
}
