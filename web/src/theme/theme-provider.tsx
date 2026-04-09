"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { PropsWithChildren } from "react";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#243224",
    },
    secondary: {
      main: "#d8751f",
    },
    background: {
      default: "#f5f1e8",
      paper: "#fffdf8",
    },
  },
  shape: {
    borderRadius: 16,
  },
});

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
