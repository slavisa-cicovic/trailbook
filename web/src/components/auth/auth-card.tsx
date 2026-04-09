import { Card, CardContent, Stack, Typography } from "@mui/material";
import type { PropsWithChildren, ReactNode } from "react";

interface AuthCardProps extends PropsWithChildren {
  subtitle: string;
  title: string;
  footer?: ReactNode;
}

export function AuthCard({ children, footer, subtitle, title }: AuthCardProps) {
  return (
    <Card elevation={0} sx={{ border: "1px solid #e6ddcb" }}>
      <CardContent sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h4">{title}</Typography>
            <Typography color="text.secondary">{subtitle}</Typography>
          </Stack>
          {children}
          {footer}
        </Stack>
      </CardContent>
    </Card>
  );
}
