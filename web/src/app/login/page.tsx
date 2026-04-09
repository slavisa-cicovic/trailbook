import { Button, Divider, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";

import { AuthCard } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";
import { SocialSigninButtons } from "../../components/auth/social-signin-buttons";

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthCard
        subtitle="Use local credentials or continue with a supported social account."
        title="Login"
        footer={
          <Stack direction="row" justifyContent="space-between">
            <MuiLink component={Link} href="/forgot-password" underline="hover">
              Forgot password?
            </MuiLink>
            <MuiLink component={Link} href="/register" underline="hover">
              Create account
            </MuiLink>
          </Stack>
        }
      >
        <Stack spacing={2}>
          <TextField fullWidth label="Email" type="email" />
          <TextField fullWidth label="Password" type="password" />
          <Button size="large" variant="contained">
            Login
          </Button>
        </Stack>
        <Divider>or</Divider>
        <SocialSigninButtons />
      </AuthCard>
    </AuthShell>
  );
}
