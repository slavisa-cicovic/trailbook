import { Container, Paper, Stack, Typography } from "@mui/material";

export default function DashboardPage() {
  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack spacing={1.5}>
          <Typography variant="h4">Authenticated shell</Typography>
          <Typography color="text.secondary">
            This placeholder exists only to prove the first auth-focused web phase.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
