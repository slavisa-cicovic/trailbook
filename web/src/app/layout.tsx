import type { PropsWithChildren } from "react";

import { AppThemeProvider } from "../theme/theme-provider";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
