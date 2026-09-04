"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack, Typography } from "@mui/material";

import { SocialSigninButtons } from "./social-signin-buttons";
import { getSocialAuthProviders, loginWithLocalAccount, type LocalAccount } from "../../lib/auth-api";

export function LoginForm({ verificationStatus }: { verificationStatus?: string }) {
  const router = useRouter();
  const [localAccounts, setLocalAccounts] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getSocialAuthProviders()
      .then((providers) => setLocalAccounts(providers.localAccounts ?? []))
      .catch(() => setLocalAccounts([]));
  }, []);

  async function localLogin(account: LocalAccount) {
    setError("");
    try {
      const result = await loginWithLocalAccount(account);
      router.push(result.user.role === "admin" ? "/dashboard" : "/trips");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Local login failed.");
    }
  }

  return (
    <Stack spacing={2}>
      {verificationStatus ? <Alert severity="info">Use a social account to continue.</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {localAccounts.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography color="text.secondary">Choose a local test account.</Typography>
          {localAccounts.includes("scaichat") ? (
            <Button onClick={() => void localLogin("scaichat")} variant="contained">
              Continue as scaichat (admin)
            </Button>
          ) : null}
          {localAccounts.includes("slavisacicovic") ? (
            <Button onClick={() => void localLogin("slavisacicovic")} variant="outlined">
              Continue as slavisacicovic
            </Button>
          ) : null}
        </Stack>
      ) : (
        <>
          <Typography color="text.secondary">
            Continue with the account you want to use for Trailbook sync and sharing.
          </Typography>
          <SocialSigninButtons />
        </>
      )}
    </Stack>
  );
}
