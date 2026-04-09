import { Button, Divider, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";

import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { SocialSigninButtons } from "../../components/auth/social-signin-buttons";

export default function RegisterPage() {
  return (
    <AuthShell>
      <AuthCard
        subtitle="Create a local account or start with a supported social identity."
        title="Register"
        footer={
          <MuiLink component={Link} href="/login" underline="hover">
            Already have an account?
          </MuiLink>
        }
      >
        <Stack spacing={2}>
          <TextField fullWidth label="Display name" />
          <TextField fullWidth label="Email" type="email" />
          <TextField fullWidth label="Password" type="password" />
          <Button size="large" variant="contained">
            Create account
          </Button>
        </Stack>
        <Divider>or</Divider>
        <SocialSigninButtons />
      </AuthCard>
    </AuthShell>
  );
}
