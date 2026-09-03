import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

import { AppThemeProvider } from "../theme/theme-provider";

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64" },
      { url: "/favicon-256.png", sizes: "256x256", type: "image/png" },
    ],
    apple: [{ url: "/icon.png", sizes: "1024x1024", type: "image/png" }],
  },
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
