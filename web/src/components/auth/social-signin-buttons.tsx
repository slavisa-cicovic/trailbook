import { Button, Stack } from "@mui/material";

const providers = [
  { label: "Continue with Google" },
  { label: "Continue with Apple" },
  { label: "Continue with Facebook" },
] as const;

export function SocialSigninButtons() {
  return (
    <Stack spacing={1.5}>
      {providers.map((provider) => (
        <Button key={provider.label} color="inherit" disabled variant="outlined">
          {provider.label}
        </Button>
      ))}
    </Stack>
  );
}
