import { Container, Link, Paper, Stack, Typography } from "@mui/material";
import type { PropsWithChildren, ReactNode } from "react";

export function LegalPage({
  children,
  title,
}: PropsWithChildren<{ title: string }>) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Paper elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 4, p: { xs: 3, md: 6 } }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography component="h1" variant="h3">{title}</Typography>
            <Typography color="text.secondary">Effective July 14, 2026</Typography>
          </Stack>
          {children}
          <Typography color="text.secondary" variant="body2">
            Questions can be sent to{" "}
            <Link href="mailto:sc.trailbook@gmail.com">sc.trailbook@gmail.com</Link>.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Stack component="section" spacing={1}>
      <Typography component="h2" variant="h5">{title}</Typography>
      <Typography color="text.secondary" component="div" sx={{ lineHeight: 1.75 }}>
        {children}
      </Typography>
    </Stack>
  );
}
