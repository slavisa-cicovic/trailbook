"use client";

import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { TableHeadCustom, TableNoData } from "../../../components/table";
import { getCurrentUser, getTripDetail, type AuthUser, type UserTripDetail } from "../../../lib/auth-api";
import { TripRoutePreview } from "./trip-route-preview";

const TIMELINE_HEAD = [
  { id: "recordingProfile", label: "Profile", minWidth: 120 },
  { id: "startedAt", label: "Start", minWidth: 130 },
  { id: "endedAt", label: "End", minWidth: 130 },
  { id: "distanceMeters", label: "Distance", minWidth: 120, align: "right" as const },
];

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

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDistanceKm(distanceMeters: number) {
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function formatProfile(value: UserTripDetail["trip"]["recordingProfile"]) {
  if (value === "stationary") {
    return "Pause";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
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

interface TripDetailViewProps {
  tripId: string;
}

export function TripDetailView({ tripId }: TripDetailViewProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [detail, setDetail] = useState<UserTripDetail | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load current user.");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
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

    let cancelled = false;
    setDetailLoading(true);
    setError(null);

    getTripDetail(tripId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load trip.");
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, user]);

  const timelineRows = useMemo(() => detail?.segments ?? [], [detail]);

  if (authLoading || detailLoading) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading trip...</Typography>
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

  if (!detail) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="h5">Trip not found.</Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack alignItems={{ md: "center" }} direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
        <Stack spacing={1}>
          <Button component={Link} href="/trips" sx={{ alignSelf: "flex-start", px: 0 }} variant="text">
            Back to trips
          </Button>
          <Typography variant="h4">{detail.trip.title}</Typography>
          <Typography color="text.secondary">
            {formatProfile(detail.trip.recordingProfile)} trip • {formatDateTime(detail.trip.startedAt)}
          </Typography>
        </Stack>
        <Button component={Link} href={`/trips/${detail.trip.id}/edit`} variant="contained">
          Edit trip
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 2 }}>
        <TripRoutePreview
          points={detail.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }))}
          waypoints={detail.waypoints.map((waypoint) => ({ latitude: waypoint.latitude, longitude: waypoint.longitude }))}
        />
      </Paper>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <SummaryCard label="Distance" value={formatDistanceKm(detail.summary.distanceMeters)} />
        <SummaryCard label="Waypoints" value={`${detail.summary.waypointCount}`} />
        <SummaryCard label="Photos" value={`${detail.summary.photoCount}`} />
        <SummaryCard label="Segments" value={`${detail.summary.segmentCount}`} />
      </Stack>

      <Stack direction={{ xs: "column", xl: "row" }} spacing={2}>
        <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", flex: 1, p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h6">Trip details</Typography>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>Profile</TableCell>
                  <TableCell>{formatProfile(detail.trip.recordingProfile)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Started</TableCell>
                  <TableCell>{formatDateTime(detail.trip.startedAt)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Ended</TableCell>
                  <TableCell>{formatDateTime(detail.trip.endedAt)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Updated</TableCell>
                  <TableCell>{formatDateTime(detail.trip.updatedAt)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Sync status</TableCell>
                  <TableCell>{detail.trip.syncStatus}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Description</TableCell>
                  <TableCell>{detail.trip.description || "—"}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", flex: 1, p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h6">Waypoints</Typography>
            {detail.waypoints.length > 0 ? (
              <Table size="small">
                <TableBody>
                  {detail.waypoints.slice(0, 8).map((waypoint) => (
                    <TableRow key={waypoint.localId}>
                      <TableCell>{waypoint.title}</TableCell>
                      <TableCell>{formatDateOnly(waypoint.recordedAt)}</TableCell>
                      <TableCell align="right">{waypoint.photoCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography color="text.secondary">This trip has no waypoints.</Typography>
            )}
          </Stack>
        </Paper>
      </Stack>

      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", overflowX: "auto" }}>
        <Stack spacing={2} sx={{ p: 3, pb: 0 }}>
          <Typography variant="h6">Timeline</Typography>
        </Stack>
        <Table>
          <TableHeadCustom headLabel={TIMELINE_HEAD} />
          <TableBody>
            {timelineRows.map((segment) => (
              <TableRow hover key={segment.localId}>
                <TableCell>{formatProfile(segment.recordingProfile)}</TableCell>
                <TableCell>{formatDateTime(segment.startedAt)}</TableCell>
                <TableCell>{formatDateTime(segment.endedAt)}</TableCell>
                <TableCell align="right">{formatDistanceKm(segment.distanceMeters)}</TableCell>
              </TableRow>
            ))}
            <TableNoData notFound={timelineRows.length === 0} title="This trip has no segments." />
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
