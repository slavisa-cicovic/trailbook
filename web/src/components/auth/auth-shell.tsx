import { Container, Link as MuiLink, Stack, Typography } from "@mui/material";
import Image from "next/image";
import Link from "next/link";
import type { PropsWithChildren } from "react";

export function AuthShell({ children }: PropsWithChildren) {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <MuiLink
          component={Link}
          href="/"
          sx={{ alignItems: "center", alignSelf: "flex-start", color: "text.primary", display: "flex", gap: 1.25, textDecoration: "none" }}
        >
          <Image src="/favicon-256.png" alt="" width={42} height={42} priority />
          <Typography component="span" fontFamily="serif" fontSize={24} fontWeight={800}>
            Trailbook
          </Typography>
        </MuiLink>
        {children}
        <MuiLink component={Link} href="/" sx={{ alignSelf: "center" }}>
          Back to Trailbook home
        </MuiLink>
      </Stack>
    </Container>
  );
}
