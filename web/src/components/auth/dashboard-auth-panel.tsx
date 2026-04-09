"use client";

import { Alert, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getCurrentUser, logout, type AuthUser } from "../../lib/auth-api";

export function DashboardAuthPanel() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((result) => {
        if (!cancelled) {
          setUser(result.user);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load auth state.");
          setUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  if (user === undefined) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading auth state...</Typography>
        </Stack>
      </Paper>
    );
  }

  if (!user) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="h4">Not signed in</Typography>
          <Typography color="text.secondary">
            Use the real server-backed login flow to start an authenticated browser session.
          </Typography>
          <Button component={Link} href="/login" variant="contained">
            Go to login
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
      <Stack spacing={1.5}>
        <Typography variant="h4">Welcome back, {user.displayName}</Typography>
        <Typography color="text.secondary">Signed in as {user.email}</Typography>
        <Typography color="text.secondary">Role: {user.role}</Typography>
        <Typography color="text.secondary">Providers: {user.providers.join(", ")}</Typography>
        <Button disabled={loggingOut} onClick={handleLogout} sx={{ alignSelf: "flex-start" }} variant="outlined">
          {loggingOut ? "Logging out..." : "Logout"}
        </Button>
      </Stack>
    </Paper>
  );
}
