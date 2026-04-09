"use client";

import { useEffect, useState } from "react";
import { Button, Stack } from "@mui/material";

import {
  getSocialAuthProviders,
  getSocialAuthStartUrl,
  type SocialAuthAvailability,
  type SocialAuthProvider,
} from "../../lib/auth-api";

const providers: Array<{ label: string; provider: SocialAuthProvider }> = [
  { label: "Continue with Google", provider: "google" },
  { label: "Continue with Apple", provider: "apple" },
  { label: "Continue with Facebook", provider: "facebook" },
];

const defaultAvailability: SocialAuthAvailability = {
  google: false,
  apple: false,
  facebook: false,
};

export function SocialSigninButtons() {
  const [availability, setAvailability] = useState<SocialAuthAvailability>(defaultAvailability);

  useEffect(() => {
    let cancelled = false;

    getSocialAuthProviders()
      .then((result) => {
        if (!cancelled) {
          setAvailability(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability(defaultAvailability);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack spacing={1.5}>
      {providers.map((provider) => {
        const enabled = availability[provider.provider];

        return (
          <Button
            color="inherit"
            component="a"
            disabled={!enabled}
            href={enabled ? getSocialAuthStartUrl(provider.provider) : undefined}
            key={provider.provider}
            variant="outlined"
          >
            {provider.label}
          </Button>
        );
      })}
    </Stack>
  );
}
