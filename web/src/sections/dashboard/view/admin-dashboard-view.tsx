"use client";

import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getAdminDashboardMetrics, getCurrentUser, type AdminDashboardMetrics, type AuthUser } from "../../../lib/auth-api";

type RangeTab = "today" | "week" | "month" | "year" | "custom";

interface RangeSelection {
  from: string;
  to: string;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toStartOfDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

function getPresetRange(tab: Exclude<RangeTab, "custom">): RangeSelection {
  const now = new Date();

  switch (tab) {
    case "today": {
      const from = startOfDay(now);
      return { from: from.toISOString(), to: addDays(from, 1).toISOString() };
    }
    case "week": {
      const from = startOfWeek(now);
      return { from: from.toISOString(), to: addDays(from, 7).toISOString() };
    }
    case "month": {
      const from = startOfMonth(now);
      return { from: from.toISOString(), to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString() };
    }
    case "year": {
      const from = startOfYear(now);
      return { from: from.toISOString(), to: new Date(now.getFullYear() + 1, 0, 1).toISOString() };
    }
  }
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatAverage(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatDateOnly(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
      <Card elevation={0} sx={{ border: "1px solid #e6ddcb", height: "100%" }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography color="text.secondary" variant="body2">
              {label}
            </Typography>
            <Typography variant="h4">{value}</Typography>
            {helper ? (
              <Typography color="text.secondary" variant="body2">
                {helper}
              </Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  );
}

export function AdminDashboardView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [tab, setTab] = useState<RangeTab>("month");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRange = useMemo<RangeSelection | null>(() => {
    if (tab === "custom") {
      if (!customFrom || !customTo) {
        return null;
      }

      const from = toStartOfDateInput(customFrom);
      const to = addDays(toStartOfDateInput(customTo), 1);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() >= to.getTime()) {
        return null;
      }

      return {
        from: from.toISOString(),
        to: to.toISOString(),
      };
    }

    return getPresetRange(tab);
  }, [customFrom, customTo, tab]);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.user) {
          router.replace("/login");
          setUser(null);
          return;
        }

        if (result.user.role !== "admin") {
          router.replace("/trips");
          setUser(result.user);
          return;
        }

        setUser(result.user);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load current user.");
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (user?.role !== "admin" || !selectedRange) {
      return;
    }

    let cancelled = false;
    setMetricsLoading(true);
    setError(null);

    getAdminDashboardMetrics(selectedRange)
      .then((result) => {
        if (!cancelled) {
          setMetrics(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard metrics.");
          setMetrics(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMetricsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRange, user]);

  if (loading) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading dashboard...</Typography>
        </Stack>
      </Paper>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="h5">Redirecting...</Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4">Admin dashboard</Typography>
        <Typography color="text.secondary">
          Signed in as {user.email}. Metrics always use the selected tab range.
        </Typography>
      </Stack>

      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", overflow: "hidden" }}>
        <Tabs onChange={(_, value: RangeTab) => setTab(value)} value={tab} variant="scrollable">
          <Tab label="Today" value="today" />
          <Tab label="This week" value="week" />
          <Tab label="This month" value="month" />
          <Tab label="This year" value="year" />
          <Tab label="Custom" value="custom" />
        </Tabs>
      </Paper>

      {tab === "custom" ? (
        <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              InputLabelProps={{ shrink: true }}
              label="From"
              onChange={(event) => setCustomFrom(event.target.value)}
              type="date"
              value={customFrom}
            />
            <TextField
              InputLabelProps={{ shrink: true }}
              label="To"
              onChange={(event) => setCustomTo(event.target.value)}
              type="date"
              value={customTo}
            />
          </Stack>
        </Paper>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}

      {!selectedRange ? <Alert severity="warning">Select a valid custom date range.</Alert> : null}

      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
        <Stack spacing={1}>
          <Typography variant="h6">Selected range</Typography>
          <Typography color="text.secondary">
            {formatDateOnly(metrics?.range.from ?? selectedRange?.from ?? "")} to{" "}
            {formatDateOnly(metrics?.range.to ?? selectedRange?.to ?? "")}
          </Typography>
        </Stack>
      </Paper>

      {metricsLoading && !metrics ? (
        <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={28} />
            <Typography color="text.secondary">Loading metrics...</Typography>
          </Stack>
        </Paper>
      ) : null}

      {metrics ? (
        <Box>
          <Grid container spacing={2}>
            <MetricCard label="Total users" value={`${metrics.overview.totalUsers}`} />
            <MetricCard label="New users" value={`${metrics.overview.newUsers}`} />
            <MetricCard label="Trips created" value={`${metrics.overview.tripsCreated}`} />
            <MetricCard
              helper={`${metrics.overview.totalTripPoints} total trip points`}
              label="Avg trip points / trip"
              value={formatAverage(metrics.overview.averageTripPointsPerTrip)}
            />
            <MetricCard label="Photos created" value={`${metrics.overview.photosCreated}`} />
            <MetricCard label="Photo storage" value={formatBytes(metrics.overview.totalPhotoBytes)} />
          </Grid>
        </Box>
      ) : null}
    </Stack>
  );
}
