"use client";

import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  emptyRows,
  getComparator,
  TableEmptyRows,
  TableHeadCustom,
  TableNoData,
  TablePaginationCustom,
  useTable,
} from "../../../components/table";
import { getCurrentUser, getTripOverview, type AuthUser, type UserTripOverview } from "../../../lib/auth-api";

type RangeTab = "total" | "today" | "week" | "month" | "year" | "custom";

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

function getPresetRange(tab: Exclude<RangeTab, "total" | "custom">): RangeSelection {
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

function formatDateOnly(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function ProfileLabel({ profile }: { profile: UserTripOverview["trips"][number]["recordingProfile"] }) {
  return <>{profile.charAt(0).toUpperCase() + profile.slice(1)}</>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card elevation={0} sx={{ border: "1px solid #e6ddcb", flex: 1 }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography color="text.secondary" variant="body2">
            {label}
          </Typography>
          <Typography variant="h4">{value}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

const TABLE_HEAD = [
  { id: "title", label: "Title", minWidth: 200 },
  { id: "recordingProfile", label: "Profile", minWidth: 120 },
  { id: "startedAt", label: "Started", minWidth: 130 },
  { id: "endedAt", label: "Ended", minWidth: 130 },
  { id: "waypointCount", label: "Waypoints", align: "right" as const, minWidth: 110 },
  { id: "photoCount", label: "Photos", align: "right" as const, minWidth: 90 },
  { id: "updatedAt", label: "Updated", minWidth: 130 },
];

export function TripsListView() {
  const router = useRouter();
  const table = useTable({ defaultOrder: "desc", defaultOrderBy: "startedAt", defaultRowsPerPage: 10 });
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [tab, setTab] = useState<RangeTab>("total");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [overview, setOverview] = useState<UserTripOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRange = useMemo<RangeSelection | null>(() => {
    if (tab === "total") {
      return null;
    }

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

  const sortedTrips = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [...overview.trips].sort((a, b) =>
      getComparator(table.order, table.orderBy as keyof (typeof overview.trips)[number])(a, b)
    );
  }, [overview, table.order, table.orderBy]);

  const pagedTrips = useMemo(() => {
    const start = table.page * table.rowsPerPage;
    return sortedTrips.slice(start, start + table.rowsPerPage);
  }, [sortedTrips, table.page, table.rowsPerPage]);

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

        if (result.user.role === "admin") {
          router.replace("/dashboard");
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
    if (user?.role !== "user") {
      return;
    }

    if (tab !== "total" && !selectedRange) {
      return;
    }

    let cancelled = false;
    setOverviewLoading(true);
    setError(null);

    getTripOverview(selectedRange ?? undefined)
      .then((result) => {
        if (!cancelled) {
          setOverview(result);
          table.onResetPage();
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load trips.");
          setOverview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRange, tab, table.onResetPage, user]);

  if (loading) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading trips...</Typography>
        </Stack>
      </Paper>
    );
  }

  if (!user || user.role !== "user") {
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
        <Typography variant="h4">My trips</Typography>
        <Typography color="text.secondary">Server-backed overview of your recorded trips.</Typography>
      </Stack>

      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", overflow: "hidden" }}>
        <Tabs onChange={(_, value: RangeTab) => setTab(value)} value={tab} variant="scrollable">
          <Tab label="Total" value="total" />
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
      {tab !== "total" && !selectedRange ? <Alert severity="warning">Select a valid custom date range.</Alert> : null}

      {overviewLoading && !overview ? (
        <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={28} />
            <Typography color="text.secondary">Loading overview...</Typography>
          </Stack>
        </Paper>
      ) : null}

      {overview ? (
        <>
          <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
            <Stack spacing={1}>
              <Typography variant="h6">{tab === "total" ? "All trips" : "Selected range"}</Typography>
              <Typography color="text.secondary">
                {overview.range.from ? `${formatDateOnly(overview.range.from)} to ${formatDateOnly(overview.range.to)}` : "No date filter"}
              </Typography>
            </Stack>
          </Paper>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <SummaryCard label="Trips" value={`${overview.summary.trips}`} />
            <SummaryCard label="Waypoints" value={`${overview.summary.waypoints}`} />
            <SummaryCard label="Photos" value={`${overview.summary.photos}`} />
          </Stack>

          <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", overflowX: "auto" }}>
            <Table>
              <TableHeadCustom
                headLabel={TABLE_HEAD}
                onSort={table.onSort}
                order={table.order}
                orderBy={table.orderBy}
                rowCount={overview.trips.length}
              />
              <TableBody>
                {pagedTrips.map((trip) => (
                  <TableRow hover key={trip.id}>
                    <TableCell>{trip.title}</TableCell>
                    <TableCell>
                      <ProfileLabel profile={trip.recordingProfile} />
                    </TableCell>
                    <TableCell>{formatDateOnly(trip.startedAt)}</TableCell>
                    <TableCell>{formatDateOnly(trip.endedAt)}</TableCell>
                    <TableCell align="right">{trip.waypointCount}</TableCell>
                    <TableCell align="right">{trip.photoCount}</TableCell>
                    <TableCell>{formatDateOnly(trip.updatedAt)}</TableCell>
                  </TableRow>
                ))}

                <TableEmptyRows
                  emptyRows={emptyRows(table.page, table.rowsPerPage, overview.trips.length)}
                  height={table.dense ? 52 : 72}
                />

                <TableNoData notFound={overview.trips.length === 0} title="No trips found for the selected range." />
              </TableBody>
            </Table>

            <TablePaginationCustom
              count={overview.trips.length}
              dense={table.dense}
              onChangeDense={table.onChangeDense}
              onPageChange={table.onChangePage}
              onRowsPerPageChange={table.onChangeRowsPerPage}
              page={table.page}
              rowsPerPage={table.rowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </Paper>
        </>
      ) : null}
    </Stack>
  );
}
