"use client";

import { Alert, Stack, Typography } from "@mui/material";

import { SocialSigninButtons } from "./social-signin-buttons";

export function LoginForm({ verificationStatus }: { verificationStatus?: string }) {
  return (
    <Stack spacing={2}>
      {verificationStatus ? <Alert severity="info">Use a social account to continue.</Alert> : null}
      <Typography color="text.secondary">
        Continue with the account you want to use for Trailbook sync and sharing.
      </Typography>
      <SocialSigninButtons />
    </Stack>
  );
}
