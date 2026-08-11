"use client";

import { CssBaseline, ThemeProvider, createTheme, useMediaQuery } from "@mui/material";
import { type PropsWithChildren, useMemo } from "react";

export function AppThemeProvider({ children }: PropsWithChildren) {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)", { noSsr: true });
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? "dark" : "light",
          primary: {
            main: prefersDarkMode ? "#b9d6b1" : "#243224",
          },
          secondary: {
            main: prefersDarkMode ? "#f2a45f" : "#d8751f",
          },
          background: prefersDarkMode
            ? { default: "#101610", paper: "#182018" }
            : { default: "#f5f1e8", paper: "#fffdf8" },
          divider: prefersDarkMode ? "#3a4639" : "#e6ddcb",
        },
        shape: {
          borderRadius: 16,
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              ":root": {
                colorScheme: prefersDarkMode ? "dark" : "light",
              },
              ".gm-style .gm-style-iw-c, .gm-style .gm-style-iw-tc::after": {
                backgroundColor: prefersDarkMode ? "#182018" : "#fffdf8",
                color: prefersDarkMode ? "#f5f1e8" : "#201b14",
              },
              ".gm-style .gm-style-iw-d": {
                overflow: "auto !important",
              },
              ".gm-style button.gm-ui-hover-effect": {
                backgroundColor: prefersDarkMode ? "#f5f1e8 !important" : "#243224 !important",
                borderRadius: "999px !important",
                height: "32px !important",
                opacity: "1 !important",
                right: "4px !important",
                top: "4px !important",
                width: "32px !important",
              },
              ".gm-style button.gm-ui-hover-effect span": {
                backgroundColor: prefersDarkMode ? "#182018 !important" : "#fffdf8 !important",
                height: "18px !important",
                margin: "7px !important",
                width: "18px !important",
              },
            },
          },
        },
      }),
    [prefersDarkMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
