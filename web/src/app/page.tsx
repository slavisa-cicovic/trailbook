import { Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";

export default function HomePage() {
  return (
    <Container maxWidth="sm" sx={{ py: 10 }}>
      <Stack spacing={3}>
        <Typography variant="h3">Trailbook Auth Bootstrap</Typography>
        <Typography color="text.secondary">
          This web workspace is intentionally limited to authentication in the current phase.
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button component={Link} href="/login" variant="contained">
            Login
          </Button>
          <Button component={Link} href="/register" variant="outlined">
            Register
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
