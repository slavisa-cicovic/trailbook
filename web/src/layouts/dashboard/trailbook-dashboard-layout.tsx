"use client";

import { Alert, Box, CircularProgress, Drawer, Stack, Typography } from "@mui/material";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useState } from "react";

import { getCurrentUser, logout, type AuthUser } from "../../lib/auth-api";
import { TrailbookHeader } from "./trailbook-header";
import { TrailbookSidebar } from "./trailbook-sidebar";

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard")) {
    return "Dashboard";
  }

  if (pathname.startsWith("/trips")) {
    return "My trips";
  }

  return "Trailbook";
}

export function TrailbookDashboardLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const title = useMemo(() => getPageTitle(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.user) {
          router.replace("/login");
          setUser(null);
          return;
        }

        setUser(result.user);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load current user.");
        setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  if (user === undefined) {
    return (
      <Box sx={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100vh" }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading workspace...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100vh", p: 4 }}>
        <Stack spacing={2} sx={{ width: "100%", maxWidth: 520 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="h5">Redirecting...</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "#faf7f1", display: "flex", minHeight: "100vh" }}>
      <Box sx={{ display: { xs: "none", md: "block" }, flexShrink: 0 }}>
        <TrailbookSidebar user={user} />
      </Box>
      <Drawer
        ModalProps={{ keepMounted: true }}
        onClose={() => setMobileNavigationOpen(false)}
        open={mobileNavigationOpen}
        slotProps={{ paper: { sx: { width: 220 } } }}
      >
        <TrailbookSidebar onNavigate={() => setMobileNavigationOpen(false)} user={user} />
      </Drawer>
      <Box sx={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
        <TrailbookHeader
          onLogout={handleLogout}
          onMenuOpen={() => setMobileNavigationOpen(true)}
          title={title}
          userLabel={user.email}
        />
        <Box sx={{ flex: 1, p: { xs: 2, sm: 3, lg: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
