"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Button, Card, CardContent, Chip, CircularProgress, Grid, Paper, Stack, Typography } from "@mui/material";

import { getCurrentUser, getTripDetail, isTripUserRole, type AuthUser, type UserTripDetail } from "../../../lib/auth-api";
import { SharedTripMap } from "../../shared-trips/shared-trip-map";

export function TripDetailView({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>();
  const [detail, setDetail] = useState<UserTripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const setActiveSegment = useCallback((index: number | null) => setActiveSegmentIndex(index), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCurrentUser()
      .then(async ({ user: currentUser }) => {
        if (cancelled) return;
        if (!currentUser) {
          router.replace("/login");
          return;
        }
        setUser(currentUser);
        if (isTripUserRole(currentUser.role)) setDetail(await getTripDetail(tripId));
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load trip.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [router, tripId]);

  const points = useMemo(() => detail?.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude, timestamp: point.recordedAt })) ?? [], [detail]);
  const segments = useMemo(() => detail?.segments.map((segment, index) => ({ endedAt: segment.endedAt ?? segment.startedAt, index, segmentType: segment.recordingProfile.toUpperCase(), startedAt: segment.startedAt })) ?? [], [detail]);
  const waypoints = useMemo(() => detail?.waypoints.map((waypoint) => ({ category: waypoint.category, description: waypoint.note, id: waypoint.localId, images: waypoint.images, latitude: waypoint.latitude, longitude: waypoint.longitude, title: waypoint.title })) ?? [], [detail]);

  if (loading) return <StatusPanel><CircularProgress size={28} /><Typography color="text.secondary">Loading trip...</Typography></StatusPanel>;
  if (!user || !isTripUserRole(user.role)) return <StatusPanel><Typography variant="h5">Redirecting...</Typography></StatusPanel>;
  if (!detail) return <StatusPanel>{error ? <Alert severity="error">{error}</Alert> : null}<Typography variant="h5">Trip not found.</Typography></StatusPanel>;

  return (
    <Stack spacing={4}>
      <Button component={Link} href="/trips" sx={{ alignSelf: "flex-start", px: 0 }} variant="text">Back to trips</Button>
      <Paper elevation={0} sx={{ background: (theme) => theme.palette.mode === "dark" ? "radial-gradient(circle at top left, rgba(128, 174, 119, 0.24), transparent 34rem), linear-gradient(135deg, #1b251b, #101610)" : "radial-gradient(circle at top left, rgba(70, 112, 68, 0.28), transparent 34rem), linear-gradient(135deg, #fff9ee, #e9dfce)", border: "1px solid", borderColor: "divider", borderRadius: 5, overflow: "hidden", p: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography color="primary.main" fontSize={12} fontWeight={900} letterSpacing="0.16em" textTransform="uppercase">My Trailbook trip</Typography>
            <Typography component="h1" sx={{ fontSize: { xs: 40, md: 72 }, fontWeight: 900, letterSpacing: "-0.06em", lineHeight: 0.92 }}>{detail.trip.title}</Typography>
            {detail.trip.description ? <Typography color="text.secondary" sx={{ maxWidth: 780 }} variant="h6">{detail.trip.description}</Typography> : null}
          </Stack>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}><SummaryCard label="Distance" value={formatDistance(detail.summary.distanceMeters)} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><SummaryCard label="Waypoints" value={`${detail.summary.waypointCount}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><SummaryCard label="Photos" value={`${detail.summary.photoCount}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><SummaryCard label="Started" value={formatDate(detail.trip.startedAt)} /></Grid>
          </Grid>
        </Stack>
      </Paper>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <SharedTripMap activeSegmentIndex={activeSegmentIndex} onActiveSegmentIndexChange={setActiveSegment} points={points} segments={segments} waypoints={waypoints} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 4, maxHeight: { lg: 760 }, overflow: "auto", p: 3, position: { lg: "sticky" }, top: { lg: 24 } }}>
            <Stack spacing={2}>
              <Typography variant="h5">Timeline</Typography>
              {detail.segments.length === 0 ? <Typography color="text.secondary">This trip has no segments.</Typography> : detail.segments.map((segment, index) => (
                <Stack alignItems="center" component="button" direction="row" justifyContent="space-between" key={segment.localId} onBlur={() => setActiveSegmentIndex(null)} onFocus={() => setActiveSegmentIndex(index)} onMouseEnter={() => setActiveSegmentIndex(index)} onMouseLeave={() => setActiveSegmentIndex(null)} spacing={2} sx={{ bgcolor: activeSegmentIndex === index ? "action.selected" : "background.paper", border: "1px solid", borderColor: activeSegmentIndex === index ? "secondary.main" : "divider", borderRadius: 3, color: "inherit", cursor: "default", font: "inherit", p: 2, textAlign: "left", width: "100%" }}>
                  <Stack spacing={0.5}>
                    <Chip label={formatProfile(segment.recordingProfile)} size="small" sx={{ alignSelf: "flex-start", fontWeight: 800 }} />
                    <Typography color="text.secondary" variant="body2">{formatDateTime(segment.startedAt)} – {formatDateTime(segment.endedAt)}</Typography>
                  </Stack>
                  <Typography fontWeight={900}>{formatDistance(segment.distanceMeters)}</Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function StatusPanel({ children }: { children: ReactNode }) {
  return <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}><Stack alignItems="center" spacing={2}>{children}</Stack></Paper>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <Card elevation={0} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", height: "100%" }}><CardContent><Typography color="text.secondary" fontSize={12} fontWeight={900} letterSpacing="0.12em" textTransform="uppercase">{label}</Typography><Typography fontWeight={900} sx={{ mt: 0.5 }} variant="h5">{value}</Typography></CardContent></Card>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "In progress";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatProfile(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
