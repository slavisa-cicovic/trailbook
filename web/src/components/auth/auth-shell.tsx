import { Container, Stack } from "@mui/material";
import type { PropsWithChildren } from "react";

export function AuthShell({ children }: PropsWithChildren) {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>{children}</Stack>
    </Container>
  );
}
