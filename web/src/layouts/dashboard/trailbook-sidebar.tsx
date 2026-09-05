"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AuthUser } from "../../lib/auth-api";

interface TrailbookSidebarProps {
  onNavigate?: () => void;
  user: AuthUser;
}

interface NavItem {
  adminOnly?: boolean;
  href: string;
  label: string;
}

const navItems: NavItem[] = [
  { adminOnly: true, href: "/dashboard", label: "Dashboard" },
  { href: "/trips", label: "My trips" },
];

export function TrailbookSidebar({ onNavigate, user }: TrailbookSidebarProps) {
  const pathname = usePathname();

  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly && user.role !== "admin") {
      return false;
    }

    return true;
  });

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderRight: "1px solid #e6ddcb",
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        p: 2,
        position: "sticky",
        top: 0,
        width: 220,
      }}
    >
      <Stack spacing={0.5} sx={{ mb: 4, px: 1, py: 1 }}>
        <Box
          component={Link}
          href="/"
          onClick={onNavigate}
          sx={{ alignItems: "center", color: "text.primary", display: "flex", gap: 1, textDecoration: "none" }}
        >
          <Image src="/favicon-256.png" alt="" width={32} height={32} />
          <Typography variant="h6">Trailbook</Typography>
        </Box>
        <Typography color="text.secondary" variant="body2">
          {user.role === "admin" ? "Admin workspace" : "User workspace"}
        </Typography>
      </Stack>

      <Stack spacing={1}>
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Button
              color={active ? "primary" : "inherit"}
              component={Link}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
              sx={{ justifyContent: "flex-start" }}
              variant={active ? "contained" : "text"}
            >
              {item.label}
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
}
