"use client";

import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";

interface TrailbookHeaderProps {
  onLogout: () => Promise<void> | void;
  title: string;
  userLabel: string;
}

export function TrailbookHeader({ onLogout, title, userLabel }: TrailbookHeaderProps) {
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
      <Toolbar sx={{ minHeight: 72 }}>
        <Typography sx={{ flexGrow: 1 }} variant="h6">
          {title}
        </Typography>
        <Box sx={{ alignItems: "center", display: "flex", gap: 2 }}>
          <Typography color="text.secondary" variant="body2">
            {userLabel}
          </Typography>
          <Button onClick={() => void onLogout()} variant="outlined">
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
