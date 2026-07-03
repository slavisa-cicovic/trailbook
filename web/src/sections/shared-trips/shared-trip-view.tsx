"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { getSharedTrip, type SharedTripData } from "../../lib/shared-trip-api";
import { SharedTripMap } from "./shared-trip-map";

interface SharedTripViewProps {
  token: string;
}

export function SharedTripView({ token }: SharedTripViewProps) {
  const [pin, setPin] = useState("");
  const [data, setData] = useState<SharedTripData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPin = pin.trim();
    if (!/^\d{6}$/.test(normalizedPin)) {
      setError("Enter the 6-digit PIN.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setData(await getSharedTrip(token, normalizedPin));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to open shared trip.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <SharedShell>
        <Paper
          elevation={0}
          sx={{
            border: "1px solid rgba(75, 63, 45, 0.12)",
            borderRadius: 5,
            maxWidth: 520,
            mx: "auto",
            p: { xs: 3, md: 5 },
          }}
        >
          <Stack component="form" onSubmit={onSubmit} spacing={3}>
            <Stack spacing={1}>
              <Typography
                sx={{
                  color: "#52764a",
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Trailbook shared trip
              </Typography>
              <Typography component="h1" fontWeight={900} letterSpacing="-0.04em" variant="h3">
                Enter PIN
              </Typography>
              <Typography color="text.secondary">
                This shared trip is protected. Enter the 6-digit PIN sent by the trip owner.
              </Typography>
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <TextField
              autoComplete="one-time-code"
              autoFocus
              inputProps={{ inputMode: "numeric", maxLength: 6, pattern: "[0-9]*" }}
              label="PIN"
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              value={pin}
            />
            <Button disabled={loading} size="large" type="submit" variant="contained">
              {loading ? "Opening..." : "Open shared trip"}
            </Button>
          </Stack>
        </Paper>
      </SharedShell>
    );
  }

  return <SharedTripContent data={data} />;
}

function SharedTripContent({ data }: { data: SharedTripData }) {
  const { bundle, imagesByWaypointId } = data;
  const totalDistanceM = bundle.segments.reduce(
    (total, segment) => total + (segment.distanceM ?? 0),
    0,
  );
  const totalPhotos = Object.values(imagesByWaypointId).reduce(
    (total, images) => total + images.length,
    0,
  );
  const points = bundle.raw.locations.map((location) => ({
    latitude: location.latitude,
    longitude: location.longitude,
  }));
  const waypoints = bundle.waypoints.map((waypoint) => ({
    description: waypoint.description,
    id: waypoint.id,
    images: imagesByWaypointId[waypoint.id] ?? [],
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    title: waypoint.title,
  }));

  return (
    <SharedShell>
      <Stack spacing={4}>
        <Paper
          elevation={0}
          sx={{
            background:
              "radial-gradient(circle at top left, rgba(70, 112, 68, 0.28), transparent 34rem), linear-gradient(135deg, #fff9ee, #e9dfce)",
            border: "1px solid rgba(75, 63, 45, 0.12)",
            borderRadius: 5,
            overflow: "hidden",
            p: { xs: 3, md: 5 },
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography
                sx={{
                  color: "#52764a",
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Trailbook shared trip
              </Typography>
              <Typography
                component="h1"
                sx={{
                  color: "#201b14",
                  fontSize: { xs: 40, md: 72 },
                  fontWeight: 900,
                  letterSpacing: "-0.06em",
                  lineHeight: 0.92,
                }}
              >
                {bundle.trip.title}
              </Typography>
              {bundle.trip.description ? (
                <Typography color="text.secondary" sx={{ maxWidth: 780 }} variant="h6">
                  {bundle.trip.description}
                </Typography>
              ) : null}
            </Stack>

            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard label="Distance" value={formatDistance(totalDistanceM)} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard label="Waypoints" value={`${bundle.waypoints.length}`} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard label="Photos" value={`${totalPhotos}`} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard label="Started" value={formatDate(bundle.trip.startedAt)} />
              </Grid>
            </Grid>
          </Stack>
        </Paper>

        <SharedTripMap points={points} waypoints={waypoints} />

        <Paper elevation={0} sx={{ border: "1px solid #e4dac9", borderRadius: 4, p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">Timeline</Typography>
            {bundle.segments.length === 0 ? (
              <Typography color="text.secondary">This trip has no segments.</Typography>
            ) : (
              bundle.segments.map((segment) => (
                <Stack
                  alignItems="center"
                  direction="row"
                  justifyContent="space-between"
                  key={`${segment.index}-${segment.startedAt}`}
                  spacing={2}
                  sx={{
                    bgcolor: "#fffaf1",
                    border: "1px solid #eadfcd",
                    borderRadius: 3,
                    p: 2,
                  }}
                >
                  <Stack spacing={0.5}>
                    <Chip
                      label={formatSegmentType(segment.segmentType)}
                      size="small"
                      sx={{ alignSelf: "flex-start", fontWeight: 800 }}
                    />
                    <Typography color="text.secondary" variant="body2">
                      {formatDateTime(segment.startedAt)} - {formatDateTime(segment.endedAt)}
                    </Typography>
                  </Stack>
                  <Typography fontWeight={900}>{formatDistance(segment.distanceM ?? 0)}</Typography>
                </Stack>
              ))
            )}
          </Stack>
        </Paper>
      </Stack>
    </SharedShell>
  );
}

function SharedShell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: "#f6efe3", minHeight: "100vh", py: { xs: 3, md: 6 } }}>
      <Container maxWidth="xl">{children}</Container>
    </Box>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card elevation={0} sx={{ bgcolor: "rgba(255, 250, 241, 0.86)", border: "1px solid #eadfcd", height: "100%" }}>
      <CardContent>
        <Typography color="text.secondary" fontSize={12} fontWeight={900} letterSpacing="0.12em" textTransform="uppercase">
          {label}
        </Typography>
        <Typography fontWeight={900} sx={{ mt: 0.5 }} variant="h5">
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function formatSegmentType(segmentType: string) {
  return segmentType.charAt(0).toUpperCase() + segmentType.slice(1).toLowerCase();
}
