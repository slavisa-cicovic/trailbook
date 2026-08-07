"use client";

import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";

interface TrailbookHeaderProps {
  onMenuOpen: () => void;
  onLogout: () => Promise<void> | void;
  title: string;
  userLabel: string;
}

export function TrailbookHeader({ onLogout, onMenuOpen, title, userLabel }: TrailbookHeaderProps) {
  return (
    <AppBar
      color="inherit"
      elevation={0}
      position="sticky"
      sx={{
        bgcolor: "background.paper",
        borderBottom: "1px solid #e6ddcb",
      }}
    >
      <Toolbar sx={{ gap: 1, minHeight: { xs: 60, md: 72 }, px: { xs: 2, sm: 3 } }}>
        <Button
          aria-label="Open navigation"
          onClick={onMenuOpen}
          size="small"
          sx={{ display: { md: "none" }, minWidth: 0, px: 1 }}
          variant="outlined"
        >
          Menu
        </Button>
        <Typography noWrap sx={{ flexGrow: 1, minWidth: 0 }} variant="h6">
          {title}
        </Typography>
        <Box sx={{ alignItems: "center", display: "flex", gap: { xs: 1, sm: 2 }, minWidth: 0 }}>
          <Typography color="text.secondary" noWrap sx={{ display: { xs: "none", sm: "block" }, maxWidth: 240 }} variant="body2">
            {userLabel}
          </Typography>
          <Button onClick={() => void onLogout()} size="small" variant="outlined">
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
